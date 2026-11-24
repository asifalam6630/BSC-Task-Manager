import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  Edit3,
  FileText,
  FolderKanban,
  Plus,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DEPARTMENTS, Meeting, Project, RACI_COLUMNS, Task } from '../types';
import {
  deleteProjectCascade,
  updateProjectDoc,
  updateTaskDoc,
} from '../lib/firestoreService';
import {
  getProjectMilestoneProgress,
  getProjectPlannedProgress,
  getProjectWeightedProgress,
  getScheduleVariance,
  getStatusBadgeClasses,
  isTaskOverdue,
} from '../lib/metrics';

interface ProjectsModuleProps {
  onCreateProject: () => void;
  onEditProject: (p: Project) => void;
  onCreateTaskForProject: (projectId: string) => void;
  onEditTask: (task: Task) => void;
  onCreateMeetingForProject: (projectId: string) => void;
  onEditMeeting: (meeting: Meeting) => void;
}

export const ProjectsModule: React.FC<ProjectsModuleProps> = ({
  onCreateProject,
  onEditProject,
  onCreateTaskForProject,
  onEditTask,
  onCreateMeetingForProject,
  onEditMeeting,
}) => {
  const {
    user,
    projects,
    tasks,
    meetings,
    raciEntries,
    selectedProjectId,
    setSelectedProjectId,
    globalSearch,
    confirm,
    notify,
  } = useApp();

  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [workspaceTab, setWorkspaceTab] = useState<
    'tasks' | 'milestones' | 'meetings' | 'raci' | 'documents'
  >('tasks');

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (deptFilter !== 'all' && p.department !== deptFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.projectCode.toLowerCase().includes(q) &&
          !p.projectOwner.toLowerCase().includes(q) &&
          !p.department.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [projects, deptFilter, statusFilter, globalSearch]);

  const handleDeleteProject = async (project: Project) => {
    if (!user) return;
    const relatedTasks = tasks.filter((t) => t.projectId === project.id).length;
    const ok = await confirm({
      title: `Delete project ${project.projectCode}?`,
      description: `This permanently deletes "${project.name}" along with ${relatedTasks} associated task(s), meetings, and RACI entries.`,
      confirmLabel: 'Delete Project',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteProjectCascade(user.uid, project.id);
      if (selectedProjectId === project.id) setSelectedProjectId(null);
      notify('success', 'Project deleted', `${project.projectCode} and linked records removed.`);
    } catch (err) {
      notify('error', 'Failed to delete project', err instanceof Error ? err.message : 'Error');
    }
  };

  // Dedicated Project Workspace View
  if (activeProject) {
    const projTasks = tasks.filter((t) => t.projectId === activeProject.id);
    const projMeetings = meetings.filter((m) => m.projectId === activeProject.id);
    const projRaci = raciEntries.filter((r) => r.projectId === activeProject.id);
    const actualPct = getProjectWeightedProgress(activeProject.id, tasks);
    const plannedPct = getProjectPlannedProgress(activeProject, tasks);
    const variance = getScheduleVariance(actualPct, plannedPct);
    const msStats = getProjectMilestoneProgress(activeProject);

    const toggleMilestone = async (msId: string) => {
      const updated = (activeProject.milestones || []).map((m) =>
        m.id === msId ? { ...m, completed: !m.completed } : m
      );
      await updateProjectDoc(activeProject.id, { milestones: updated });
      notify('success', 'Milestone status updated');
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedProjectId(null)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              aria-label="Back to all projects"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: activeProject.color }}
                />
                <span className="font-mono font-bold text-[#172B4D] dark:text-slate-200">
                  {activeProject.projectCode}
                </span>
                <span>/</span>
                <span>{activeProject.category}</span>
                <span>/</span>
                <span>{activeProject.department}</span>
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-[#172B4D] dark:text-white truncate mt-0.5">
                {activeProject.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onEditProject(activeProject)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#172B4D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Project
            </button>
            <button
              type="button"
              onClick={() => onCreateTaskForProject(activeProject.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Task
            </button>
            <button
              type="button"
              onClick={() => handleDeleteProject(activeProject)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[#D93025] hover:bg-[#D93025]/10"
              aria-label="Delete project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Project Overview Summary Strip */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className={`px-2 py-0.5 rounded font-semibold ${getStatusBadgeClasses(activeProject.status)}`}>
                {activeProject.status}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                Priority: <strong className="text-[#172B4D] dark:text-slate-200">{activeProject.priority}</strong>
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                Owner: <strong className="text-[#172B4D] dark:text-slate-200">{activeProject.projectOwner}</strong>
              </span>
              {activeProject.projectChampion && (
                <span className="text-slate-500 dark:text-slate-400">
                  Champion: <strong className="text-[#172B4D] dark:text-slate-200">{activeProject.projectChampion}</strong>
                </span>
              )}
              <span className="font-mono text-slate-500 dark:text-slate-400">
                {activeProject.startDate} → {activeProject.targetDate}
              </span>
            </div>
            {activeProject.strategicObjective && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Strategic Objective
                </p>
                <p className="text-sm text-[#172B4D] dark:text-slate-200 mt-0.5">
                  {activeProject.strategicObjective}
                </p>
              </div>
            )}
            {activeProject.description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {activeProject.description}
              </p>
            )}
          </div>

          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Weighted Progress</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#1A73E8] tabular-nums">{actualPct}%</p>
              <p className="text-[11px] text-slate-500 mt-1">Planned: {plannedPct}%</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Schedule Variance</p>
              <p
                className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                  variance >= 0 ? 'text-[#188038]' : 'text-[#D93025]'
                }`}
              >
                {variance >= 0 ? `+${variance}%` : `${variance}%`}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Actual vs Plan</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Milestone Progress</p>
              <p className="mt-1 font-mono text-xl font-bold text-[#172B4D] dark:text-white tabular-nums">
                {msStats.completed}/{msStats.total} ({msStats.percent}%)
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Budget Allocation</p>
              <p className="mt-1 font-mono text-xl font-bold text-[#172B4D] dark:text-white tabular-nums">
                {activeProject.budget ? `$${activeProject.budget.toLocaleString()}` : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Workspace Sub-Navigation Tabs */}
        <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-6 overflow-x-auto text-sm">
          {[
            { id: 'tasks', label: `Assigned Tasks (${projTasks.length})` },
            { id: 'milestones', label: `Milestones (${activeProject.milestones?.length || 0})` },
            { id: 'meetings', label: `Related Meetings (${projMeetings.length})` },
            { id: 'raci', label: `RACI (${projRaci.length})` },
            { id: 'documents', label: `Documents (${activeProject.documents?.length || 0})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setWorkspaceTab(t.id as typeof workspaceTab)}
              className={`pb-3 font-medium border-b-2 whitespace-nowrap transition-colors ${
                workspaceTab === t.id
                  ? 'border-[#1A73E8] text-[#1A73E8]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {workspaceTab === 'tasks' && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-4 font-semibold">Task</th>
                  <th className="py-3 px-3 font-semibold">Responsible</th>
                  <th className="py-3 px-3 font-semibold">Timeline</th>
                  <th className="py-3 px-3 font-semibold text-right">Weight</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {projTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No tasks created for this project yet.
                    </td>
                  </tr>
                ) : (
                  projTasks.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => onEditTask(t)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-4">
                        <div className={t.parentTaskId ? 'pl-4' : ''}>
                          <span className="font-mono font-semibold text-[#172B4D] dark:text-slate-200 mr-2">
                            {t.taskCode}
                          </span>
                          <span className="font-medium text-[#172B4D] dark:text-slate-100">{t.name}</span>
                          {isTaskOverdue(t) && (
                            <span className="ml-2 text-[11px] font-semibold text-[#D93025]">Overdue</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{t.responsible}</td>
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {t.plannedStart} → {t.plannedEnd}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{t.weight}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded font-medium ${getStatusBadgeClasses(t.status)}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={t.progress}
                            onChange={(e) =>
                              updateTaskDoc(t.id, {
                                progress: Number(e.target.value),
                                status:
                                  Number(e.target.value) === 100
                                    ? 'Completed'
                                    : Number(e.target.value) > 0
                                    ? 'In Progress'
                                    : 'Not Started',
                              })
                            }
                            className="w-16 accent-[#1A73E8]"
                          />
                          <span className="font-mono font-semibold w-8">{t.progress}%</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {workspaceTab === 'milestones' && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {(activeProject.milestones || []).length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                No milestones added. Click Edit Project to define project milestones.
              </p>
            ) : (
              (activeProject.milestones || []).map((ms) => (
                <div key={ms.id} className="p-4 flex items-center justify-between gap-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ms.completed}
                      onChange={() => toggleMilestone(ms.id)}
                      className="w-4 h-4 rounded border-slate-300 text-[#188038]"
                    />
                    <span
                      className={`text-sm font-medium ${
                        ms.completed
                          ? 'line-through text-slate-400'
                          : 'text-[#172B4D] dark:text-slate-100'
                      }`}
                    >
                      {ms.title}
                    </span>
                  </label>
                  <span className="font-mono text-xs text-slate-500">{ms.dueDate}</span>
                </div>
              ))
            )}
          </div>
        )}

        {workspaceTab === 'meetings' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onCreateMeetingForProject(activeProject.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#9334E6] hover:bg-[#7B28C4] text-white text-xs font-semibold"
              >
                <Calendar className="w-3.5 h-3.5" />
                Schedule Project Meeting
              </button>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {projMeetings.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  No meetings scheduled for this project.
                </p>
              ) : (
                projMeetings.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onEditMeeting(m)}
                    className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[#9334E6] dark:text-purple-400">
                        {m.meetingCode} · {m.category}
                      </p>
                      <p className="text-sm font-semibold text-[#172B4D] dark:text-slate-100 mt-0.5">
                        {m.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Chair: {m.chairperson} · {m.venue}
                      </p>
                    </div>
                    <div className="text-right font-mono text-xs text-slate-600 dark:text-slate-400 shrink-0">
                      <p>{m.date}</p>
                      <p>
                        {m.startTime}–{m.endTime}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {workspaceTab === 'raci' && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60">
                  <th className="py-3 px-4 font-semibold">Activity</th>
                  {RACI_COLUMNS.map((col) => (
                    <th key={col} className="py-3 px-2.5 text-center font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {projRaci.length === 0 ? (
                  <tr>
                    <td colSpan={RACI_COLUMNS.length + 1} className="py-8 text-center text-slate-500">
                      No RACI rows mapped for this project yet. Add rows in the RACI Matrix module.
                    </td>
                  </tr>
                ) : (
                  projRaci.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 px-4 font-medium text-[#172B4D] dark:text-slate-200">
                        {r.activity}
                      </td>
                      {RACI_COLUMNS.map((col) => (
                        <td key={col} className="py-3 px-2.5 text-center font-mono font-bold">
                          {r.roles?.[col] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {workspaceTab === 'documents' && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {(activeProject.documents || []).length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                No project documents registered. Click Edit Project to attach document references.
              </p>
            ) : (
              (activeProject.documents || []).map((docItem) => (
                <div key={docItem.id} className="p-4 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-[#1A73E8]" />
                    <span className="font-medium text-[#172B4D] dark:text-slate-200">
                      {docItem.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {docItem.type} · {docItem.uploadedAt}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // All Projects Portfolio View
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            All Projects
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {filteredProjects.length} strategic initiatives · Click any project to open its dedicated workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateProject}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
        >
          <option value="all">All Departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
        >
          <option value="all">All Statuses</option>
          {['Not Started', 'Planning', 'In Progress', 'At Risk', 'Delayed', 'On Hold', 'Completed', 'Cancelled'].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            )
          )}
        </select>
      </div>

      {/* Project Cards Grid */}
      {filteredProjects.length === 0 ? (
        <div className="p-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <FolderKanban className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#172B4D] dark:text-slate-200">No matching projects</p>
          <p className="text-xs text-slate-500 mt-1">Create a new project or adjust your filter selection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProjects.map((p) => {
            const actual = getProjectWeightedProgress(p.id, tasks);
            const planned = getProjectPlannedProgress(p, tasks);
            const pTasks = tasks.filter((t) => t.projectId === p.id);
            const pOverdue = pTasks.filter((t) => isTaskOverdue(t)).length;
            const ms = getProjectMilestoneProgress(p);

            return (
              <div
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-[#1A73E8]/50 cursor-pointer transition-colors flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="font-mono font-bold text-[#172B4D] dark:text-slate-200">
                        {p.projectCode}
                      </span>
                      <span>·</span>
                      <span className="truncate">{p.department}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded font-medium text-[11px] shrink-0 ${getStatusBadgeClasses(p.status)}`}>
                      {p.status}
                    </span>
                  </div>

                  <h3 className="mt-2 font-display text-base font-bold text-[#172B4D] dark:text-white leading-snug">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {p.strategicObjective || p.description || 'Strategic execution initiative'}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 dark:text-slate-400">
                        Weighted Progress (Plan {planned}%)
                      </span>
                      <span className="font-mono font-bold text-[#172B4D] dark:text-slate-100">
                        {actual}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${actual}%`, backgroundColor: p.color }}
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate max-w-[140px]">{p.projectOwner}</span>
                    <div className="flex items-center gap-2.5 font-mono text-[11px] shrink-0">
                      <span className="inline-flex items-center gap-1">
                        <CheckSquare className="w-3 h-3" />
                        {pTasks.length}
                      </span>
                      <span>MS {ms.completed}/{ms.total}</span>
                      {pOverdue > 0 && (
                        <span className="text-[#D93025] font-semibold">{pOverdue} late</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
