import React, { useEffect, useState } from 'react';
import { Calendar, MessageSquare, Send, Trash2, X } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { DEPARTMENTS, Priority, Task, TaskActivity, TaskStatus } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  addTaskActivityDoc,
  createTaskDoc,
  deleteTaskDoc,
  updateTaskDoc,
} from '../../lib/firestoreService';
import { upsertTaskToGoogleCalendar } from '../../lib/googleCalendar';
import { useApp } from '../../context/AppContext';

interface TaskModalProps {
  open: boolean;
  editingTask?: Task | null;
  defaultProjectId?: string | null;
  defaultDate?: string;
  onClose: () => void;
}

const TASK_STATUSES: TaskStatus[] = [
  'Not Started',
  'In Progress',
  'Pending Approval',
  'Under Review',
  'Completed',
  'Delayed',
  'On Hold',
];

const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low'];

export const TaskModal: React.FC<TaskModalProps> = ({
  open,
  editingTask,
  defaultProjectId,
  defaultDate,
  onClose,
}) => {
  const {
    user,
    profile,
    projects,
    tasks,
    employees,
    calendarToken,
    connectGoogleCalendar,
    confirm,
    notify,
  } = useApp();

  const [tab, setTab] = useState<'details' | 'activity'>('details');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [taskCode, setTaskCode] = useState('');
  const [projectId, setProjectId] = useState('');
  const [parentTaskId, setParentTaskId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [responsible, setResponsible] = useState('');
  const [accountable, setAccountable] = useState('');
  const [consultedStr, setConsultedStr] = useState('');
  const [informedStr, setInformedStr] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [plannedStart, setPlannedStart] = useState('2026-11-22');
  const [plannedEnd, setPlannedEnd] = useState('2026-12-05');
  const [actualStart, setActualStart] = useState('');
  const [actualEnd, setActualEnd] = useState('');
  const [weight, setWeight] = useState(15);
  const [priority, setPriority] = useState<Priority>('High');
  const [status, setStatus] = useState<TaskStatus>('Not Started');
  const [progress, setProgress] = useState(0);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [remarks, setRemarks] = useState('');
  const [attachmentsStr, setAttachmentsStr] = useState('');

  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab('details');
    if (editingTask) {
      setTaskCode(editingTask.taskCode);
      setProjectId(editingTask.projectId);
      setParentTaskId(editingTask.parentTaskId || '');
      setName(editingTask.name);
      setDescription(editingTask.description || '');
      setResponsible(editingTask.responsible);
      setAccountable(editingTask.accountable || '');
      setConsultedStr((editingTask.consulted || []).join(', '));
      setInformedStr((editingTask.informed || []).join(', '));
      setDepartment(editingTask.department);
      setPlannedStart(editingTask.plannedStart);
      setPlannedEnd(editingTask.plannedEnd);
      setActualStart(editingTask.actualStart || '');
      setActualEnd(editingTask.actualEnd || '');
      setWeight(editingTask.weight || 10);
      setPriority(editingTask.priority);
      setStatus(editingTask.status);
      setProgress(editingTask.progress);
      setDependencies(editingTask.dependencies || []);
      setRemarks(editingTask.remarks || '');
      setAttachmentsStr((editingTask.attachments || []).join(', '));
    } else {
      const initialProj =
        projects.find((p) => p.id === defaultProjectId) || projects[0];
      const nextNum = tasks.length + 1;
      setTaskCode(`T${String(nextNum).padStart(3, '0')}`);
      setProjectId(initialProj?.id || '');
      setParentTaskId('');
      setName('');
      setDescription('');
      setResponsible(employees[0]?.name || user?.displayName || '');
      setAccountable('Executive Director (ED)');
      setConsultedStr('');
      setInformedStr('');
      setDepartment(initialProj?.department || DEPARTMENTS[0]);
      const start = defaultDate || new Date().toISOString().slice(0, 10);
      setPlannedStart(start);
      setPlannedEnd(start);
      setActualStart('');
      setActualEnd('');
      setWeight(15);
      setPriority('High');
      setStatus('Not Started');
      setProgress(0);
      setDependencies([]);
      setRemarks('');
      setAttachmentsStr('');
    }
  }, [open, editingTask, defaultProjectId, defaultDate, projects, tasks.length, employees, user]);

  // Listen to task activity subcollection when editing an existing task
  useEffect(() => {
    if (!open || !editingTask || !user) {
      setActivities([]);
      return;
    }
    const q = query(
      collection(db, 'tasks', editingTask.id, 'activity'),
      where('ownerId', '==', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: TaskActivity[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<TaskActivity, 'id'>) }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setActivities(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `tasks/${editingTask.id}/activity`)
    );
    return () => unsub();
  }, [open, editingTask, user]);

  if (!open) return null;

  const projectTasks = tasks.filter(
    (t) => t.projectId === projectId && (!editingTask || t.id !== editingTask.id)
  );

  const estimatedDays = (() => {
    try {
      return Math.max(1, differenceInCalendarDays(parseISO(plannedEnd), parseISO(plannedStart)) + 1);
    } catch {
      return 1;
    }
  })();

  const handleProgressChange = (val: number) => {
    setProgress(val);
    if (val === 100) {
      setStatus('Completed');
      if (!actualEnd) setActualEnd(new Date().toISOString().slice(0, 10));
    } else if (val > 0 && status === 'Not Started') {
      setStatus('In Progress');
      if (!actualStart) setActualStart(new Date().toISOString().slice(0, 10));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) {
      notify('error', 'Select a project', 'Every task must belong to an existing project.');
      return;
    }
    if (!name.trim()) {
      notify('error', 'Task name required', 'Please enter a descriptive task name.');
      return;
    }
    if (plannedEnd < plannedStart) {
      notify('error', 'Invalid dates', 'Planned End Date cannot precede Planned Start Date.');
      return;
    }

    setSaving(true);
    try {
      const consulted = consultedStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const informed = informedStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const attachments = attachmentsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (editingTask) {
        await updateTaskDoc(editingTask.id, {
          taskCode: taskCode.trim(),
          projectCode: proj.projectCode,
          parentTaskId: parentTaskId || '',
          name: name.trim(),
          description: description.trim(),
          responsible: responsible.trim() || 'Unassigned',
          accountable: accountable.trim(),
          consulted,
          informed,
          department,
          plannedStart,
          plannedEnd,
          actualStart: actualStart || '',
          actualEnd: actualEnd || '',
          estimatedDays,
          weight: Number(weight) || 10,
          priority,
          status,
          progress: Number(progress) || 0,
          dependencies,
          remarks: remarks.trim(),
          attachments,
        });

        if (editingTask.progress !== progress || editingTask.status !== status) {
          await addTaskActivityDoc(
            user.uid,
            editingTask.id,
            profile?.displayName || user.displayName || 'User',
            'progress_update',
            `Updated status to ${status} (${progress}% complete).`
          );
        }
        notify('success', 'Task updated', `${taskCode} — ${name} synced across calendar and Gantt.`);
      } else {
        const newId = await createTaskDoc(user.uid, {
          taskCode: taskCode.trim(),
          projectId: proj.id,
          projectCode: proj.projectCode,
          parentTaskId: parentTaskId || undefined,
          name: name.trim(),
          description: description.trim(),
          responsible: responsible.trim() || 'Unassigned',
          accountable: accountable.trim(),
          consulted,
          informed,
          department,
          plannedStart,
          plannedEnd,
          actualStart: actualStart || undefined,
          actualEnd: actualEnd || undefined,
          estimatedDays,
          weight: Number(weight) || 10,
          priority,
          status,
          progress: Number(progress) || 0,
          dependencies,
          remarks: remarks.trim(),
          attachments,
          syncStatus: 'not_synced',
          isDemo: false,
        });
        await addTaskActivityDoc(
          user.uid,
          newId,
          profile?.displayName || user.displayName || 'User',
          'status_change',
          `Created task ${taskCode.trim()} under ${proj.projectCode}.`
        );
        notify('success', 'Task created', `${taskCode} added to ${proj.projectCode} and central calendar.`);
      }
      onClose();
    } catch (err) {
      notify('error', 'Failed to save task', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!user || !editingTask || !newComment.trim()) return;
    try {
      await addTaskActivityDoc(
        user.uid,
        editingTask.id,
        profile?.displayName || user.displayName || 'User',
        'comment',
        newComment.trim()
      );
      setNewComment('');
    } catch (err) {
      notify('error', 'Could not post comment', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDelete = async () => {
    if (!editingTask) return;
    const ok = await confirm({
      title: `Delete task ${editingTask.taskCode}?`,
      description: `This permanently removes "${editingTask.name}" from the project plan, Gantt timeline, and central calendar.`,
      confirmLabel: 'Delete Task',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteTaskDoc(editingTask.id);
      notify('success', 'Task deleted', `${editingTask.taskCode} has been removed.`);
      onClose();
    } catch (err) {
      notify('error', 'Failed to delete task', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleSyncSingleToGoogle = async () => {
    if (!editingTask || !user) return;
    const ok = await confirm({
      title: editingTask.googleEventId
        ? 'Update event in Google Calendar?'
        : 'Export task to Google Calendar?',
      description: `Task Master will ${
        editingTask.googleEventId ? 'update the existing' : 'create a new'
      } calendar event in your primary Google Calendar for this task.`,
      items: [`[${editingTask.projectCode}] ${editingTask.taskCode}: ${editingTask.name} (${editingTask.plannedStart} to ${editingTask.plannedEnd})`],
      confirmLabel: 'Sync to Google Calendar',
      tone: 'primary',
    });
    if (!ok) return;

    setSyncing(true);
    try {
      const token = calendarToken || (await connectGoogleCalendar());
      if (!token) return;
      const proj = projects.find((p) => p.id === editingTask.projectId);
      const { googleEventId, updated } = await upsertTaskToGoogleCalendar(token, editingTask, proj);
      const nowIso = new Date().toISOString();
      await updateTaskDoc(editingTask.id, {
        googleEventId,
        syncStatus: 'synced',
        lastSyncedAt: nowIso,
      });
      await addTaskActivityDoc(
        user.uid,
        editingTask.id,
        profile?.displayName || user.displayName || 'User',
        'sync',
        updated
          ? 'Updated linked event in Google Calendar.'
          : 'Exported task as event to Google Calendar.'
      );
      notify(
        'success',
        updated ? 'Google Calendar event updated' : 'Exported to Google Calendar',
        `${editingTask.taskCode} is now synchronized.`
      );
    } catch (err) {
      notify(
        'error',
        'Google Calendar sync failed',
        err instanceof Error && err.message === 'GOOGLE_TOKEN_EXPIRED'
          ? 'Your Google Calendar session expired. Click Connect Google Calendar to re-authenticate.'
          : err instanceof Error
          ? err.message
          : 'Sync error'
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-[#172B4D] dark:text-white truncate">
              {editingTask ? `${editingTask.taskCode} · ${editingTask.name}` : 'Create New Task'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Linked to central calendar, weighted progress analytics, and Gantt chart.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editingTask && (
              <button
                type="button"
                disabled={syncing}
                onClick={handleSyncSingleToGoogle}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#1A73E8] dark:text-blue-400 hover:bg-[#1A73E8]/5 whitespace-nowrap"
              >
                <Calendar className="w-3.5 h-3.5" />
                {syncing ? 'Syncing...' : editingTask.googleEventId ? 'Update GCal' : 'Sync to GCal'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {editingTask && (
          <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-5 text-sm">
            <button
              type="button"
              onClick={() => setTab('details')}
              className={`pb-2.5 font-medium border-b-2 transition-colors ${
                tab === 'details'
                  ? 'border-[#1A73E8] text-[#1A73E8]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Task Specification
            </button>
            <button
              type="button"
              onClick={() => setTab('activity')}
              className={`pb-2.5 font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                tab === 'activity'
                  ? 'border-[#1A73E8] text-[#1A73E8]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Comments &amp; History ({activities.length})
            </button>
          </div>
        )}

        {tab === 'details' ? (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Task ID *
                </label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  value={taskCode}
                  onChange={(e) => setTaskCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Project *
                </label>
                <select
                  required
                  disabled={Boolean(editingTask)}
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    const p = projects.find((x) => x.id === e.target.value);
                    if (p) setDepartment(p.department);
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                >
                  <option value="">Select Project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Task Name *
              </label>
              <input
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter actionable task deliverable"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            {/* RACI Assignment Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Responsible (R) *
                </label>
                <input
                  type="text"
                  required
                  list="task-emp-list"
                  value={responsible}
                  onChange={(e) => setResponsible(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Accountable (A)
                </label>
                <input
                  type="text"
                  list="task-emp-list"
                  value={accountable}
                  onChange={(e) => setAccountable(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Consulted (C, comma sep)
                </label>
                <input
                  type="text"
                  value={consultedStr}
                  onChange={(e) => setConsultedStr(e.target.value)}
                  placeholder="Finance, HR"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Informed (I, comma sep)
                </label>
                <input
                  type="text"
                  value={informedStr}
                  onChange={(e) => setInformedStr(e.target.value)}
                  placeholder="MD, CFO"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <datalist id="task-emp-list">
                {employees.map((e) => (
                  <option key={e.id} value={e.name} />
                ))}
              </datalist>
            </div>

            {/* Schedule Dates */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Planned Start *
                </label>
                <input
                  type="date"
                  required
                  value={plannedStart}
                  onChange={(e) => setPlannedStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Planned End *
                </label>
                <input
                  type="date"
                  required
                  value={plannedEnd}
                  onChange={(e) => setPlannedEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Actual Start
                </label>
                <input
                  type="date"
                  value={actualStart}
                  onChange={(e) => setActualStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Actual Completion
                </label>
                <input
                  type="date"
                  value={actualEnd}
                  onChange={(e) => setActualEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            {/* Status, Priority, Weight, Department */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Task Weight (1–100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            {/* Progress Slider */}
            <div className="p-3.5 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Actual Completion Percentage
                </span>
                <span className="font-mono font-bold text-[#1A73E8] dark:text-blue-400">
                  {progress}% · Est. {estimatedDays} day(s)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => handleProgressChange(Number(e.target.value))}
                className="w-full accent-[#1A73E8]"
              />
            </div>

            {/* Parent Task & Dependencies */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Parent Task (Optional — makes this a Subtask)
                </label>
                <select
                  value={parentTaskId}
                  onChange={(e) => setParentTaskId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">None (Top-Level Task)</option>
                  {projectTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.taskCode} — {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Predecessor Dependencies
                </label>
                <select
                  multiple
                  size={2}
                  value={dependencies}
                  onChange={(e) =>
                    setDependencies(Array.from(e.target.selectedOptions, (opt) => opt.value))
                  }
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {projectTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.taskCode} — {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Remarks / Escalation Notes
                </label>
                <input
                  type="text"
                  maxLength={1000}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Attachments (comma separated filenames)
                </label>
                <input
                  type="text"
                  value={attachmentsStr}
                  onChange={(e) => setAttachmentsStr(e.target.value)}
                  placeholder="SOP_Draft.pdf, Budget.xlsx"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                placeholder="Add a progress comment or status note..."
                className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={handleAddComment}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] text-white text-sm font-medium hover:bg-[#1557B0]"
              >
                <Send className="w-3.5 h-3.5" />
                Post
              </button>
            </div>
            <div className="space-y-3">
              {activities.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                  No comments or history logged for this task yet.
                </p>
              ) : (
                activities.map((a) => (
                  <div
                    key={a.id}
                    className="p-3.5 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span className="font-semibold text-[#172B4D] dark:text-slate-200">
                        {a.authorName}
                      </span>
                      <span className="font-mono">
                        {a.type.replace('_', ' ')} ·{' '}
                        {a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : 'Just now'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{a.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="px-6 py-3.5 bg-[#F7F9FC] dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            {editingTask && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#D93025] hover:bg-[#D93025]/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Task
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            {tab === 'details' && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmit}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[#1A73E8] hover:bg-[#1557B0] text-white disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving...' : editingTask ? 'Save Task' : 'Create Task'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
