import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Database,
  Download,
  Moon,
  Shield,
  Smartphone,
  Sun,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DEPARTMENTS, ROLE_PERMISSIONS, UserRole } from '../types';
import { clearDemoDataset } from '../lib/firestoreService';

const PERM_LABELS: { key: keyof (typeof ROLE_PERMISSIONS)['Super Admin']; label: string }[] = [
  { key: 'canCreateProject', label: 'Create Projects' },
  { key: 'canAssignTasks', label: 'Assign Tasks' },
  { key: 'canUpdateProgress', label: 'Update Progress' },
  { key: 'canApproveTasks', label: 'Approve Tasks' },
  { key: 'canEditCalendar', label: 'Edit Calendar' },
  { key: 'canManageMeetings', label: 'Manage Meetings' },
  { key: 'canAccessReports', label: 'Access Reports' },
  { key: 'canManageUsers', label: 'User Admin' },
];

export const SettingsModule: React.FC = () => {
  const {
    user,
    profile,
    projects,
    tasks,
    meetings,
    raciEntries,
    employees,
    calendarToken,
    connectGoogleCalendar,
    theme,
    toggleTheme,
    viewMode,
    setViewMode,
    refreshProfile,
    seedDemo,
    confirm,
    notify,
  } = useApp();

  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [department, setDepartment] = useState(profile?.department || DEPARTMENTS[0]);
  const [designation, setDesignation] = useState(profile?.designation || 'Strategic PMO Lead');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await refreshProfile({ displayName, department, designation });
      notify('success', 'Profile saved', 'Your workspace settings have been persisted.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearDemo = async () => {
    if (!user) return;
    const demoCount = projects.filter((p) => p.isDemo).length;
    const ok = await confirm({
      title: 'Clear all demonstration data?',
      description: `This removes ${demoCount} sample project(s) and their demo tasks, meetings, RACI rows, and sample employees. Your own custom projects will remain untouched.`,
      confirmLabel: 'Clear Demo Data',
      tone: 'danger',
    });
    if (!ok) return;
    await clearDemoDataset(user.uid);
    notify('success', 'Demo data cleared', 'Only your live workspace records remain.');
  };

  const handleExportBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      workspaceOwner: user?.email,
      projects,
      tasks,
      meetings,
      raciEntries,
      employees,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TaskMaster_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', 'Workspace backup downloaded');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
          Settings &amp; Access Governance
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Manage profile preferences, theme, Google Calendar connectivity, RBAC roles, and workspace backups.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Settings */}
        <form
          onSubmit={handleSaveProfile}
          className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4"
        >
          <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
            Executive Profile
          </h2>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Display Name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Designation
                </label>
                <input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="pt-2 flex items-center justify-between">
              <span className="text-slate-500">
                Assigned Role: <strong className="text-[#172B4D] dark:text-slate-200">{profile?.role || 'Team Member'}</strong>
              </span>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </form>

        {/* Appearance, View Mode & Google Calendar */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-5">
          <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
            Interface &amp; Integrations
          </h2>

          <div className="flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-[#172B4D] dark:text-slate-200">Color Theme</p>
              <p className="text-slate-500">Switch between Light Mode and Dark Mode</p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 font-semibold"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#172B4D]" />}
              {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <p className="font-semibold text-[#172B4D] dark:text-slate-200">Application View</p>
              <p className="text-slate-500">Preview dedicated Mobile App UX or Desktop Web</p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'desktop' ? 'mobile' : 'desktop')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 font-semibold"
            >
              <Smartphone className="w-4 h-4 text-[#1A73E8]" />
              {viewMode === 'desktop' ? 'Switch to Mobile App' : 'Switch to Desktop Web'}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <p className="font-semibold text-[#172B4D] dark:text-slate-200">Google Calendar API</p>
              <p className="text-slate-500">
                {calendarToken
                  ? 'Active session token ready for two-way sync.'
                  : 'Connect to enable direct export and two-way schedule sync.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => connectGoogleCalendar()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold"
            >
              <Calendar className="w-3.5 h-3.5" />
              {calendarToken ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </div>

      {/* Data Management & Demo Controls */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-[#1A73E8] mt-0.5 shrink-0" />
          <div>
            <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
              Demonstration Data &amp; JSON Backup
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Restore the 12 BSC sample projects (P01–P20), clear demo records, or download a full JSON recovery snapshot.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON Backup
          </button>
          <button
            type="button"
            onClick={() => seedDemo()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#1A73E8] hover:bg-[#1A73E8]/5"
          >
            Load Demo Data
          </button>
          <button
            type="button"
            onClick={handleClearDemo}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#D93025]/30 text-xs font-semibold text-[#D93025] hover:bg-[#D93025]/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Demo Data
          </button>
        </div>
      </div>

      {/* RBAC Permissions Matrix */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#1A73E8]" />
          <div>
            <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
              Role-Based Access Control (RBAC) Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Enforced alongside hardened Firestore Security Rules.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 text-slate-500">
                <th className="py-3 px-4 font-semibold">Enterprise Role</th>
                {PERM_LABELS.map((p) => (
                  <th key={p.key} className="py-3 px-2.5 text-center font-semibold">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((role) => (
                <tr key={role}>
                  <td className="py-2.5 px-4 font-semibold text-[#172B4D] dark:text-slate-200 whitespace-nowrap">
                    {role}
                    {profile?.role === role && (
                      <span className="ml-2 text-[10px] font-mono text-[#1A73E8]">(Current)</span>
                    )}
                  </td>
                  {PERM_LABELS.map((p) => {
                    const allowed = ROLE_PERMISSIONS[role][p.key];
                    return (
                      <td key={p.key} className="py-2.5 px-2.5 text-center">
                        {allowed ? (
                          <Check className="w-4 h-4 text-[#188038] mx-auto" />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
