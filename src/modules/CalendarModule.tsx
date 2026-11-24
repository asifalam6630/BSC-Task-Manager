import React, { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  CloudUpload,
  Link2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DEPARTMENTS, Meeting, Task } from '../types';
import { updateMeetingDoc, updateTaskDoc } from '../lib/firestoreService';
import {
  GoogleCalendarEvent,
  listGoogleCalendarEvents,
  upsertMeetingToGoogleCalendar,
  upsertTaskToGoogleCalendar,
} from '../lib/googleCalendar';

interface CalendarModuleProps {
  onEditTask: (task: Task) => void;
  onEditMeeting: (meeting: Meeting) => void;
  onCreateTaskOnDate: (date: string) => void;
  onCreateMeetingOnDate: (date: string) => void;
}

type CalView = 'day' | 'week' | 'month' | 'year' | 'agenda';

interface UnifiedEvent {
  id: string;
  kind: 'task' | 'meeting' | 'milestone' | 'google_external';
  title: string;
  projectCode: string;
  projectId?: string;
  department?: string;
  responsible?: string;
  startDate: string;
  endDate: string;
  timeLabel?: string;
  color: string;
  status?: string;
  synced?: boolean;
  task?: Task;
  meeting?: Meeting;
  externalEvent?: GoogleCalendarEvent;
}

export const CalendarModule: React.FC<CalendarModuleProps> = ({
  onEditTask,
  onEditMeeting,
  onCreateTaskOnDate,
  onCreateMeetingOnDate,
}) => {
  const {
    projects,
    tasks,
    meetings,
    calendarToken,
    connectGoogleCalendar,
    confirm,
    notify,
    selectedDate,
    setSelectedDate,
  } = useApp();

  const [view, setView] = useState<CalView>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => {
    const parsed = parseISO(selectedDate);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });
  const [projectFilter, setProjectFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [showTasks, setShowTasks] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);

  const [externalEvents, setExternalEvents] = useState<GoogleCalendarEvent[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const projectMap = useMemo(() => {
    const m = new Map<string, (typeof projects)[0]>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const unifiedEvents = useMemo<UnifiedEvent[]>(() => {
    const list: UnifiedEvent[] = [];

    if (showTasks) {
      tasks.forEach((t) => {
        if (projectFilter !== 'all' && t.projectId !== projectFilter) return;
        if (deptFilter !== 'all' && t.department !== deptFilter) return;
        const p = projectMap.get(t.projectId);
        list.push({
          id: `t_${t.id}`,
          kind: 'task',
          title: `${t.taskCode}: ${t.name}`,
          projectCode: t.projectCode,
          projectId: t.projectId,
          department: t.department,
          responsible: t.responsible,
          startDate: t.plannedStart,
          endDate: t.plannedEnd,
          color: p?.color || '#1A73E8',
          status: t.status,
          synced: t.syncStatus === 'synced',
          task: t,
        });
      });
    }

    if (showMeetings) {
      meetings.forEach((m) => {
        if (projectFilter !== 'all' && m.projectId !== projectFilter) return;
        const p = projectMap.get(m.projectId);
        if (deptFilter !== 'all' && p?.department !== deptFilter) return;
        list.push({
          id: `m_${m.id}`,
          kind: 'meeting',
          title: m.title,
          projectCode: m.projectCode,
          projectId: m.projectId,
          department: p?.department,
          responsible: m.chairperson,
          startDate: m.date,
          endDate: m.date,
          timeLabel: `${m.startTime}–${m.endTime}`,
          color: '#9334E6',
          status: m.category,
          synced: m.syncStatus === 'synced',
          meeting: m,
        });
      });
    }

    if (showMilestones) {
      projects.forEach((p) => {
        if (projectFilter !== 'all' && p.id !== projectFilter) return;
        if (deptFilter !== 'all' && p.department !== deptFilter) return;
        (p.milestones || []).forEach((ms) => {
          list.push({
            id: `ms_${p.id}_${ms.id}`,
            kind: 'milestone',
            title: `Milestone: ${ms.title}`,
            projectCode: p.projectCode,
            projectId: p.id,
            department: p.department,
            responsible: p.projectOwner,
            startDate: ms.dueDate,
            endDate: ms.dueDate,
            color: '#188038',
            status: ms.completed ? 'Completed' : 'Upcoming',
          });
        });
      });
    }

    // External Google Calendar events pulled during two-way sync
    externalEvents.forEach((ev) => {
      if (ev.extendedProperties?.private?.taskMasterId) return; // already displayed as linked task/meeting
      const s = ev.start?.date || ev.start?.dateTime?.slice(0, 10);
      if (!s) return;
      const e = ev.end?.date
        ? format(subDays(parseISO(ev.end.date), 1), 'yyyy-MM-dd')
        : ev.end?.dateTime?.slice(0, 10) || s;
      list.push({
        id: `gcal_${ev.id}`,
        kind: 'google_external',
        title: ev.summary || '(Google Calendar Event)',
        projectCode: 'GCal',
        startDate: s,
        endDate: e < s ? s : e,
        timeLabel: ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : 'All day',
        color: '#475569',
        synced: true,
        externalEvent: ev,
      });
    });

    return list;
  }, [
    tasks,
    meetings,
    projects,
    externalEvents,
    projectFilter,
    deptFilter,
    showTasks,
    showMeetings,
    showMilestones,
    projectMap,
  ]);

  const eventsOnDate = (dayStr: string) =>
    unifiedEvents.filter((ev) => ev.startDate <= dayStr && ev.endDate >= dayStr);

  // Drag-and-drop rescheduling (shifts task start & end preserving duration)
  const handleDropOnDate = async (targetDateStr: string) => {
    if (!draggingTaskId) return;
    const task = tasks.find((t) => t.id === draggingTaskId);
    setDraggingTaskId(null);
    if (!task || task.plannedStart === targetDateStr) return;

    try {
      const duration = Math.max(
        0,
        differenceInCalendarDays(parseISO(task.plannedEnd), parseISO(task.plannedStart))
      );
      const newEnd = format(addDays(parseISO(targetDateStr), duration), 'yyyy-MM-dd');
      await updateTaskDoc(task.id, {
        plannedStart: targetDateStr,
        plannedEnd: newEnd,
      });
      notify(
        'success',
        `Rescheduled ${task.taskCode}`,
        `Moved to ${targetDateStr} → ${newEnd} across Calendar & Gantt.`
      );
    } catch (err) {
      notify('error', 'Reschedule failed', err instanceof Error ? err.message : 'Error');
    }
  };

  // Export filtered tasks & meetings to Google Calendar (with MANDATORY user confirmation dialog)
  const handleExportToGoogleCalendar = async () => {
    const targetTasks = tasks.filter(
      (t) =>
        (projectFilter === 'all' || t.projectId === projectFilter) &&
        (deptFilter === 'all' || t.department === deptFilter)
    );
    const targetMeetings = meetings.filter(
      (m) => projectFilter === 'all' || m.projectId === projectFilter
    );

    const total = targetTasks.length + targetMeetings.length;
    if (total === 0) {
      notify('info', 'Nothing to export', 'No tasks or meetings match the current filter.');
      return;
    }

    const previewItems = [
      ...targetTasks.map((t) => `[Task ${t.projectCode}] ${t.taskCode}: ${t.name} (${t.plannedStart})`),
      ...targetMeetings.map((m) => `[Meeting ${m.projectCode}] ${m.title} (${m.date} ${m.startTime})`),
    ];

    const confirmed = await confirm({
      title: `Sync ${total} item(s) to Google Calendar?`,
      description:
        'Task Master will create new events or update previously synced events on your primary Google Calendar. Existing linked events are deduplicated automatically.',
      items: previewItems,
      confirmLabel: 'Confirm & Sync',
      tone: 'primary',
    });
    if (!confirmed) return;

    setSyncBusy(true);
    try {
      const token = calendarToken || (await connectGoogleCalendar());
      if (!token) return;

      let created = 0;
      let updated = 0;
      let errors = 0;
      const nowIso = new Date().toISOString();

      for (const task of targetTasks) {
        try {
          const proj = projectMap.get(task.projectId);
          const res = await upsertTaskToGoogleCalendar(token, task, proj);
          await updateTaskDoc(task.id, {
            googleEventId: res.googleEventId,
            syncStatus: 'synced',
            lastSyncedAt: nowIso,
          });
          if (res.updated) updated++;
          else created++;
        } catch {
          errors++;
        }
      }

      for (const mtg of targetMeetings) {
        try {
          const proj = projectMap.get(mtg.projectId);
          const res = await upsertMeetingToGoogleCalendar(token, mtg, proj);
          await updateMeetingDoc(mtg.id, {
            googleEventId: res.googleEventId,
            syncStatus: 'synced',
            lastSyncedAt: nowIso,
          });
          if (res.updated) updated++;
          else created++;
        } catch {
          errors++;
        }
      }

      notify(
        errors > 0 ? 'info' : 'success',
        'Google Calendar sync complete',
        `Created ${created}, updated ${updated}${errors > 0 ? `, ${errors} error(s)` : ''}.`
      );
    } catch (err) {
      notify(
        'error',
        'Google Calendar sync failed',
        err instanceof Error ? err.message : 'Authorization or API error'
      );
    } finally {
      setSyncBusy(false);
    }
  };

  // Two-way Pull from Google Calendar
  const handlePullFromGoogleCalendar = async () => {
    setSyncBusy(true);
    try {
      const token = calendarToken || (await connectGoogleCalendar());
      if (!token) return;

      const minIso = subMonths(cursorDate, 2).toISOString();
      const maxIso = addMonths(cursorDate, 4).toISOString();
      const remoteEvents = await listGoogleCalendarEvents(token, minIso, maxIso);
      setExternalEvents(remoteEvents);

      // Reconcile date edits made directly in Google Calendar back to linked Task Master tasks
      let reconciled = 0;
      for (const ev of remoteEvents) {
        const tmId = ev.extendedProperties?.private?.taskMasterId;
        const tmType = ev.extendedProperties?.private?.taskMasterType;
        if (tmId && tmType === 'task' && ev.start?.date) {
          const localTask = tasks.find((t) => t.id === tmId);
          const remoteEnd = ev.end?.date
            ? format(subDays(parseISO(ev.end.date), 1), 'yyyy-MM-dd')
            : ev.start.date;
          if (
            localTask &&
            (localTask.plannedStart !== ev.start.date || localTask.plannedEnd !== remoteEnd)
          ) {
            await updateTaskDoc(localTask.id, {
              plannedStart: ev.start.date,
              plannedEnd: remoteEnd >= ev.start.date ? remoteEnd : ev.start.date,
            });
            reconciled++;
          }
        }
      }

      notify(
        'success',
        'Pulled Google Calendar events',
        `Loaded ${remoteEvents.length} calendar event(s)${
          reconciled > 0 ? ` and updated ${reconciled} modified task schedule(s).` : '.'
        }`
      );
    } catch (err) {
      notify(
        'error',
        'Failed to pull Google Calendar',
        err instanceof Error && err.message === 'GOOGLE_TOKEN_EXPIRED'
          ? 'Session token expired. Click Connect Google Calendar to renew.'
          : err instanceof Error
          ? err.message
          : 'Error'
      );
    } finally {
      setSyncBusy(false);
    }
  };

  const navigate = (dir: -1 | 1) => {
    if (view === 'day') setCursorDate((d) => (dir === 1 ? addDays(d, 1) : subDays(d, 1)));
    else if (view === 'week') setCursorDate((d) => (dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)));
    else if (view === 'year') setCursorDate((d) => (dir === 1 ? addYears(d, 1) : subYears(d, 1)));
    else setCursorDate((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)));
  };

  const headerLabel = useMemo(() => {
    if (view === 'day') return format(cursorDate, 'EEEE, MMMM d, yyyy');
    if (view === 'week') {
      const s = startOfWeek(cursorDate);
      const e = endOfWeek(cursorDate);
      return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
    }
    if (view === 'year') return format(cursorDate, 'yyyy');
    return format(cursorDate, 'MMMM yyyy');
  }, [cursorDate, view]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursorDate));
    const end = endOfWeek(endOfMonth(cursorDate));
    return eachDayOfInterval({ start, end });
  }, [cursorDate]);

  const weekDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(cursorDate),
      end: endOfWeek(cursorDate),
    });
  }, [cursorDate]);

  const handleEventClick = (ev: UnifiedEvent) => {
    if (ev.task) onEditTask(ev.task);
    else if (ev.meeting) onEditMeeting(ev.meeting);
  };

  return (
    <div className="space-y-5">
      {/* Header & Google Calendar Sync Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            Consolidated Calendar &amp; Google Sync
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Drag any task card onto a new date to reschedule · Two-way Google Calendar integration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!calendarToken ? (
            <button
              type="button"
              onClick={() => connectGoogleCalendar()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#172B4D] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Link2 className="w-3.5 h-3.5 text-[#1A73E8]" />
              Connect Google Calendar
            </button>
          ) : (
            <span className="text-xs font-medium text-[#188038] dark:text-emerald-400 px-2">
              Google Calendar Connected
            </span>
          )}

          <button
            type="button"
            disabled={syncBusy}
            onClick={handlePullFromGoogleCalendar}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#172B4D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
          >
            {syncBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5 text-[#1A73E8]" />}
            Pull from GCal
          </button>

          <button
            type="button"
            disabled={syncBusy}
            onClick={handleExportToGoogleCalendar}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            Sync to Google Calendar
          </button>
        </div>
      </div>

      {/* Calendar Controls Bar */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCursorDate(now);
              setSelectedDate(format(now, 'yyyy-MM-dd'));
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Today
          </button>
          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Previous period"
              className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-l-lg"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label="Next period"
              className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-r-lg"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <h2 className="font-display text-base font-bold text-[#172B4D] dark:text-white ml-1">
            {headerLabel}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
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
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'day', label: 'Day' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
                { id: 'year', label: 'Year' },
                { id: 'agenda', label: 'Agenda' },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === v.id
                    ? 'bg-white dark:bg-slate-800 text-[#1A73E8] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Layer Toggles & Quick Add */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} className="accent-[#1A73E8]" />
            <span>Tasks (Project Colors)</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showMeetings} onChange={(e) => setShowMeetings(e.target.checked)} className="accent-[#9334E6]" />
            <span className="text-[#9334E6] dark:text-purple-400 font-medium">Meetings</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showMilestones} onChange={(e) => setShowMilestones(e.target.checked)} className="accent-[#188038]" />
            <span className="text-[#188038] dark:text-emerald-400 font-medium">Milestones</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCreateTaskOnDate(format(cursorDate, 'yyyy-MM-dd'))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Task
          </button>
          <button
            type="button"
            onClick={() => onCreateMeetingOnDate(format(cursorDate, 'yyyy-MM-dd'))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium text-[#9334E6] dark:text-purple-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Meeting
          </button>
        </div>
      </div>

      {/* MONTHLY VIEW */}
      {view === 'month' && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 text-center"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
            {monthDays.map((day) => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const isToday = isSameDay(day, new Date());
              const inMonth = isSameMonth(day, cursorDate);
              const dayEvents = eventsOnDate(dayStr);

              return (
                <div
                  key={dayStr}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropOnDate(dayStr)}
                  className={`min-h-[118px] p-1.5 flex flex-col gap-1 transition-colors ${
                    !inMonth
                      ? 'bg-slate-50/70 dark:bg-slate-950/50 text-slate-400'
                      : 'bg-white dark:bg-slate-900'
                  } ${draggingTaskId ? 'hover:bg-[#1A73E8]/10' : ''}`}
                >
                  <div className="flex items-center justify-between px-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCursorDate(day);
                        setView('day');
                      }}
                      className={`w-6 h-6 rounded-full text-xs font-mono font-semibold flex items-center justify-center ${
                        isToday
                          ? 'bg-[#1A73E8] text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {format(day, 'd')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onCreateTaskOnDate(dayStr)}
                      aria-label={`Add event on ${dayStr}`}
                      className="opacity-0 hover:opacity-100 focus:opacity-100 p-0.5 text-slate-400 hover:text-[#1A73E8]"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[86px]">
                    {dayEvents.slice(0, 4).map((ev) => (
                      <div
                        key={ev.id}
                        draggable={ev.kind === 'task'}
                        onDragStart={() => ev.task && setDraggingTaskId(ev.task.id)}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onClick={() => handleEventClick(ev)}
                        title={`${ev.title} (${ev.projectCode}) · ${ev.startDate} to ${ev.endDate}`}
                        className="px-1.5 py-0.5 rounded text-[11px] font-medium text-white truncate cursor-pointer hover:opacity-90"
                        style={{ backgroundColor: ev.color }}
                      >
                        {ev.timeLabel ? `${ev.timeLabel.slice(0, 5)} ` : ''}
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 4 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCursorDate(day);
                          setView('day');
                        }}
                        className="text-[10px] font-semibold text-[#1A73E8] px-1 hover:underline"
                      >
                        +{dayEvents.length - 4} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEKLY VIEW */}
      {view === 'week' && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
          <div className="min-w-[780px] grid grid-cols-7 divide-x divide-slate-200 dark:divide-slate-800">
            {weekDays.map((day) => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const isToday = isSameDay(day, new Date());
              const dayEvents = eventsOnDate(dayStr);

              return (
                <div
                  key={dayStr}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropOnDate(dayStr)}
                  className="min-h-[420px] flex flex-col"
                >
                  <div
                    className={`p-3 border-b border-slate-200 dark:border-slate-800 text-center ${
                      isToday ? 'bg-[#1A73E8]/10' : 'bg-[#F7F9FC] dark:bg-slate-950/50'
                    }`}
                  >
                    <p className="text-[11px] font-medium text-slate-500">{format(day, 'EEE')}</p>
                    <p
                      className={`font-mono text-lg font-bold ${
                        isToday ? 'text-[#1A73E8]' : 'text-[#172B4D] dark:text-white'
                      }`}
                    >
                      {format(day, 'd')}
                    </p>
                  </div>
                  <div className="p-2 space-y-2 flex-1">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        draggable={ev.kind === 'task'}
                        onDragStart={() => ev.task && setDraggingTaskId(ev.task.id)}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onClick={() => handleEventClick(ev)}
                        className="p-2 rounded-lg text-xs text-white cursor-pointer hover:opacity-95"
                        style={{ backgroundColor: ev.color }}
                      >
                        <p className="font-semibold leading-snug">{ev.title}</p>
                        <p className="text-[10px] opacity-90 mt-0.5">
                          {ev.projectCode} {ev.responsible ? `· ${ev.responsible}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DAILY VIEW */}
      {view === 'day' && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
          {(() => {
            const dayStr = format(cursorDate, 'yyyy-MM-dd');
            const dayEvents = eventsOnDate(dayStr);
            if (dayEvents.length === 0) {
              return (
                <div className="py-12 text-center">
                  <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-500">
                    No tasks, meetings, or milestones scheduled on {dayStr}.
                  </p>
                </div>
              );
            }
            return dayEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => handleEventClick(ev)}
                className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#1A73E8]/50 cursor-pointer flex items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className="w-3 h-3 rounded-xs mt-1 shrink-0"
                    style={{ backgroundColor: ev.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#172B4D] dark:text-slate-100">
                      {ev.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {ev.projectCode} · {ev.kind.replace('_', ' ')}
                      {ev.responsible ? ` · ${ev.responsible}` : ''}
                      {ev.status ? ` · ${ev.status}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right font-mono text-xs text-slate-500 shrink-0">
                  <p>{ev.timeLabel || `${ev.startDate} → ${ev.endDate}`}</p>
                  {ev.synced && <p className="text-[#188038] text-[11px]">Synced</p>}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* YEARLY VIEW */}
      {view === 'year' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, monthIdx) => {
            const mDate = new Date(cursorDate.getFullYear(), monthIdx, 1);
            const mStr = format(mDate, 'yyyy-MM');
            const mEvents = unifiedEvents.filter(
              (ev) => ev.startDate.slice(0, 7) <= mStr && ev.endDate.slice(0, 7) >= mStr
            );
            const daysInM = eachDayOfInterval({
              start: startOfMonth(mDate),
              end: endOfMonth(mDate),
            });

            return (
              <div
                key={monthIdx}
                onClick={() => {
                  setCursorDate(mDate);
                  setView('month');
                }}
                className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-[#1A73E8]/50 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
                    {format(mDate, 'MMMM')}
                  </h3>
                  <span className="font-mono text-xs text-[#1A73E8] font-semibold">
                    {mEvents.length} events
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono">
                  {daysInM.map((d) => {
                    const ds = format(d, 'yyyy-MM-dd');
                    const has = mEvents.some((ev) => ev.startDate <= ds && ev.endDate >= ds);
                    return (
                      <span
                        key={ds}
                        className={`py-0.5 rounded ${
                          has
                            ? 'bg-[#1A73E8]/15 text-[#1A73E8] font-bold'
                            : 'text-slate-400'
                        }`}
                      >
                        {format(d, 'd')}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AGENDA VIEW */}
      {view === 'agenda' && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {unifiedEvents.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">No scheduled events.</p>
          ) : (
            [...unifiedEvents]
              .sort((a, b) => a.startDate.localeCompare(b.startDate))
              .map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => handleEventClick(ev)}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-2.5 h-8 rounded-xs shrink-0"
                      style={{ backgroundColor: ev.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#172B4D] dark:text-slate-100 truncate">
                        {ev.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ev.projectCode} · {ev.kind.replace('_', ' ')}
                        {ev.responsible ? ` · ${ev.responsible}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right font-mono text-xs text-slate-600 dark:text-slate-400 shrink-0">
                    <p>
                      {ev.startDate}
                      {ev.endDate !== ev.startDate ? ` → ${ev.endDate}` : ''}
                    </p>
                    {ev.timeLabel && <p className="text-[11px] text-[#9334E6]">{ev.timeLabel}</p>}
                  </div>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
};
