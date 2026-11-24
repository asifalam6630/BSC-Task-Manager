/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Bell,
  Briefcase,
  Calendar,
  CheckSquare,
  FileSpreadsheet,
  FolderKanban,
  GanttChart,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Smartphone,
  Sun,
  TrendingUp,
  Users,
  Video,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider, useApp } from './context/AppContext';
import { AuthScreen } from './components/AuthScreen';
import { MobileAppShell } from './components/MobileAppShell';
import { ExecutiveDashboard } from './modules/ExecutiveDashboard';
import { MyWorkspaceView } from './modules/MyWorkspaceView';
import { ProjectsModule } from './modules/ProjectsModule';
import { TasksModule } from './modules/TasksModule';
import { CalendarModule } from './modules/CalendarModule';
import { GanttModule } from './modules/GanttModule';
import { MeetingsModule } from './modules/MeetingsModule';
import { RaciModule } from './modules/RaciModule';
import { TeamModule } from './modules/TeamModule';
import { ExcelImportModule } from './modules/ExcelImportModule';
import { ReportsAnalyticsModule } from './modules/ReportsAnalyticsModule';
import { NotificationsModule } from './modules/NotificationsModule';
import { SettingsModule } from './modules/SettingsModule';
import { ProjectModal } from './components/modals/ProjectModal';
import { TaskModal } from './components/modals/TaskModal';
import { MeetingModal } from './components/modals/MeetingModal';
import { BscPortfolioChartersModule } from './modules/bsc/BscPortfolioChartersModule';
import { BscMyTasksModule } from './modules/bsc/BscMyTasksModule';
import { BscTaskBoardModule } from './modules/bsc/BscTaskBoardModule';
import { BscDayRangeTrackerModule } from './modules/bsc/BscDayRangeTrackerModule';
import { BscFollowUpDeskModule } from './modules/bsc/BscFollowUpDeskModule';
import { BscEscalationRegisterModule } from './modules/bsc/BscEscalationRegisterModule';
import { BscReviewsAndPacksModule } from './modules/bsc/BscReviewsAndPacksModule';
import { BscTaskDetailDrawer } from './components/bsc/BscTaskDetailDrawer';
import { BscCreateTaskModal } from './components/bsc/BscCreateTaskModal';
import { Meeting, NavSection, Project, Task } from './types';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
  { id: 'workspace', label: 'My Workspace', icon: Briefcase },
  { id: 'projects', label: 'All Projects', icon: FolderKanban },
  { id: 'tasks', label: 'Task Management', icon: CheckSquare },
  { id: 'calendar', label: 'Calendar & Timeline', icon: Calendar },
  { id: 'gantt', label: 'Gantt Chart', icon: GanttChart },
  { id: 'meetings', label: 'Meeting Management', icon: Video },
  { id: 'raci', label: 'RACI Matrix', icon: Grid2X2 },
  { id: 'team', label: 'Team & Department', icon: Users },
  { id: 'excel', label: 'Excel Import Center', icon: FileSpreadsheet },
  { id: 'reports', label: 'Reports & Analytics', icon: TrendingUp },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const TaskMasterShell: React.FC = () => {
  const {
    user,
    profile,
    authReady,
    dataLoading,
    notifications,
    activeNav,
    setActiveNav,
    setSelectedProjectId,
    globalSearch,
    setGlobalSearch,
    selectedDate,
    setSelectedDate,
    theme,
    toggleTheme,
    viewMode,
    setViewMode,
    signOut,
  } = useApp();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Shared Modal States
  const [projectModal, setProjectModal] = useState<{ open: boolean; editing: Project | null }>({
    open: false,
    editing: null,
  });
  const [taskModal, setTaskModal] = useState<{
    open: boolean;
    editing: Task | null;
    defaultProjectId?: string | null;
    defaultDate?: string;
  }>({ open: false, editing: null });
  const [meetingModal, setMeetingModal] = useState<{
    open: boolean;
    editing: Meeting | null;
    defaultProjectId?: string | null;
    defaultDate?: string;
  }>({ open: false, editing: null });
  const [bscCreateTaskModal, setBscCreateTaskModal] = useState<{
    open: boolean;
    defaultCharterId?: string;
  }>({ open: false });

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] dark:bg-[#0B1120]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#172B4D] dark:bg-[#1A73E8] text-white font-display font-bold flex items-center justify-center mx-auto">
            TM
          </div>
          <p className="text-sm text-slate-500">Initializing Task Master workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const openCreateProject = () => {
    setQuickAddOpen(false);
    setProjectModal({ open: true, editing: null });
  };
  const openEditProject = (p: Project) => setProjectModal({ open: true, editing: p });

  const openCreateTask = (defaultProjectId?: string | null, defaultDate?: string) => {
    setQuickAddOpen(false);
    setTaskModal({ open: true, editing: null, defaultProjectId, defaultDate });
  };
  const openEditTask = (t: Task) => setTaskModal({ open: true, editing: t });

  const openCreateMeeting = (defaultProjectId?: string | null, defaultDate?: string) => {
    setQuickAddOpen(false);
    setMeetingModal({ open: true, editing: null, defaultProjectId, defaultDate });
  };
  const openEditMeeting = (m: Meeting) => setMeetingModal({ open: true, editing: m });

  const handleOpenProjectWorkspace = (project: Project) => {
    setSelectedProjectId(project.id);
    setActiveNav('projects');
  };

  // Dedicated Mobile App View Mode
  if (viewMode === 'mobile') {
    return (
      <>
        <MobileAppShell
          onCreateProject={openCreateProject}
          onEditProject={openEditProject}
          onCreateTask={openCreateTask}
          onEditTask={openEditTask}
          onCreateMeeting={openCreateMeeting}
          onEditMeeting={openEditMeeting}
        />
        <ProjectModal
          open={projectModal.open}
          editingProject={projectModal.editing}
          onClose={() => setProjectModal({ open: false, editing: null })}
        />
        <TaskModal
          open={taskModal.open}
          editingTask={taskModal.editing}
          defaultProjectId={taskModal.defaultProjectId}
          defaultDate={taskModal.defaultDate}
          onClose={() => setTaskModal({ open: false, editing: null })}
        />
        <MeetingModal
          open={meetingModal.open}
          editingMeeting={meetingModal.editing}
          defaultProjectId={meetingModal.defaultProjectId}
          defaultDate={meetingModal.defaultDate}
          onClose={() => setMeetingModal({ open: false, editing: null })}
        />
      </>
    );
  }

  // Desktop Enterprise Workspace Shell
  return (
    <div className="min-h-screen flex bg-[#F7F9FC] dark:bg-[#0B1120] text-[#172B4D] dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

      {/* Collapsible Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-200 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[252px]'
        } ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#172B4D] dark:bg-[#1A73E8] text-white font-display font-bold text-xs flex items-center justify-center shrink-0">
              TM
            </div>
            {!sidebarCollapsed && (
              <span className="font-display font-bold text-base tracking-tight text-[#172B4D] dark:text-white whitespace-nowrap truncate">
                Task Master
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = activeNav === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => {
                  if (item.id !== 'projects') setSelectedProjectId(null);
                  setActiveNav(item.id);
                  setMobileDrawerOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#1A73E8]/10 text-[#1A73E8] dark:bg-blue-500/15 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:text-[#172B4D] dark:hover:text-slate-100'
                } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                {!sidebarCollapsed && item.id === 'notifications' && unreadCount > 0 && (
                  <span className="font-mono text-[11px] font-bold text-[#D93025] dark:text-red-400">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => signOut()}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-[#D93025] hover:bg-[#D93025]/5 transition-colors ${
              sidebarCollapsed ? 'justify-center px-0' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Top Navigation Bar */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Global Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search projects, tasks, meetings, people..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 text-[#172B4D] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/25 focus:border-[#1A73E8]"
              />
            </div>

            {/* Date Selector */}
            <input
              type="date"
              aria-label="Reference date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="hidden md:block px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 text-slate-700 dark:text-slate-300"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Web / Mobile View Switcher */}
            <button
              type="button"
              onClick={() => setViewMode('mobile')}
              title="Switch to Mobile App View"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#1A73E8]" />
              Mobile View
            </button>

            {/* Light / Dark Mode Switch */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => setActiveNav('notifications')}
              aria-label="Open notifications"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 relative"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#D93025] text-white font-mono text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Quick Add (+) Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setQuickAddOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Quick Add
              </button>
              {quickAddOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 z-50 text-xs">
                  <button
                    type="button"
                    onClick={openCreateProject}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    + New Project
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateTask(null, selectedDate)}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    + New Task
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateMeeting(null, selectedDate)}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    + Schedule Meeting
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddOpen(false);
                      setActiveNav('excel');
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-[#188038] dark:text-emerald-400"
                  >
                    ↑ Import Excel Plan
                  </button>
                </div>
              )}
            </div>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#172B4D] text-white text-[11px] font-bold flex items-center justify-center">
                    {(profile?.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="hidden xl:block text-xs font-semibold max-w-[110px] truncate">
                  {profile?.displayName || user.displayName || 'Executive'}
                </span>
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-3 z-50 text-xs space-y-2">
                  <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-bold text-[#172B4D] dark:text-white truncate">
                      {profile?.displayName || user.displayName}
                    </p>
                    <p className="text-slate-500 truncate">{user.email}</p>
                    <p className="text-[11px] text-[#1A73E8] font-medium mt-0.5">
                      {profile?.role || 'Team Member'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setActiveNav('settings');
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Account &amp; RBAC Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      signOut();
                    }}
                    className="w-full text-left px-2 py-1.5 rounded text-[#D93025] hover:bg-[#D93025]/5"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {dataLoading ? (
            <div className="space-y-4">
              <div className="h-8 w-64 rounded-lg bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-xl bg-slate-200/60 dark:bg-slate-800/70 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-72 rounded-xl bg-slate-200/60 dark:bg-slate-800/70 animate-pulse" />
            </div>
          ) : (
            <>
              {activeNav === 'dashboard' && (
                <ExecutiveDashboard
                  onOpenProject={handleOpenProjectWorkspace}
                  onCreateProject={openCreateProject}
                  onCreateTask={() => openCreateTask()}
                />
              )}
              {activeNav === 'workspace' && (
                <MyWorkspaceView
                  onEditTask={openEditTask}
                  onEditMeeting={openEditMeeting}
                  onCreateTask={() => openCreateTask()}
                />
              )}
              {activeNav === 'projects' && (
                <ProjectsModule
                  onCreateProject={openCreateProject}
                  onEditProject={openEditProject}
                  onCreateTaskForProject={(pid) => openCreateTask(pid)}
                  onEditTask={openEditTask}
                  onCreateMeetingForProject={(pid) => openCreateMeeting(pid)}
                  onEditMeeting={openEditMeeting}
                />
              )}
              {activeNav === 'tasks' && (
                <TasksModule onCreateTask={() => openCreateTask()} onEditTask={openEditTask} />
              )}
              {activeNav === 'calendar' && (
                <CalendarModule
                  onEditTask={openEditTask}
                  onEditMeeting={openEditMeeting}
                  onCreateTaskOnDate={(d) => openCreateTask(null, d)}
                  onCreateMeetingOnDate={(d) => openCreateMeeting(null, d)}
                />
              )}
              {activeNav === 'gantt' && (
                <GanttModule onEditTask={openEditTask} onCreateTask={() => openCreateTask()} />
              )}
              {activeNav === 'meetings' && (
                <MeetingsModule
                  onCreateMeeting={() => openCreateMeeting()}
                  onEditMeeting={openEditMeeting}
                />
              )}
              {activeNav === 'raci' && <RaciModule />}
              {activeNav === 'team' && <TeamModule />}
              {activeNav === 'excel' && <ExcelImportModule />}
              {activeNav === 'reports' && <ReportsAnalyticsModule />}
              {activeNav === 'notifications' && <NotificationsModule />}
              {activeNav === 'settings' && <SettingsModule />}
              {activeNav === 'bsc-portfolio' && (
                <BscPortfolioChartersModule
                  onCreateTask={(charterId) =>
                    setBscCreateTaskModal({ open: true, defaultCharterId: charterId })
                  }
                />
              )}
              {activeNav === 'bsc-my-tasks' && (
                <BscMyTasksModule
                  onCreateTask={() => setBscCreateTaskModal({ open: true })}
                />
              )}
              {activeNav === 'bsc-board' && (
                <BscTaskBoardModule
                  onCreateTask={() => setBscCreateTaskModal({ open: true })}
                />
              )}
              {activeNav === 'bsc-day-range' && (
                <BscDayRangeTrackerModule
                  onCreateTask={() => setBscCreateTaskModal({ open: true })}
                />
              )}
              {activeNav === 'bsc-followup-desk' && (
                <BscFollowUpDeskModule
                  onCreateTask={() => setBscCreateTaskModal({ open: true })}
                />
              )}
              {activeNav === 'bsc-escalations' && (
                <BscEscalationRegisterModule
                  onCreateTask={() => setBscCreateTaskModal({ open: true })}
                />
              )}
              {activeNav === 'bsc-reviews' && (
                <BscReviewsAndPacksModule
                  onCreateTask={() => setBscCreateTaskModal({ open: true })}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Global CRUD Modals */}
      <ProjectModal
        open={projectModal.open}
        editingProject={projectModal.editing}
        onClose={() => setProjectModal({ open: false, editing: null })}
      />
      <TaskModal
        open={taskModal.open}
        editingTask={taskModal.editing}
        defaultProjectId={taskModal.defaultProjectId}
        defaultDate={taskModal.defaultDate}
        onClose={() => setTaskModal({ open: false, editing: null })}
      />
      <MeetingModal
        open={meetingModal.open}
        editingMeeting={meetingModal.editing}
        defaultProjectId={meetingModal.defaultProjectId}
        defaultDate={meetingModal.defaultDate}
        onClose={() => setMeetingModal({ open: false, editing: null })}
      />
      {/* Global Turag BSC Detail Drawer & Governed Create Task Modal */}
      <BscTaskDetailDrawer />
      <BscCreateTaskModal
        open={bscCreateTaskModal.open}
        defaultCharterId={bscCreateTaskModal.defaultCharterId}
        onClose={() => setBscCreateTaskModal({ open: false })}
      />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <TaskMasterShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
