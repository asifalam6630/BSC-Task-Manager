import React, { useMemo, useState } from 'react';
import { addDays, format, subDays } from 'date-fns';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  CheckSquare,
  FileSpreadsheet,
  FolderKanban,
  GanttChart,
  Grid2X2,
  Home,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Meeting, NavSection, Project, Task } from '../types';
import { updateTaskDoc } from '../lib/firestoreService';
import {
  getProjectWeightedProgress,
  getStatusBadgeClasses,
  isTaskOverdue,
} from '../lib/metrics';
import { ExcelImportModule } from '../modules/ExcelImportModule';
import { RaciModule } from '../modules/RaciModule';
import { ReportsAnalyticsModule } from '../modules/ReportsAnalyticsModule';
import { NotificationsModule } from '../modules/NotificationsModule';
import { SettingsModule } from '../modules/SettingsModule';
import { TeamModule } from '../modules/TeamModule';
import { ProjectsModule } from '../modules/ProjectsModule';
import { GanttModule } from '../modules/GanttModule';

interface MobileAppShellProps {
  onCreateProject: () => void;
  onEditProject: (p: Project) => void;
  onCreateTask: (projectId?: string | null, date?: string) => void;
  onEditTask: (t: Task) => void;
  onCreateMeeting: (projectId?: string | null, date?: string) => void;
  onEditMeeting: (m: Meeting) => void;
}

type MobileTab = 'home' | 'tasks' | 'calendar' | 'meetings' | 'more';

export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  onCreateProject,
  onEditProject,
  onCreateTask,
  onEditTask,
  onCreateMeeting,
  onEditMeeting,
}) => {
  const {
    projects,
    tasks,
    meetings,
    notifications,
    theme,
    toggleTheme,
    setViewMode,
    setSelectedProjectId,
    notify,
  } = useApp();

  const [tab, setTab] = useState<MobileTab>('home');
  const [moreSubView, setMoreSubView] = useState<NavSection | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [taskFilter, setTaskFilter] = useState<'open' | 'overdue' | 'done'>('open');

  const unreadNotifs = notifications.filter((n) => !n.read).length;

  // Horizontal 14-day thumb scroller for mobile calendar
  const dateStrip = useMemo(() => {
    const start = subDays(new Date(), 3);
    return Array.from({ length: 14 }).map((_, i) => addDays(start, i));
  }, []);

  const overallCompletion = useMemo(() => {
    let wSum = 0;
    let wTotal = 0;
    tasks.forEach((t) => {
      const w = Math.max(1, t.weight || 1);
      wSum += w * t.progress;
      wTotal += w;
    });
    return wTotal > 0 ? Math.round(wSum / wTotal) : 0;
  }, [tasks]);

  const overdueTasks = useMemo(() => tasks.filter((t) => isTaskOverdue(t)), [tasks]);

  const mobileTasks = useMemo(() => {
    if (taskFilter === 'overdue') return overdueTasks;
    if (taskFilter === 'done') return tasks.filter((t) => t.status === 'Completed' || t.progress >= 100);
    return tasks.filter((t) => t.status !== 'Completed' && t.progress < 100);
  }, [tasks, overdueTasks, taskFilter]);

  const dayEvents = useMemo(() => {
    const tList = tasks.filter((t) => t.plannedStart <= selectedDay && t.plannedEnd >= selectedDay);
    const mList = meetings.filter((m) => m.date === selectedDay);
    return { tList, mList };
  }, [tasks, meetings, selectedDay]);

  const handleQuickBump = async (task: Task, nextProgress: number) => {
    await updateTaskDoc(task.id, {
      progress: nextProgress,
      status: nextProgress === 100 ? 'Completed' : 'In Progress',
      actualEnd: nextProgress === 100 ? format(new Date(), 'yyyy-MM-dd') : '',
    });
    notify('success', `${task.taskCode} → ${nextProgress}%`);
  };

  return (
    <div className="min-h-screen bg-slate-200/70 dark:bg-slate-950 flex justify-center">
      {/* Authentic Mobile Shell Container (Full-bleed on phone screens, framed preview on desktop when toggled) */}
      <div className="w-full max-w-[430px] min-h-screen bg-[#F7F9FC] dark:bg-[#0B1120] flex flex-col relative shadow-xl border-x border-slate-200 dark:border-slate-800">
        {/* Compact 52px Mobile Top App Bar */}
        <header className="sticky top-0 z-30 h-[52px] px-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#172B4D] dark:bg-[#1A73E8] text-white font-display font-bold text-xs flex items-center justify-center shrink-0">
              TM
            </div>
            <span className="font-display font-bold text-sm text-[#172B4D] dark:text-white truncate">
              {moreSubView
                ? moreSubView.toUpperCase()
                : tab === 'home'
                ? 'Task Master'
                : tab === 'tasks'
                ? 'My Tasks'
                : tab === 'calendar'
                ? 'Schedule'
                : tab === 'meetings'
                ? 'Meetings'
                : 'Workspace Menu'}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('more');
                setMoreSubView('notifications');
              }}
              aria-label="Notifications"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 relative"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifs > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#D93025]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('desktop')}
              title="Switch to Desktop Web View"
              className="min-h-[36px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-[#172B4D] dark:text-slate-200 inline-flex items-center gap-1"
            >
              <Monitor className="w-3.5 h-3.5 text-[#1A73E8]" />
              Web
            </button>
          </div>
        </header>

        {/* Scrollable Mobile Content */}
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-4">
          {/* HOME TAB */}
          {tab === 'home' && !moreSubView && (
            <>
              {/* Hero Metric Ring + Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3">
                  <svg className="w-12 h-12 -rotate-90 shrink-0" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      className="text-slate-100 dark:text-slate-800"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="#1A73E8"
                      strokeWidth="3.2"
                      strokeDasharray={`${overallCompletion}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div>
                    <p className="font-mono text-xl font-bold text-[#172B4D] dark:text-white tabular-nums">
                      {overallCompletion}%
                    </p>
                    <p className="text-[11px] text-slate-500">Portfolio</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500">Overdue Alerts</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#D93025] tabular-nums">
                    {overdueTasks.length}
                  </p>
                  <p className="text-[11px] text-slate-500">{projects.length} projects active</p>
                </div>
              </div>

              {/* Compact Mobile Action Strip */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onCreateTask(null, selectedDay)}
                  className="min-h-[44px] rounded-xl bg-[#1A73E8] text-white text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Task
                </button>
                <button
                  type="button"
                  onClick={() => onCreateMeeting(null, selectedDay)}
                  className="min-h-[44px] rounded-xl bg-[#9334E6] text-white text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <Video className="w-3.5 h-3.5" />
                  Meeting
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('more');
                    setMoreSubView('excel');
                  }}
                  className="min-h-[44px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-[#172B4D] dark:text-slate-100 flex items-center justify-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#188038]" />
                  Excel
                </button>
              </div>

              {/* Priority Projects Strip */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
                    Strategic Projects
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('more');
                      setMoreSubView('projects');
                    }}
                    className="text-xs font-semibold text-[#1A73E8]"
                  >
                    See All
                  </button>
                </div>
                <div className="space-y-2.5">
                  {projects.slice(0, 5).map((p) => {
                    const pct = getProjectWeightedProgress(p.id, tasks);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(p.id);
                          setTab('more');
                          setMoreSubView('projects');
                        }}
                        className="w-full p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-left space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-[#172B4D] dark:text-slate-200">
                            {p.projectCode} · {p.department}
                          </span>
                          <span className="font-mono font-bold text-[#1A73E8]">{pct}%</span>
                        </div>
                        <p className="text-sm font-semibold text-[#172B4D] dark:text-white truncate">
                          {p.name}
                        </p>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: p.color }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* TASKS TAB */}
          {tab === 'tasks' && !moreSubView && (
            <>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'open', label: 'Open' },
                    { id: 'overdue', label: `Overdue (${overdueTasks.length})` },
                    { id: 'done', label: 'Done' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTaskFilter(f.id)}
                    className={`min-h-[40px] rounded-lg text-xs font-semibold ${
                      taskFilter === f.id
                        ? 'bg-[#172B4D] dark:bg-[#1A73E8] text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5">
                {mobileTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onEditTask(t)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-mono font-bold text-[#172B4D] dark:text-slate-200">
                          {t.projectCode} · {t.taskCode}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-medium ${getStatusBadgeClasses(t.status)}`}>
                          {t.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-[#172B4D] dark:text-white">
                        {t.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.responsible} · Due {t.plannedEnd}
                      </p>
                    </button>

                    {/* Thumb-Friendly Quick Progress Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="font-mono text-xs font-bold text-[#1A73E8]">
                        {t.progress}%
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickBump(t, Math.min(100, t.progress + 25))}
                          className="min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-[#172B4D] dark:text-slate-200"
                        >
                          +25%
                        </button>
                        {t.progress < 100 && (
                          <button
                            type="button"
                            onClick={() => handleQuickBump(t, 100)}
                            className="min-h-[36px] px-3 rounded-lg bg-[#188038]/15 text-[#188038] dark:text-emerald-400 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Done
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* MOBILE CALENDAR TAB */}
          {tab === 'calendar' && !moreSubView && (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {dateStrip.map((d) => {
                  const ds = format(d, 'yyyy-MM-dd');
                  const active = ds === selectedDay;
                  return (
                    <button
                      key={ds}
                      type="button"
                      onClick={() => setSelectedDay(ds)}
                      className={`min-w-[52px] min-h-[58px] rounded-2xl flex flex-col items-center justify-center shrink-0 transition-colors ${
                        active
                          ? 'bg-[#1A73E8] text-white'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[#172B4D] dark:text-slate-200'
                      }`}
                    >
                      <span className="text-[10px] font-medium opacity-80">{format(d, 'EEE')}</span>
                      <span className="font-mono text-base font-bold">{format(d, 'd')}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 font-mono">
                  Agenda for {selectedDay}
                </p>
                {dayEvents.mList.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onEditMeeting(m)}
                    className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-[#9334E6]/40 text-left"
                  >
                    <p className="text-[11px] font-mono font-bold text-[#9334E6]">
                      MEETING · {m.startTime}–{m.endTime}
                    </p>
                    <p className="text-sm font-semibold text-[#172B4D] dark:text-white mt-0.5">
                      {m.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{m.venue}</p>
                  </button>
                ))}
                {dayEvents.tList.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onEditTask(t)}
                    className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="font-bold text-[#1A73E8]">{t.projectCode} · {t.taskCode}</span>
                      <span>{t.progress}%</span>
                    </div>
                    <p className="text-sm font-semibold text-[#172B4D] dark:text-white mt-0.5">
                      {t.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{t.responsible}</p>
                  </button>
                ))}
                {dayEvents.mList.length === 0 && dayEvents.tList.length === 0 && (
                  <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                    No tasks or meetings scheduled on {selectedDay}.
                  </div>
                )}
              </div>
            </>
          )}

          {/* MEETINGS TAB */}
          {tab === 'meetings' && !moreSubView && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => onCreateMeeting(null, selectedDay)}
                className="w-full min-h-[44px] rounded-xl bg-[#9334E6] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Schedule Meeting
              </button>
              {meetings.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onEditMeeting(m)}
                  className="w-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-left space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] text-[#9334E6] font-mono font-bold">
                    <span>{m.meetingCode} · {m.projectCode}</span>
                    <span>{m.date}</span>
                  </div>
                  <p className="text-sm font-semibold text-[#172B4D] dark:text-white">{m.title}</p>
                  <p className="text-xs text-slate-500">
                    {m.startTime}–{m.endTime} · {m.chairperson}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* MORE MENU & SUBVIEWS */}
          {tab === 'more' && !moreSubView && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'projects' as NavSection, label: 'All Projects', icon: FolderKanban },
                { id: 'gantt' as NavSection, label: 'Gantt Timeline', icon: GanttChart },
                { id: 'raci' as NavSection, label: 'RACI Matrix', icon: Grid2X2 },
                { id: 'excel' as NavSection, label: 'Excel Import', icon: FileSpreadsheet },
                { id: 'reports' as NavSection, label: 'Reports & PDF', icon: TrendingUp },
                { id: 'team' as NavSection, label: 'Team Directory', icon: Users },
                { id: 'notifications' as NavSection, label: `Alerts (${unreadNotifs})`, icon: AlertTriangle },
                { id: 'settings' as NavSection, label: 'Settings', icon: Settings },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMoreSubView(item.id)}
                  className="p-4 min-h-[82px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col items-start justify-between text-left"
                >
                  <item.icon className="w-5 h-5 text-[#1A73E8]" />
                  <span className="text-xs font-bold text-[#172B4D] dark:text-white">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {moreSubView && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setMoreSubView(null)}
                className="text-xs font-semibold text-[#1A73E8]"
              >
                ← Back to Mobile Menu
              </button>
              {moreSubView === 'projects' && (
                <ProjectsModule
                  onCreateProject={onCreateProject}
                  onEditProject={onEditProject}
                  onCreateTaskForProject={(pid) => onCreateTask(pid)}
                  onEditTask={onEditTask}
                  onCreateMeetingForProject={(pid) => onCreateMeeting(pid)}
                  onEditMeeting={onEditMeeting}
                />
              )}
              {moreSubView === 'gantt' && (
                <GanttModule onEditTask={onEditTask} onCreateTask={() => onCreateTask()} />
              )}
              {moreSubView === 'raci' && <RaciModule />}
              {moreSubView === 'excel' && <ExcelImportModule />}
              {moreSubView === 'reports' && <ReportsAnalyticsModule />}
              {moreSubView === 'team' && <TeamModule />}
              {moreSubView === 'notifications' && <NotificationsModule />}
              {moreSubView === 'settings' && <SettingsModule />}
            </div>
          )}
        </main>

        {/* Fixed Bottom Navigation Bar (5 Thumb Tabs, >=44px hitboxes) */}
        <nav className="sticky bottom-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 h-16 pb-safe">
          {(
            [
              { id: 'home', label: 'Home', icon: Home },
              { id: 'tasks', label: 'Tasks', icon: CheckSquare },
              { id: 'calendar', label: 'Calendar', icon: Calendar },
              { id: 'meetings', label: 'Meetings', icon: Video },
              { id: 'more', label: 'More', icon: Grid2X2 },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMoreSubView(null);
                }}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
                  active ? 'text-[#1A73E8]' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
