import React, { useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  createNotificationDoc,
  deleteNotificationDoc,
  markNotificationRead,
} from '../lib/firestoreService';
import { isTaskOverdue, validateRaciEntries } from '../lib/metrics';

const REMINDER_OPTIONS = [
  { days: 7, label: '7 Days Before' },
  { days: 3, label: '3 Days Before' },
  { days: 1, label: '1 Day Before' },
  { days: 0, label: 'On Due Date' },
];

export const NotificationsModule: React.FC = () => {
  const {
    user,
    profile,
    projects,
    tasks,
    meetings,
    raciEntries,
    notifications,
    setActiveNav,
    refreshProfile,
    notify,
  } = useApp();

  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const reminderDays = profile?.reminderDays || [7, 3, 1, 0];
  const emailAlerts = profile?.emailAlerts ?? true;

  const toggleReminderDay = async (day: number) => {
    const next = reminderDays.includes(day)
      ? reminderDays.filter((d) => d !== day)
      : [...reminderDays, day].sort((a, b) => b - a);
    await refreshProfile({ reminderDays: next });
    notify('success', 'Reminder schedule updated');
  };

  const handleScanAlerts = async () => {
    if (!user) return;
    setScanning(true);
    try {
      const today = new Date();
      const existingTitles = new Set(notifications.map((n) => n.title));
      let created = 0;

      // 1. Overdue tasks & upcoming deadlines
      for (const t of tasks) {
        if (t.status === 'Completed' || t.progress >= 100) continue;
        if (isTaskOverdue(t, today)) {
          const title = `Overdue: ${t.taskCode} ${t.name}`;
          if (!existingTitles.has(title)) {
            await createNotificationDoc(user.uid, {
              type: 'overdue',
              title,
              message: `${t.projectCode} task assigned to ${t.responsible} passed its ${t.plannedEnd} deadline (${t.progress}% complete).`,
              relatedEntityId: t.id,
              relatedEntityType: 'task',
              severity: 'critical',
              read: false,
            });
            created++;
          }
        } else {
          try {
            const daysLeft = differenceInCalendarDays(parseISO(t.plannedEnd), today);
            if (reminderDays.includes(daysLeft)) {
              const title = `Deadline in ${daysLeft}d: ${t.taskCode}`;
              if (!existingTitles.has(title)) {
                await createNotificationDoc(user.uid, {
                  type: 'deadline',
                  title,
                  message: `"${t.name}" (${t.projectCode}) is due on ${t.plannedEnd}.`,
                  relatedEntityId: t.id,
                  relatedEntityType: 'task',
                  severity: daysLeft <= 1 ? 'warning' : 'info',
                  read: false,
                });
                created++;
              }
            }
          } catch {
            // ignore date parse error
          }
        }

        if (t.status === 'Pending Approval') {
          const title = `Pending Approval: ${t.taskCode}`;
          if (!existingTitles.has(title)) {
            await createNotificationDoc(user.uid, {
              type: 'approval',
              title,
              message: `${t.name} (${t.projectCode}) requires executive approval.`,
              relatedEntityId: t.id,
              relatedEntityType: 'task',
              severity: 'warning',
              read: false,
            });
            created++;
          }
        }
      }

      // 2. Missed milestones
      const todayStr = today.toISOString().slice(0, 10);
      for (const p of projects) {
        for (const ms of p.milestones || []) {
          if (!ms.completed && ms.dueDate < todayStr) {
            const title = `Missed Milestone: ${p.projectCode} · ${ms.title}`;
            if (!existingTitles.has(title)) {
              await createNotificationDoc(user.uid, {
                type: 'milestone',
                title,
                message: `Milestone due ${ms.dueDate} on ${p.name} has not been marked complete.`,
                relatedEntityId: p.id,
                relatedEntityType: 'project',
                severity: 'critical',
                read: false,
              });
              created++;
            }
          }
        }
      }

      // 3. Upcoming meetings within 3 days
      for (const m of meetings) {
        try {
          const daysLeft = differenceInCalendarDays(parseISO(m.date), today);
          if (daysLeft >= 0 && daysLeft <= 3) {
            const title = `Meeting Reminder: ${m.title}`;
            if (!existingTitles.has(title)) {
              await createNotificationDoc(user.uid, {
                type: 'meeting',
                title,
                message: `${m.category} on ${m.date} (${m.startTime}–${m.endTime}) at ${m.venue}.`,
                relatedEntityId: m.id,
                relatedEntityType: 'meeting',
                severity: 'info',
                read: false,
              });
              created++;
            }
          }
        } catch {
          // ignore
        }
      }

      // 4. RACI validation conflicts
      const raciIssues = validateRaciEntries(raciEntries);
      for (const iss of raciIssues) {
        const title = `RACI Conflict: ${iss.projectCode} · ${iss.activity}`;
        if (!existingTitles.has(title)) {
          await createNotificationDoc(user.uid, {
            type: 'raci',
            title,
            message: iss.message,
            relatedEntityId: iss.entryId,
            relatedEntityType: 'raci',
            severity: 'warning',
            read: false,
          });
          created++;
        }
      }

      notify(
        'success',
        'Alert scan complete',
        created > 0
          ? `Generated ${created} new notification(s) from live project schedules.`
          : 'All current deadlines, meetings, and RACI alerts are already up to date.'
      );
    } finally {
      setScanning(false);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markNotificationRead(n.id, true)));
    notify('success', 'All notifications marked read');
  };

  const visible = notifications.filter((n) => (filter === 'unread' ? !n.read : true));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            Notifications &amp; Alert Center
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Deadline reminders, overdue escalations, pending approvals, and governance alerts.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={scanning}
            onClick={handleScanAlerts}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            Scan Live Schedules
          </button>
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold whitespace-nowrap"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark All Read
          </button>
        </div>
      </div>

      {/* Configurable Reminders Panel */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="font-semibold text-[#172B4D] dark:text-slate-200">
            Deadline Reminders:
          </span>
          {REMINDER_OPTIONS.map((opt) => (
            <label key={opt.days} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderDays.includes(opt.days)}
                onChange={() => toggleReminderDay(opt.days)}
                className="accent-[#1A73E8]"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={emailAlerts}
            onChange={(e) => refreshProfile({ emailAlerts: e.target.checked })}
            className="accent-[#1A73E8]"
          />
          <span>Email Digest Preference Enabled</span>
        </label>
      </div>

      {/* Filter Tabs & Alerts List */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium ${
                filter === 'all' ? 'bg-white dark:bg-slate-800 text-[#1A73E8] shadow-xs' : 'text-slate-500'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 rounded-md text-xs font-medium ${
                filter === 'unread' ? 'bg-white dark:bg-slate-800 text-[#1A73E8] shadow-xs' : 'text-slate-500'
              }`}
            >
              Unread ({notifications.filter((n) => !n.read).length})
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {visible.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <Bell className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              You are all caught up.
            </div>
          ) : (
            visible.map((n) => {
              const sevColor =
                n.severity === 'critical'
                  ? 'text-[#D93025]'
                  : n.severity === 'warning'
                  ? 'text-[#B06000] dark:text-amber-400'
                  : 'text-[#1A73E8]';
              return (
                <div
                  key={n.id}
                  className={`p-4 flex items-start justify-between gap-4 ${
                    !n.read ? 'bg-[#1A73E8]/[0.03] dark:bg-blue-950/15' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${sevColor}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`font-semibold ${sevColor}`}>{n.type.toUpperCase()}</span>
                        <span>·</span>
                        <span className="font-mono text-slate-400">
                          {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString() : 'Today'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[#172B4D] dark:text-slate-100 mt-0.5">
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</p>
                      {n.relatedEntityType && (
                        <button
                          type="button"
                          onClick={() => {
                            if (n.relatedEntityType === 'task') setActiveNav('tasks');
                            else if (n.relatedEntityType === 'meeting') setActiveNav('meetings');
                            else if (n.relatedEntityType === 'raci') setActiveNav('raci');
                            else setActiveNav('projects');
                          }}
                          className="mt-1.5 text-xs font-semibold text-[#1A73E8] hover:underline"
                        >
                          Open related module →
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id, true)}
                        aria-label="Mark as read"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-[#188038]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteNotificationDoc(n.id)}
                      aria-label="Delete notification"
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-[#D93025]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
