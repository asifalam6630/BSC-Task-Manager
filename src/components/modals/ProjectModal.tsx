import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  DEPARTMENTS,
  Priority,
  Project,
  PROJECT_COLORS,
  ProjectDocument,
  ProjectMilestone,
  ProjectStatus,
} from '../../types';
import { createProjectDoc, updateProjectDoc } from '../../lib/firestoreService';
import { useApp } from '../../context/AppContext';

interface ProjectModalProps {
  open: boolean;
  editingProject?: Project | null;
  onClose: () => void;
}

const PROJECT_STATUSES: ProjectStatus[] = [
  'Not Started',
  'Planning',
  'In Progress',
  'At Risk',
  'Delayed',
  'On Hold',
  'Completed',
  'Cancelled',
];

const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low'];

export const ProjectModal: React.FC<ProjectModalProps> = ({
  open,
  editingProject,
  onClose,
}) => {
  const { user, projects, employees, notify } = useApp();
  const [saving, setSaving] = useState(false);

  const [projectCode, setProjectCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('BSC Strategic Execution');
  const [strategicObjective, setStrategicObjective] = useState('');
  const [description, setDescription] = useState('');
  const [projectOwner, setProjectOwner] = useState('');
  const [projectChampion, setProjectChampion] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [startDate, setStartDate] = useState('2026-11-22');
  const [targetDate, setTargetDate] = useState('2027-01-31');
  const [priority, setPriority] = useState<Priority>('High');
  const [status, setStatus] = useState<ProjectStatus>('Planning');
  const [budget, setBudget] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [newMsTitle, setNewMsTitle] = useState('');
  const [newMsDate, setNewMsDate] = useState('2026-12-15');
  const [newDocName, setNewDocName] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editingProject) {
      setProjectCode(editingProject.projectCode);
      setName(editingProject.name);
      setCategory(editingProject.category);
      setStrategicObjective(editingProject.strategicObjective || '');
      setDescription(editingProject.description || '');
      setProjectOwner(editingProject.projectOwner);
      setProjectChampion(editingProject.projectChampion || '');
      setDepartment(editingProject.department);
      setStartDate(editingProject.startDate);
      setTargetDate(editingProject.targetDate);
      setPriority(editingProject.priority);
      setStatus(editingProject.status);
      setBudget(editingProject.budget !== undefined ? String(editingProject.budget) : '');
      setColor(editingProject.color || PROJECT_COLORS[0]);
      setMilestones(editingProject.milestones || []);
      setDocuments(editingProject.documents || []);
    } else {
      const nextNum = projects.length + 21;
      setProjectCode(`P${String(nextNum).padStart(2, '0')}`);
      setName('');
      setCategory('BSC Strategic Execution');
      setStrategicObjective('');
      setDescription('');
      setProjectOwner(employees[0]?.name || user?.displayName || '');
      setProjectChampion('Executive Director (ED)');
      setDepartment(DEPARTMENTS[0]);
      setStartDate(new Date().toISOString().slice(0, 10));
      setTargetDate('2027-02-28');
      setPriority('High');
      setStatus('Planning');
      setBudget('');
      setColor(PROJECT_COLORS[projects.length % PROJECT_COLORS.length]);
      setMilestones([]);
      setDocuments([]);
    }
  }, [open, editingProject, projects.length, employees, user]);

  if (!open) return null;

  const handleAddMilestone = () => {
    if (!newMsTitle.trim()) return;
    setMilestones((prev) => [
      ...prev,
      {
        id: `ms_${Date.now()}`,
        title: newMsTitle.trim(),
        dueDate: newMsDate || targetDate,
        completed: false,
      },
    ]);
    setNewMsTitle('');
  };

  const handleAddDocument = () => {
    if (!newDocName.trim()) return;
    const ext = newDocName.includes('.') ? newDocName.split('.').pop()?.toUpperCase() || 'DOC' : 'DOC';
    setDocuments((prev) => [
      ...prev,
      {
        id: `doc_${Date.now()}`,
        name: newDocName.trim(),
        type: ext,
        uploadedAt: new Date().toISOString().slice(0, 10),
      },
    ]);
    setNewDocName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!projectCode.trim() || !name.trim()) {
      notify('error', 'Missing required fields', 'Project ID and Project Name are required.');
      return;
    }
    if (targetDate < startDate) {
      notify('error', 'Invalid dates', 'Target Completion Date cannot be earlier than Start Date.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        projectCode: projectCode.trim().toUpperCase(),
        name: name.trim(),
        category: category.trim(),
        strategicObjective: strategicObjective.trim(),
        description: description.trim(),
        projectOwner: projectOwner.trim() || 'Unassigned',
        projectChampion: projectChampion.trim(),
        department,
        startDate,
        targetDate,
        priority,
        status,
        budget: budget ? Number(budget) : undefined,
        color,
        milestones,
        documents,
      };
      if (editingProject) {
        await updateProjectDoc(editingProject.id, payload);
        notify('success', 'Project updated', `${payload.projectCode} — ${payload.name} saved.`);
      } else {
        await createProjectDoc(user.uid, { ...payload, isDemo: false });
        notify('success', 'Project created', `${payload.projectCode} — ${payload.name} added to portfolio.`);
      }
      onClose();
    } catch (err) {
      notify('error', 'Failed to save project', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-[#172B4D] dark:text-white">
              {editingProject ? `Edit Project · ${editingProject.projectCode}` : 'Create Strategic Project'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Changes persist directly to Cloud Firestore and sync across all modules.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Project ID *
              </label>
              <input
                type="text"
                required
                maxLength={32}
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                placeholder="P21"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30 focus:border-[#1A73E8]"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Project Name *
              </label>
              <input
                type="text"
                required
                maxLength={180}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Enterprise Balanced Scorecard Rollout"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30 focus:border-[#1A73E8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <input
                type="text"
                maxLength={100}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Responsible Department
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
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
                Budget (USD, optional)
              </label>
              <input
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="100000"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Project Owner
              </label>
              <input
                type="text"
                list="employee-names-list"
                maxLength={120}
                value={projectOwner}
                onChange={(e) => setProjectOwner(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Project Champion / Sponsor
              </label>
              <input
                type="text"
                list="employee-names-list"
                maxLength={120}
                value={projectChampion}
                onChange={(e) => setProjectChampion(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
              />
            </div>
            <datalist id="employee-names-list">
              {employees.map((e) => (
                <option key={e.id} value={e.name} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Completion *
              </label>
              <input
                type="date"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
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
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Project Color Code (Calendar &amp; Gantt)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PROJECT_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={`Select color ${hex}`}
                  className={`w-7 h-7 rounded-md transition-transform ${
                    color === hex ? 'ring-2 ring-offset-2 ring-[#172B4D] dark:ring-white scale-105' : ''
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Strategic Objective (Balanced Scorecard Alignment)
            </label>
            <input
              type="text"
              maxLength={400}
              value={strategicObjective}
              onChange={(e) => setStrategicObjective(e.target.value)}
              placeholder="Measurable business outcome targeted by this initiative"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Project Description
            </label>
            <textarea
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[#172B4D] dark:text-slate-100"
            />
          </div>

          {/* Milestones Manager */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-semibold text-[#172B4D] dark:text-slate-200 mb-2">
              Key Milestones ({milestones.length})
            </label>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="text"
                value={newMsTitle}
                onChange={(e) => setNewMsTitle(e.target.value)}
                placeholder="Milestone title"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="date"
                value={newMsDate}
                onChange={(e) => setNewMsDate(e.target.value)}
                className="px-3 py-1.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={handleAddMilestone}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-[#172B4D] dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Milestone
              </button>
            </div>
            {milestones.length > 0 && (
              <div className="space-y-1.5">
                {milestones.map((ms) => (
                  <div
                    key={ms.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 text-xs"
                  >
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={ms.completed}
                        onChange={() =>
                          setMilestones((prev) =>
                            prev.map((item) =>
                              item.id === ms.id ? { ...item, completed: !item.completed } : item
                            )
                          )
                        }
                        className="rounded border-slate-300 text-[#1A73E8]"
                      />
                      <span className={ms.completed ? 'line-through text-slate-400 truncate' : 'text-slate-800 dark:text-slate-200 truncate'}>
                        {ms.title}
                      </span>
                    </label>
                    <span className="font-mono text-slate-500 shrink-0">{ms.dueDate}</span>
                    <button
                      type="button"
                      onClick={() => setMilestones((prev) => prev.filter((item) => item.id !== ms.id))}
                      className="text-slate-400 hover:text-[#D93025]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documents Reference Manager */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-semibold text-[#172B4D] dark:text-slate-200 mb-2">
              Project Documents ({documents.length})
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Document filename or reference (e.g., Charter_v1.pdf)"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={handleAddDocument}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-[#172B4D] dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Attach Ref
              </button>
            </div>
            {documents.length > 0 && (
              <div className="space-y-1">
                {documents.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 text-xs"
                  >
                    <span className="truncate text-slate-700 dark:text-slate-300">
                      {d.name} · {d.type} · {d.uploadedAt}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDocuments((prev) => prev.filter((item) => item.id !== d.id))}
                      className="text-slate-400 hover:text-[#D93025]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="px-6 py-3.5 bg-[#F7F9FC] dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
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
            {saving ? 'Saving...' : editingProject ? 'Save Project Changes' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
};
