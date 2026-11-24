import React, { useMemo, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, Clock, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Meeting, Task } from '../types';
import { updateTaskDoc } from '../lib/firestoreService';
import { getDaysOverdue, getPriorityTextClass, getStatusBadgeClasses, isTaskOverdue } from '../lib/metrics';

interface MyWorkspaceViewProps {
  onEditTask: (task: Task) => void;
  onEditMeeting: (meeting: Meeting) => void;
  onCreateTask: () => void;
}

export const MyWorkspaceView: React.FC<MyWorkspaceViewProps> = ({
  onEditTask,
  onEditMeeting,
  onCreateTask,
}) => {
  const { profile, user, projects, tasks, meetings, notify } = useApp();
  const [scope, setScope] = useState<'all_open' | 'overdue' | 'completed'>('all_open');

  const projectMap = useMemo(() => {
    const m = new Map<string, (typeof projects)[0]>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const filteredTasks = useMemo(() => {
    if (scope === 'overdue') return tasks.filter((t) => isTaskOverdue(t));
    if (scope === 'completed') return tasks.filter((t) => t.status === 'Completed' || t.progress >= 100);
    return tasks.filter((t) => t.status !== 'Completed' && t.progress < 100);
  }, [tasks, scope]);

  const upcomingMeetings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return meetings.filter((m) => m.date >= today).slice(0, 6);
  }, [meetings]);

  const handleQuickProgress = async (task: Task, progress: number) => {
    try {
      await updateTaskDoc(task.id, {
        progress,
        status: progress === 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'Not Started',
        actualEnd: progress === 100 ? new Date().toISOString().slice(0, 10) : '',
      });
      notify('success', `${task.taskCode} updated to ${progress}%`);
    } catch (err) {
      notify('error', 'Update failed', err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            My Workspace
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Welcome back, {profile?.displayName || user?.displayName} · {profile?.role || 'Executive'} ·{' '}
            {profile?.department || 'Strategic PMO'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateTask}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Quick Add Task
        </button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Active Deliverables',
            value: tasks.filter((t) => t.status !== 'Completed').length,
            sub: 'Open across portfolio',
            icon: Clock,
            color: 'text-[#1A73E8]',
          },
          {
            label: 'Overdue Escalations',
            value: tasks.filter((t) => isTaskOverdue(t)).length,
            sub: 'Past planned end date',
            icon: AlertCircle,
            color: 'text-[#D93025]',
          },
          {
            label: 'Completed Tasks',
            value: tasks.filter((t) => t.status === 'Completed').length,
            sub: 'Verified closed',
            icon: CheckCircle2,
            color: 'text-[#188038]',
          },
          {
            label: 'Upcoming Meetings',
            value: upcomingMeetings.length,
            sub: 'Scheduled reviews',
            icon: Calendar,
            color: 'text-[#9334E6]',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {card.label}
              </span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#172B4D] dark:text-white">
              {card.value}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Actionable Task Queue */}
        <div className="lg:col-span-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
              Actionable Task Queue
            </h2>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
              {(
                [
                  { id: 'all_open', label: 'Open' },
                  { id: 'overdue', label: 'Overdue' },
                  { id: 'completed', label: 'Completed' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScope(tab.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    scope === tab.id
                      ? 'bg-white dark:bg-slate-800 text-[#172B4D] dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTasks.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No tasks match this queue view.
              </div>
            ) : (
              filteredTasks.map((task) => {
                const proj = projectMap.get(task.projectId);
                const overdue = isTaskOverdue(task);
                return (
                  <div
                    key={task.id}
                    className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          className="text-left group"
                        >
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: proj?.color || '#1A73E8' }}
                            />
                            <span className="font-mono font-semibold text-[#172B4D] dark:text-slate-300">
                              {task.projectCode} · {task.taskCode}
                            </span>
                            <span>·</span>
                            <span className={getPriorityTextClass(task.priority)}>{task.priority}</span>
                            {overdue && (
                              <>
                                <span>·</span>
                                <span className="text-[#D93025] dark:text-red-400 font-semibold">
                                  {getDaysOverdue(task)}d overdue
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-semibold text-[#172B4D] dark:text-slate-100 group-hover:text-[#1A73E8] transition-colors">
                            {task.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Responsible: {task.responsible} · Due {task.plannedEnd}
                          </p>
                        </button>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${getStatusBadgeClasses(
                            task.status
                          )}`}
                        >
                          {task.status}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={10}
                            aria-label={`Progress for ${task.name}`}
                            value={task.progress}
                            onChange={(e) => handleQuickProgress(task, Number(e.target.value))}
                            className="w-20 accent-[#1A73E8]"
                          />
                          <span className="font-mono text-xs font-semibold tabular-nums w-9 text-right">
                            {task.progress}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Governance Meetings */}
        <div className="lg:col-span-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
              Upcoming Meetings
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click to view agenda, minutes, and action items
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingMeetings.length === 0 ? (
              <p className="p-6 text-xs text-slate-500 text-center">No upcoming meetings scheduled.</p>
            ) : (
              upcomingMeetings.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onEditMeeting(m)}
                  className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between text-[11px] text-[#9334E6] dark:text-purple-400 font-medium">
                    <span>{m.category}</span>
                    <span className="font-mono">{m.date}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#172B4D] dark:text-slate-100">
                    {m.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {m.startTime}–{m.endTime} · {m.venue}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
