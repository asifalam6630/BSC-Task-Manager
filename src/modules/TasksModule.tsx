import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Columns3,
  List,
  Plus,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DEPARTMENTS, Task, TaskStatus } from '../types';
import { deleteTaskDoc, updateTaskDoc } from '../lib/firestoreService';
import {
  getDaysOverdue,
  getPriorityTextClass,
  getStatusBadgeClasses,
  isTaskOverdue,
} from '../lib/metrics';

interface TasksModuleProps {
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
}

const BOARD_STATUSES: TaskStatus[] = [
  'Not Started',
  'In Progress',
  'Pending Approval',
  'Under Review',
  'Delayed',
  'On Hold',
  'Completed',
];

export const TasksModule: React.FC<TasksModuleProps> = ({
  onCreateTask,
  onEditTask,
}) => {
  const { projects, tasks, globalSearch, confirm, notify } = useApp();
  const [view, setView] = useState<'table' | 'board'>('table');
  const [projectFilter, setProjectFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const projectMap = useMemo(() => {
    const m = new Map<string, (typeof projects)[0]>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const owners = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => t.responsible && s.add(t.responsible));
    return Array.from(s).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (projectFilter !== 'all' && t.projectId !== projectFilter) return false;
      if (deptFilter !== 'all' && t.department !== deptFilter) return false;
      if (ownerFilter !== 'all' && t.responsible !== ownerFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (onlyOverdue && !isTaskOverdue(t)) return false;
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        if (
          !t.name.toLowerCase().includes(q) &&
          !t.taskCode.toLowerCase().includes(q) &&
          !t.projectCode.toLowerCase().includes(q) &&
          !t.responsible.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, projectFilter, deptFilter, ownerFilter, statusFilter, onlyOverdue, globalSearch]);

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    try {
      const nextProgress =
        newStatus === 'Completed' ? 100 : newStatus === 'Not Started' ? 0 : task.progress;
      await updateTaskDoc(task.id, {
        status: newStatus,
        progress: nextProgress,
        actualEnd: newStatus === 'Completed' ? new Date().toISOString().slice(0, 10) : '',
      });
      notify('success', `${task.taskCode} moved to ${newStatus}`);
    } catch (err) {
      notify('error', 'Failed to update status', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleProgressChange = async (task: Task, val: number) => {
    try {
      await updateTaskDoc(task.id, {
        progress: val,
        status: val === 100 ? 'Completed' : val > 0 && task.status === 'Not Started' ? 'In Progress' : task.status,
      });
    } catch (err) {
      notify('error', 'Failed to update progress', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDelete = async (task: Task) => {
    const ok = await confirm({
      title: `Delete task ${task.taskCode}?`,
      description: `Remove "${task.name}" permanently from Firestore and central calendar.`,
      confirmLabel: 'Delete Task',
      tone: 'danger',
    });
    if (!ok) return;
    await deleteTaskDoc(task.id);
    notify('success', 'Task deleted');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            Task Management
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {filteredTasks.length} tasks · Weighted completion, RACI accountability, dependencies &amp; automatic overdue tracking.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="inline-flex p-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setView('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                view === 'table'
                  ? 'bg-[#172B4D] dark:bg-[#1A73E8] text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setView('board')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                view === 'board'
                  ? 'bg-[#172B4D] dark:bg-[#1A73E8] text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Board
            </button>
          </div>
          <button
            type="button"
            onClick={onCreateTask}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.projectCode} — {p.name}
            </option>
          ))}
        </select>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="all">All Departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="all">All Responsible</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="all">All Statuses</option>
          {BOARD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 ml-1 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(e) => setOnlyOverdue(e.target.checked)}
            className="rounded border-slate-300 text-[#D93025]"
          />
          Overdue Only
        </label>
      </div>

      {/* Table View */}
      {view === 'table' ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">ID / Task</th>
                <th className="py-3 px-3 font-semibold">Project</th>
                <th className="py-3 px-3 font-semibold">Responsible / Accountable</th>
                <th className="py-3 px-3 font-semibold">Schedule</th>
                <th className="py-3 px-3 font-semibold">Priority</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold text-right">Progress</th>
                <th className="py-3 px-3 font-semibold text-center">GCal</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No tasks match your current filters.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const proj = projectMap.get(task.projectId);
                  const overdue = isTaskOverdue(task);
                  return (
                    <tr
                      key={task.id}
                      onClick={() => onEditTask(task)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 max-w-[260px]">
                        <div className={task.parentTaskId ? 'pl-4' : ''}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-500">
                              {task.taskCode}
                            </span>
                            {task.parentTaskId && (
                              <span className="text-[10px] text-slate-400">Subtask</span>
                            )}
                            {overdue && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#D93025]">
                                <AlertTriangle className="w-3 h-3" />
                                {getDaysOverdue(task)}d late
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-[#172B4D] dark:text-slate-100 truncate mt-0.5">
                            {task.name}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-xs shrink-0"
                            style={{ backgroundColor: proj?.color || '#1A73E8' }}
                          />
                          <span className="font-mono font-semibold text-[#172B4D] dark:text-slate-200">
                            {task.projectCode}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <p className="text-[#172B4D] dark:text-slate-200 font-medium">
                          {task.responsible}
                        </p>
                        {task.accountable && (
                          <p className="text-[11px] text-slate-500">A: {task.accountable}</p>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <p>{task.plannedStart}</p>
                        <p className={overdue ? 'text-[#D93025] font-semibold' : ''}>
                          → {task.plannedEnd}
                        </p>
                      </td>
                      <td className={`py-3 px-3 whitespace-nowrap ${getPriorityTextClass(task.priority)}`}>
                        {task.priority}
                      </td>
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                          className={`px-2 py-1 rounded text-[11px] font-semibold border-0 cursor-pointer ${getStatusBadgeClasses(
                            task.status
                          )}`}
                        >
                          {BOARD_STATUSES.map((s) => (
                            <option key={s} value={s} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={task.progress}
                            onChange={(e) => handleProgressChange(task, Number(e.target.value))}
                            className="w-16 accent-[#1A73E8]"
                          />
                          <span className="font-mono font-semibold tabular-nums w-8">
                            {task.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Calendar
                          className={`w-3.5 h-3.5 mx-auto ${
                            task.syncStatus === 'synced'
                              ? 'text-[#188038]'
                              : 'text-slate-300 dark:text-slate-700'
                          }`}
                          aria-label={task.syncStatus === 'synced' ? 'Synced to Google Calendar' : 'Not synced'}
                        />
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleDelete(task)}
                          aria-label={`Delete ${task.taskCode}`}
                          className="p-1.5 rounded text-slate-400 hover:text-[#D93025] hover:bg-[#D93025]/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Kanban / Status Board View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_STATUSES.map((colStatus) => {
            const colTasks = filteredTasks.filter((t) => t.status === colStatus);
            return (
              <div
                key={colStatus}
                className="w-72 shrink-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col max-h-[70vh]"
              >
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#172B4D] dark:text-slate-100">
                    {colStatus}
                  </span>
                  <span className="font-mono text-xs text-slate-500">{colTasks.length}</span>
                </div>
                <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
                  {colTasks.map((task) => {
                    const proj = projectMap.get(task.projectId);
                    const overdue = isTaskOverdue(task);
                    return (
                      <div
                        key={task.id}
                        onClick={() => onEditTask(task)}
                        className="p-3 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-[#1A73E8]/50 cursor-pointer space-y-2"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-[#172B4D] dark:text-slate-200">
                            <span
                              className="w-2 h-2 rounded-xs"
                              style={{ backgroundColor: proj?.color || '#1A73E8' }}
                            />
                            {task.projectCode} · {task.taskCode}
                          </span>
                          <span className={getPriorityTextClass(task.priority)}>{task.priority}</span>
                        </div>
                        <p className="text-xs font-semibold text-[#172B4D] dark:text-slate-100 leading-snug">
                          {task.name}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate max-w-[120px]">{task.responsible}</span>
                          <span className={`font-mono ${overdue ? 'text-[#D93025] font-semibold' : ''}`}>
                            {task.plannedEnd}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${task.progress}%`, backgroundColor: proj?.color || '#1A73E8' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
