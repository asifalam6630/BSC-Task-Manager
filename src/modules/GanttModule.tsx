import React, { useMemo, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  max as maxDate,
  min as minDate,
  parseISO,
  subDays,
} from 'date-fns';
import {
  ChevronDown,
  ChevronRight,
  Diamond,
  MoveHorizontal,
  Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Task } from '../types';
import { updateTaskDoc } from '../lib/firestoreService';
import { getProjectWeightedProgress, isTaskOverdue } from '../lib/metrics';

interface GanttModuleProps {
  onEditTask: (task: Task) => void;
  onCreateTask: () => void;
}

type ZoomLevel = 'daily' | 'weekly' | 'monthly' | 'quarterly';

const ZOOM_PX_PER_DAY: Record<ZoomLevel, number> = {
  daily: 34,
  weekly: 16,
  monthly: 7,
  quarterly: 3.5,
};

export const GanttModule: React.FC<GanttModuleProps> = ({
  onEditTask,
  onCreateTask,
}) => {
  const { projects, tasks, notify } = useApp();
  const [zoom, setZoom] = useState<ZoomLevel>('weekly');
  const [projectFilter, setProjectFilter] = useState('all');
  const [showActualOverlay, setShowActualOverlay] = useState(true);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [dragState, setDragState] = useState<{
    taskId: string;
    startX: number;
    deltaDays: number;
  } | null>(null);

  const visibleProjects = useMemo(
    () =>
      projects.filter((p) => projectFilter === 'all' || p.id === projectFilter),
    [projects, projectFilter]
  );

  // Determine overall timeline range
  const { timelineStart, totalDays, daysArray } = useMemo(() => {
    const dates: Date[] = [new Date()];
    visibleProjects.forEach((p) => {
      try {
        dates.push(parseISO(p.startDate), parseISO(p.targetDate));
      } catch {
        // ignore invalid date
      }
      (p.milestones || []).forEach((ms) => {
        try {
          dates.push(parseISO(ms.dueDate));
        } catch {
          // ignore
        }
      });
    });
    tasks.forEach((t) => {
      if (projectFilter !== 'all' && t.projectId !== projectFilter) return;
      try {
        dates.push(parseISO(t.plannedStart), parseISO(t.plannedEnd));
      } catch {
        // ignore
      }
    });

    const validDates = dates.filter((d) => !Number.isNaN(d.getTime()));
    const start = subDays(minDate(validDates), 5);
    const end = addDays(maxDate(validDates), 14);
    const span = Math.max(30, differenceInCalendarDays(end, start) + 1);
    return {
      timelineStart: start,
      totalDays: span,
      daysArray: eachDayOfInterval({ start, end }),
    };
  }, [visibleProjects, tasks, projectFilter]);

  const pxPerDay = ZOOM_PX_PER_DAY[zoom];
  const chartWidth = Math.max(760, Math.round(totalDays * pxPerDay));

  const dateToX = (dateStr: string): number => {
    try {
      const diff = differenceInCalendarDays(parseISO(dateStr), timelineStart);
      return Math.round(diff * pxPerDay);
    } catch {
      return 0;
    }
  };

  const todayX = dateToX(format(new Date(), 'yyyy-MM-dd'));

  // Build flat display rows for SVG dependency lines
  type RowItem =
    | { kind: 'project'; id: string; project: (typeof projects)[0] }
    | { kind: 'task'; id: string; task: Task; color: string };

  const rows = useMemo<RowItem[]>(() => {
    const list: RowItem[] = [];
    visibleProjects.forEach((p) => {
      list.push({ kind: 'project', id: `p_${p.id}`, project: p });
      if (!collapsedProjects[p.id]) {
        const pTasks = tasks
          .filter((t) => t.projectId === p.id)
          .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
        pTasks.forEach((t) => list.push({ kind: 'task', id: t.id, task: t, color: p.color }));
      }
    });
    return list;
  }, [visibleProjects, tasks, collapsedProjects]);

  const ROW_H = 42;

  // Dependency connector paths
  const dependencyPaths = useMemo(() => {
    const rowIndexByTaskId = new Map<string, number>();
    const taskById = new Map<string, Task>();
    rows.forEach((r, idx) => {
      if (r.kind === 'task') {
        rowIndexByTaskId.set(r.task.id, idx);
        taskById.set(r.task.id, r.task);
      }
    });

    const lines: { key: string; d: string }[] = [];
    rows.forEach((r, idx) => {
      if (r.kind !== 'task' || !r.task.dependencies?.length) return;
      const toX = dateToX(r.task.plannedStart);
      const toY = idx * ROW_H + ROW_H / 2;
      r.task.dependencies.forEach((depId) => {
        const fromIdx = rowIndexByTaskId.get(depId);
        const fromTask = taskById.get(depId);
        if (fromIdx === undefined || !fromTask) return;
        const fromX =
          dateToX(fromTask.plannedEnd) + Math.max(pxPerDay, 8);
        const fromY = fromIdx * ROW_H + ROW_H / 2;
        const midX = Math.max(fromX + 8, toX - 10);
        const d = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
        lines.push({ key: `${depId}->${r.task.id}`, d });
      });
    });
    return lines;
  }, [rows, pxPerDay, timelineStart]);

  const handleShiftTaskDays = async (task: Task, shiftDays: number) => {
    if (shiftDays === 0) return;
    try {
      const nextStart = format(addDays(parseISO(task.plannedStart), shiftDays), 'yyyy-MM-dd');
      const nextEnd = format(addDays(parseISO(task.plannedEnd), shiftDays), 'yyyy-MM-dd');
      await updateTaskDoc(task.id, { plannedStart: nextStart, plannedEnd: nextEnd });
      notify(
        'success',
        `Timeline shifted (${shiftDays > 0 ? '+' : ''}${shiftDays}d)`,
        `${task.taskCode} updated to ${nextStart} → ${nextEnd}.`
      );
    } catch (err) {
      notify('error', 'Timeline update failed', err instanceof Error ? err.message : 'Error');
    }
  };

  // Drag-to-adjust horizontal timeline handler
  const onPointerDownBar = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const startX = e.clientX;
    setDragState({ taskId: task.id, startX, deltaDays: 0 });

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dDays = Math.round(dx / pxPerDay);
      setDragState({ taskId: task.id, startX, deltaDays: dDays });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const dx = ev.clientX - startX;
      const dDays = Math.round(dx / pxPerDay);
      setDragState(null);
      if (dDays !== 0) {
        handleShiftTaskDays(task, dDays);
      } else {
        onEditTask(task);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Header tick buckets
  const headerTicks = useMemo(() => {
    const ticks: { label: string; left: number; width: number }[] = [];
    if (zoom === 'daily') {
      daysArray.forEach((d, idx) => {
        ticks.push({
          label: format(d, 'dd MMM'),
          left: idx * pxPerDay,
          width: pxPerDay,
        });
      });
    } else if (zoom === 'weekly') {
      for (let i = 0; i < daysArray.length; i += 7) {
        ticks.push({
          label: `W${format(daysArray[i], 'w')} · ${format(daysArray[i], 'MMM d')}`,
          left: i * pxPerDay,
          width: Math.min(7, daysArray.length - i) * pxPerDay,
        });
      }
    } else {
      // Group by Month
      let i = 0;
      while (i < daysArray.length) {
        const mKey = format(daysArray[i], 'yyyy-MM');
        let j = i;
        while (j < daysArray.length && format(daysArray[j], 'yyyy-MM') === mKey) j++;
        ticks.push({
          label: format(daysArray[i], zoom === 'quarterly' ? 'MMM yy' : 'MMMM yyyy'),
          left: i * pxPerDay,
          width: (j - i) * pxPerDay,
        });
        i = j;
      }
    }
    return ticks;
  }, [daysArray, zoom, pxPerDay]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            Gantt Chart &amp; Project Timeline
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Drag any task bar horizontally to adjust dates, or click to edit · Dependencies &amp; milestones shown live.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateTask}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Timeline Task
        </button>
      </div>

      {/* Controls */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
          >
            <option value="all">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode} — {p.name}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showActualOverlay}
              onChange={(e) => setShowActualOverlay(e.target.checked)}
              className="accent-[#1A73E8]"
            />
            Show Progress &amp; Planned Comparison
          </label>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'quarterly', label: 'Quarterly' },
            ] as const
          ).map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setZoom(z.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                zoom === z.id
                  ? 'bg-white dark:bg-slate-800 text-[#1A73E8] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gantt Grid */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="flex overflow-x-auto">
          {/* Frozen Left Hierarchy Column */}
          <div className="w-[270px] sm:w-[310px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10">
            <div className="h-10 px-4 border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Project / Task</span>
              <span>Progress</span>
            </div>
            <div>
              {rows.map((row) => {
                if (row.kind === 'project') {
                  const p = row.project;
                  const pct = getProjectWeightedProgress(p.id, tasks);
                  const isCollapsed = Boolean(collapsedProjects[p.id]);
                  return (
                    <div
                      key={row.id}
                      style={{ height: ROW_H }}
                      className="px-3 border-b border-slate-100 dark:border-slate-800 bg-[#F7F9FC]/80 dark:bg-slate-950/40 flex items-center justify-between gap-2 text-xs font-bold text-[#172B4D] dark:text-slate-100"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedProjects((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                        }
                        className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        )}
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="font-mono">{p.projectCode}</span>
                        <span className="truncate font-semibold">{p.name}</span>
                      </button>
                      <span className="font-mono text-[11px] text-[#1A73E8] shrink-0">{pct}%</span>
                    </div>
                  );
                }

                const t = row.task;
                const overdue = isTaskOverdue(t);
                return (
                  <div
                    key={row.id}
                    style={{ height: ROW_H }}
                    onClick={() => onEditTask(t)}
                    className="px-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer flex items-center justify-between gap-2 text-xs"
                  >
                    <div className={`min-w-0 flex-1 ${t.parentTaskId ? 'pl-5' : 'pl-3'}`}>
                      <p className="truncate text-[#172B4D] dark:text-slate-200 font-medium">
                        <span className="font-mono text-slate-400 mr-1.5">{t.taskCode}</span>
                        {t.name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {t.responsible}
                        {overdue ? ' · Overdue' : ''}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-[11px] font-semibold shrink-0 ${
                        overdue ? 'text-[#D93025]' : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t.progress}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Scrollable Timeline Canvas */}
          <div className="flex-1 overflow-x-auto">
            <div style={{ width: chartWidth }} className="relative">
              {/* Time Axis Header */}
              <div className="h-10 border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 relative">
                {headerTicks.map((tick, idx) => (
                  <div
                    key={idx}
                    style={{ left: tick.left, width: tick.width }}
                    className="absolute top-0 bottom-0 border-r border-slate-200/70 dark:border-slate-800 px-2 flex items-center text-[11px] font-mono text-slate-500 truncate"
                  >
                    {tick.label}
                  </div>
                ))}
              </div>

              {/* Rows + Bars + SVG Dependency Connectors */}
              <div className="relative" style={{ height: rows.length * ROW_H }}>
                {/* Vertical Today Indicator */}
                <div
                  style={{ left: todayX }}
                  className="absolute top-0 bottom-0 w-px bg-[#D93025] z-20 pointer-events-none"
                >
                  <span className="absolute -top-0.5 -translate-x-1/2 px-1 py-0.5 rounded bg-[#D93025] text-white text-[9px] font-mono">
                    Today
                  </span>
                </div>

                {/* Dependency SVG Overlay */}
                <svg
                  width={chartWidth}
                  height={rows.length * ROW_H}
                  className="absolute inset-0 pointer-events-none z-10"
                >
                  {dependencyPaths.map((line) => (
                    <path
                      key={line.key}
                      d={line.d}
                      fill="none"
                      stroke="#94A3B8"
                      strokeWidth="1.25"
                      strokeDasharray="3 2"
                    />
                  ))}
                </svg>

                {rows.map((row, idx) => {
                  const top = idx * ROW_H;
                  if (row.kind === 'project') {
                    const p = row.project;
                    const left = dateToX(p.startDate);
                    const width = Math.max(18, dateToX(p.targetDate) - left + pxPerDay);
                    const pct = getProjectWeightedProgress(p.id, tasks);

                    return (
                      <div
                        key={row.id}
                        style={{ top, height: ROW_H }}
                        className="absolute left-0 right-0 border-b border-slate-100 dark:border-slate-800 bg-[#F7F9FC]/40 dark:bg-slate-950/20"
                      >
                        {/* Project Summary Bracket Bar */}
                        <div
                          style={{ left, width, backgroundColor: `${p.color}25`, borderColor: p.color }}
                          className="absolute top-3.5 h-3.5 rounded border"
                        >
                          <div
                            style={{ width: `${pct}%`, backgroundColor: p.color }}
                            className="h-full rounded-xs opacity-85"
                          />
                        </div>

                        {/* Project Milestones Diamonds */}
                        {(p.milestones || []).map((ms) => {
                          const mx = dateToX(ms.dueDate);
                          return (
                            <div
                              key={ms.id}
                              style={{ left: mx - 6 }}
                              title={`Milestone: ${ms.title} (${ms.dueDate})`}
                              className="absolute top-3 z-20"
                            >
                              <Diamond
                                className={`w-3.5 h-3.5 ${
                                  ms.completed
                                    ? 'fill-[#188038] text-[#188038]'
                                    : 'fill-[#F9AB00] text-[#B06000]'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  const t = row.task;
                  const overdue = isTaskOverdue(t);
                  const shift = dragState?.taskId === t.id ? dragState.deltaDays * pxPerDay : 0;
                  const left = dateToX(t.plannedStart) + shift;
                  const width = Math.max(24, dateToX(t.plannedEnd) - dateToX(t.plannedStart) + pxPerDay);
                  const barColor = overdue ? '#D93025' : row.color;

                  return (
                    <div
                      key={row.id}
                      style={{ top, height: ROW_H }}
                      className="absolute left-0 right-0 border-b border-slate-100 dark:border-slate-800"
                    >
                      <div
                        onMouseDown={(e) => onPointerDownBar(e, t)}
                        title={`${t.taskCode}: ${t.name} (${t.plannedStart} → ${t.plannedEnd}) · ${t.progress}% · Drag to reschedule`}
                        style={{
                          left,
                          width,
                          backgroundColor: `${barColor}30`,
                          borderColor: barColor,
                        }}
                        className="absolute top-2 h-6 rounded border cursor-grab active:cursor-grabbing overflow-hidden group z-20 select-none"
                      >
                        {showActualOverlay && (
                          <div
                            style={{ width: `${t.progress}%`, backgroundColor: barColor }}
                            className="h-full transition-all"
                          />
                        )}
                        <span className="absolute inset-0 px-2 flex items-center justify-between text-[10px] font-semibold text-[#172B4D] dark:text-white truncate drop-shadow-xs">
                          <span className="truncate">{t.taskCode}</span>
                          <MoveHorizontal className="w-3 h-3 opacity-0 group-hover:opacity-80 shrink-0" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
