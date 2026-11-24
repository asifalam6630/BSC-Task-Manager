import React, { useEffect, useState } from 'react';
import { ArrowRightCircle, Calendar, Plus, Trash2, X } from 'lucide-react';
import { ActionPoint, Meeting, MeetingCategory } from '../../types';
import {
  createMeetingDoc,
  createTaskDoc,
  deleteMeetingDoc,
  updateMeetingDoc,
} from '../../lib/firestoreService';
import { upsertMeetingToGoogleCalendar } from '../../lib/googleCalendar';
import { useApp } from '../../context/AppContext';

interface MeetingModalProps {
  open: boolean;
  editingMeeting?: Meeting | null;
  defaultProjectId?: string | null;
  defaultDate?: string;
  onClose: () => void;
}

const CATEGORIES: MeetingCategory[] = [
  'BOD Meeting',
  'Steering Committee Meeting',
  'Project Review Meeting',
  'Departmental Meeting',
  'Progress Review Meeting',
  'Follow-up Meeting',
];

export const MeetingModal: React.FC<MeetingModalProps> = ({
  open,
  editingMeeting,
  defaultProjectId,
  defaultDate,
  onClose,
}) => {
  const {
    user,
    projects,
    meetings,
    tasks,
    employees,
    calendarToken,
    connectGoogleCalendar,
    confirm,
    notify,
  } = useApp();

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [meetingCode, setMeetingCode] = useState('');
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState<MeetingCategory>('Project Review Meeting');
  const [date, setDate] = useState('2026-11-25');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [venue, setVenue] = useState('');
  const [chairperson, setChairperson] = useState('');
  const [participantsStr, setParticipantsStr] = useState('');
  const [agenda, setAgenda] = useState('');
  const [minutes, setMinutes] = useState('');
  const [actionPoints, setActionPoints] = useState<ActionPoint[]>([]);

  const [newApDesc, setNewApDesc] = useState('');
  const [newApOwner, setNewApOwner] = useState('');
  const [newApDeadline, setNewApDeadline] = useState('2026-12-05');

  useEffect(() => {
    if (!open) return;
    if (editingMeeting) {
      setMeetingCode(editingMeeting.meetingCode);
      setTitle(editingMeeting.title);
      setProjectId(editingMeeting.projectId);
      setCategory(editingMeeting.category);
      setDate(editingMeeting.date);
      setStartTime(editingMeeting.startTime);
      setEndTime(editingMeeting.endTime);
      setVenue(editingMeeting.venue || '');
      setChairperson(editingMeeting.chairperson);
      setParticipantsStr((editingMeeting.participants || []).join(', '));
      setAgenda(editingMeeting.agenda || '');
      setMinutes(editingMeeting.minutes || '');
      setActionPoints(editingMeeting.actionPoints || []);
    } else {
      const initProj = projects.find((p) => p.id === defaultProjectId) || projects[0];
      setMeetingCode(`M-2026-${String(meetings.length + 1).padStart(2, '0')}`);
      setTitle('');
      setProjectId(initProj?.id || '');
      setCategory('Project Review Meeting');
      setDate(defaultDate || new Date().toISOString().slice(0, 10));
      setStartTime('10:00');
      setEndTime('11:00');
      setVenue('Executive Boardroom / Google Meet');
      setChairperson('Executive Director (ED)');
      setParticipantsStr('');
      setAgenda('');
      setMinutes('');
      setActionPoints([]);
    }
    setNewApDesc('');
    setNewApOwner(employees[0]?.name || '');
    setNewApDeadline(defaultDate || '2026-12-05');
  }, [open, editingMeeting, defaultProjectId, defaultDate, projects, meetings.length, employees]);

  if (!open) return null;

  const handleAddActionPoint = () => {
    if (!newApDesc.trim()) return;
    setActionPoints((prev) => [
      ...prev,
      {
        id: `ap_${Date.now()}`,
        description: newApDesc.trim(),
        owner: newApOwner.trim() || 'Unassigned',
        deadline: newApDeadline || date,
        status: 'Open',
      },
    ]);
    setNewApDesc('');
  };

  const handleConvertActionToTask = async (ap: ActionPoint) => {
    if (!user) return;
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) {
      notify('error', 'Project required', 'Select an associated project before converting an action point.');
      return;
    }
    try {
      const nextCode = `T${String(tasks.length + 1).padStart(3, '0')}`;
      const newTaskId = await createTaskDoc(user.uid, {
        taskCode: nextCode,
        projectId: proj.id,
        projectCode: proj.projectCode,
        name: ap.description,
        description: `Converted from meeting ${meetingCode} (${title || 'Project Meeting'}).`,
        responsible: ap.owner,
        accountable: chairperson || proj.projectOwner,
        department: proj.department,
        plannedStart: date,
        plannedEnd: ap.deadline >= date ? ap.deadline : date,
        estimatedDays: 5,
        weight: 10,
        priority: 'High',
        status: ap.status === 'Completed' ? 'Completed' : 'Not Started',
        progress: ap.status === 'Completed' ? 100 : 0,
        syncStatus: 'not_synced',
        isDemo: false,
      });

      const updatedAps = actionPoints.map((item) =>
        item.id === ap.id ? { ...item, convertedTaskId: newTaskId } : item
      );
      setActionPoints(updatedAps);
      if (editingMeeting) {
        await updateMeetingDoc(editingMeeting.id, { actionPoints: updatedAps });
      }
      notify('success', 'Action converted to task', `Created ${nextCode} under ${proj.projectCode} and linked to calendar.`);
    } catch (err) {
      notify('error', 'Conversion failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) {
      notify('error', 'Select a project', 'Meetings must be associated with a project.');
      return;
    }
    if (!title.trim()) {
      notify('error', 'Meeting title required', 'Enter a meeting title.');
      return;
    }
    setSaving(true);
    try {
      const participants = participantsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        meetingCode: meetingCode.trim(),
        title: title.trim(),
        projectId: proj.id,
        projectCode: proj.projectCode,
        category,
        date,
        startTime,
        endTime,
        venue: venue.trim(),
        chairperson: chairperson.trim() || 'Chairperson',
        participants,
        agenda: agenda.trim(),
        minutes: minutes.trim(),
        actionPoints,
      };
      if (editingMeeting) {
        await updateMeetingDoc(editingMeeting.id, payload);
        notify('success', 'Meeting updated', `${payload.meetingCode} saved to central calendar.`);
      } else {
        await createMeetingDoc(user.uid, {
          ...payload,
          syncStatus: 'not_synced',
          isDemo: false,
        });
        notify('success', 'Meeting scheduled', `${payload.title} added to calendar.`);
      }
      onClose();
    } catch (err) {
      notify('error', 'Failed to save meeting', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingMeeting) return;
    const ok = await confirm({
      title: `Delete meeting "${editingMeeting.title}"?`,
      description: 'This removes the meeting, minutes, and action items from Task Master.',
      confirmLabel: 'Delete Meeting',
      tone: 'danger',
    });
    if (!ok) return;
    await deleteMeetingDoc(editingMeeting.id);
    notify('success', 'Meeting deleted');
    onClose();
  };

  const handleSyncToGoogle = async () => {
    if (!editingMeeting) return;
    const ok = await confirm({
      title: editingMeeting.googleEventId
        ? 'Update meeting in Google Calendar?'
        : 'Export meeting to Google Calendar?',
      description: 'This will create or update the scheduled meeting event on your primary Google Calendar.',
      items: [`${editingMeeting.title} · ${editingMeeting.date} (${editingMeeting.startTime}–${editingMeeting.endTime})`],
      confirmLabel: 'Sync to Google Calendar',
      tone: 'primary',
    });
    if (!ok) return;

    setSyncing(true);
    try {
      const token = calendarToken || (await connectGoogleCalendar());
      if (!token) return;
      const proj = projects.find((p) => p.id === editingMeeting.projectId);
      const { googleEventId, updated } = await upsertMeetingToGoogleCalendar(
        token,
        editingMeeting,
        proj
      );
      await updateMeetingDoc(editingMeeting.id, {
        googleEventId,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
      });
      notify(
        'success',
        updated ? 'Google Calendar meeting updated' : 'Meeting exported to Google Calendar',
        `${editingMeeting.meetingCode} is synchronized.`
      );
    } catch (err) {
      notify('error', 'Sync failed', err instanceof Error ? err.message : 'Calendar API error');
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
              {editingMeeting ? `${editingMeeting.meetingCode} · ${editingMeeting.title}` : 'Schedule Governance Meeting'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Meetings automatically appear on the central calendar and support action-to-task conversion.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editingMeeting && (
              <button
                type="button"
                disabled={syncing}
                onClick={handleSyncToGoogle}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#9334E6] dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 whitespace-nowrap"
              >
                <Calendar className="w-3.5 h-3.5" />
                {syncing ? 'Syncing...' : editingMeeting.googleEventId ? 'Update GCal' : 'Sync to GCal'}
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Meeting ID
              </label>
              <input
                type="text"
                required
                value={meetingCode}
                onChange={(e) => setMeetingCode(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Meeting Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Q4 Steering Committee Review"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Associated Project *
              </label>
              <select
                required
                disabled={Boolean(editingMeeting)}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
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
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Meeting Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MeetingCategory)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Start Time
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                End Time
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Chairperson
              </label>
              <input
                type="text"
                value={chairperson}
                onChange={(e) => setChairperson(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Venue / Online Meeting Link
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Boardroom A or https://meet.google.com/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Participants (comma separated)
              </label>
              <input
                type="text"
                value={participantsStr}
                onChange={(e) => setParticipantsStr(e.target.value)}
                placeholder="MD, ED, CFO, Farhana Rahman"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Meeting Agenda
              </label>
              <textarea
                rows={3}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Meeting Minutes
              </label>
              <textarea
                rows={3}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {/* Action Points Tracker */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-semibold text-[#172B4D] dark:text-slate-200 mb-2">
              Action Points ({actionPoints.length})
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-3">
              <input
                type="text"
                value={newApDesc}
                onChange={(e) => setNewApDesc(e.target.value)}
                placeholder="Action point description"
                className="sm:col-span-5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                value={newApOwner}
                onChange={(e) => setNewApOwner(e.target.value)}
                placeholder="Owner"
                className="sm:col-span-3 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="date"
                value={newApDeadline}
                onChange={(e) => setNewApDeadline(e.target.value)}
                className="sm:col-span-2 px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={handleAddActionPoint}
                className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-[#172B4D] dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {actionPoints.length > 0 && (
              <div className="space-y-2">
                {actionPoints.map((ap) => (
                  <div
                    key={ap.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#172B4D] dark:text-slate-100">{ap.description}</p>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        Owner: {ap.owner} · Due {ap.deadline}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={ap.status}
                        onChange={(e) =>
                          setActionPoints((prev) =>
                            prev.map((x) =>
                              x.id === ap.id
                                ? { ...x, status: e.target.value as ActionPoint['status'] }
                                : x
                            )
                          )
                        }
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>

                      {ap.convertedTaskId ? (
                        <span className="text-[11px] font-medium text-[#188038] dark:text-emerald-400 whitespace-nowrap">
                          Converted to Task
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConvertActionToTask(ap)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#1A73E8]/10 text-[#1A73E8] dark:text-blue-400 hover:bg-[#1A73E8]/20 font-medium whitespace-nowrap"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                          Convert to Task
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setActionPoints((prev) => prev.filter((x) => x.id !== ap.id))}
                        className="text-slate-400 hover:text-[#D93025]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="px-6 py-3.5 bg-[#F7F9FC] dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            {editingMeeting && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#D93025] hover:bg-[#D93025]/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Meeting
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
            <button
              type="button"
              disabled={saving}
              onClick={handleSubmit}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-[#1A73E8] hover:bg-[#1557B0] text-white disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving...' : editingMeeting ? 'Save Meeting' : 'Schedule Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
