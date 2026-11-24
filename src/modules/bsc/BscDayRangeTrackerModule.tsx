import React, { useMemo, useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { useApp } from '../../context/AppContext';
import { DAY_RANGE_BUCKETS } from '../../types/bsc';
import {
  computeCharterBscProgress,
  computeMilestoneBscProgress,
  computeSlippageDays,
  computeTaskRag,
  getRagBadgeClasses,
  getRagDotColor,
  parseDateSafe,
} from '../../lib/bscMetrics';
import { BscGovernanceBar } from '../../components/bsc/BscGovernanceBar';

interface BscDayRangeTrackerModuleProps {
  onCreateTask: () => void;
}

export const BscDayRangeTrackerModule: React.FC<BscDayRangeTrackerModuleProps> = ({
  onCreateTask,
}) => {
  const { projectCharters, bscTasks, bscSimulatedDate, setActiveBscTaskId } = useApp();
  const [selectedCharterId, setSelectedCharterId] = useState<string>('ALL');
  const refDate = parseDateSafe(bscSimulatedDate) || new Date();

  const visibleCharters = useMemo(
    () =>
      selectedCharterId === 'ALL'
        ? projectCharters
        : projectCharters.filter((c) => c.id === selectedCharterId),
    [projectCharters, selectedCharterId]
  );

  return (
    <div className="space-y-5">
      <BscGovernanceBar
        title="Day-Range Milestone Tracker (15d – 365d / New FY)"
        subtitle="Charter → Milestone → Task buckets with live Baseline vs. Current schedule bars and Simulated Date line"
        onCreateTask={onCreateTask}
        extraActions={
          <select
            aria-label="Filter Day-Range Tracker by Charter"
            value={selectedCharterId}
            onChange={(e) => setSelectedCharterId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
          >
            <option value="ALL">All Project Charters</option>
            {projectCharters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.charterCode} — {c.title.slice(0, 36)}
              </option>
            ))}
          </select>
        }
      />

      {visibleCharters.length === 0 ? (
        <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
          No project charters available. Load TG-BSC05 Seed or create a charter in Portfolio &amp; Charters.
        </div>
      ) : (
        visibleCharters.map((charter) => {
          const chTasks = bscTasks.filter((t) => t.charterId === charter.id);
          const chPct = computeCharterBscProgress(charter.id, bscTasks);
          const chStart = parseDateSafe(charter.startDate) || refDate;
          const chEnd = parseDateSafe(charter.targetDate) || refDate;
          const totalSpan = Math.max(1, differenceInCalendarDays(chEnd, chStart));
          const todayOffsetPct = Math.min(
            100,
            Math.max(0, (differenceInCalendarDays(refDate, chStart) / totalSpan) * 100)
          );

          return (
            <section
              key={charter.id}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Charter Header */}
              <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-xs text-[#1A73E8]">
                    {charter.charterCode}
                  </span>{' '}
                  <span className="text-xs font-bold text-[#172B4D] dark:text-white">
                    {charter.title}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-slate-500">
                    {charter.startDate} → {charter.targetDate}
                  </span>
                  <span className="font-bold text-[#172B4D] dark:text-white">
                    Weighted: {chPct}%
                  </span>
                </div>
              </div>

              {/* 8-Column Day-Range Matrix */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[1080px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500">
                      <th className="px-3 py-2.5 w-52 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-800">
                        Milestone &amp; % Complete
                      </th>
                      {DAY_RANGE_BUCKETS.map((bucket) => (
                        <th
                          key={bucket}
                          className="px-2 py-2.5 text-center font-mono border-r border-slate-200/70 dark:border-slate-800 last:border-r-0"
                        >
                          {bucket}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                    {charter.milestones.map((ms) => {
                      const msPct = computeMilestoneBscProgress(ms.id, bscTasks);
                      const msTasks = chTasks.filter((t) => t.milestoneId === ms.id);
                      return (
                        <tr key={ms.id} className="align-top">
                          <td className="px-3 py-3 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-800">
                            <div className="font-mono text-[11px] font-bold text-[#1A73E8]">
                              M{String(ms.milestoneNumber).padStart(2, '0')} · {ms.status}
                            </div>
                            <div className="font-semibold text-[#172B4D] dark:text-white mt-0.5 leading-snug">
                              {ms.title}
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-[#188038] rounded-full"
                                  style={{ width: `${msPct}%` }}
                                />
                              </div>
                              <span className="font-mono text-[11px] font-bold tabular-nums">
                                {msPct}%
                              </span>
                            </div>
                          </td>

                          {DAY_RANGE_BUCKETS.map((bucket) => {
                            const bucketTasks = msTasks.filter((t) => t.dayRangeBucket === bucket);
                            return (
                              <td
                                key={bucket}
                                className="p-2 border-r border-slate-100 dark:border-slate-800/70 last:border-r-0 bg-white dark:bg-slate-900"
                              >
                                <div className="space-y-1.5">
                                  {bucketTasks.map((t) => {
                                    const rag = computeTaskRag(t, bscTasks, refDate);
                                    const slip = computeSlippageDays(t);
                                    return (
                                      <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setActiveBscTaskId(t.id)}
                                        className="w-full text-left p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#1A73E8] bg-[#F7F9FC] dark:bg-slate-950 space-y-1 transition-colors"
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-mono text-[10px] font-bold text-[#1A73E8]">
                                            {t.taskCode.split('-').slice(-2).join('-')}
                                          </span>
                                          <span
                                            className={`px-1 py-0.2 rounded text-[9px] font-bold ${getRagBadgeClasses(
                                              rag
                                            )}`}
                                          >
                                            {t.percentComplete}%
                                          </span>
                                        </div>
                                        <div className="text-[11px] font-medium text-[#172B4D] dark:text-slate-200 line-clamp-2 leading-tight">
                                          {t.title}
                                        </div>
                                        <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
                                          <span>{t.plannedEnd.slice(5)}</span>
                                          {slip > 0 && (
                                            <span className="text-[#D93025] font-bold">+{slip}d</span>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Baseline vs. Current Timeline Bars with Today/Simulated Date Line */}
              {chTasks.length > 0 && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-bold uppercase tracking-wider text-slate-500">
                      Baseline vs. Current Schedule Bars ({charter.charterCode})
                    </span>
                    <div className="flex items-center gap-4 text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-1.5 rounded bg-slate-300 dark:bg-slate-600" />
                        Baseline (Locked)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-2 rounded bg-[#1A73E8]" />
                        Current Plan (RAG colored)
                      </span>
                      <span className="flex items-center gap-1.5 text-[#D93025] font-mono font-semibold">
                        <span className="inline-block w-0.5 h-3 bg-[#D93025]" />
                        Simulated Date ({bscSimulatedDate})
                      </span>
                    </div>
                  </div>

                  <div className="relative space-y-2 pt-1">
                    {chTasks.map((t) => {
                      const rag = computeTaskRag(t, bscTasks, refDate);
                      const bStart = parseDateSafe(t.baselineStart) || chStart;
                      const bEnd = parseDateSafe(t.baselineEnd) || chEnd;
                      const pStart = parseDateSafe(t.plannedStart) || bStart;
                      const pEnd = parseDateSafe(t.plannedEnd) || bEnd;

                      const toPct = (d: Date) =>
                        Math.min(
                          100,
                          Math.max(0, (differenceInCalendarDays(d, chStart) / totalSpan) * 100)
                        );
                      const bLeft = toPct(bStart);
                      const bWidth = Math.max(2, toPct(bEnd) - bLeft);
                      const pLeft = toPct(pStart);
                      const pWidth = Math.max(2, toPct(pEnd) - pLeft);

                      return (
                        <div
                          key={t.id}
                          onClick={() => setActiveBscTaskId(t.id)}
                          className="grid grid-cols-12 items-center gap-3 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded px-1 py-1"
                        >
                          <div className="col-span-4 truncate">
                            <span className="font-mono text-[11px] font-bold text-[#1A73E8] mr-1.5">
                              {t.taskCode}
                            </span>
                            <span className="text-slate-700 dark:text-slate-200">{t.title}</span>
                          </div>
                          <div className="col-span-8 relative h-6 rounded bg-slate-100/80 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
                            {/* Baseline ghost bar (top) */}
                            <div
                              title={`Baseline: ${t.baselineStart} → ${t.baselineEnd}`}
                              className="absolute top-0.5 h-1.5 rounded bg-slate-300 dark:bg-slate-600"
                              style={{ left: `${bLeft}%`, width: `${bWidth}%` }}
                            />
                            {/* Current planned bar (bottom) */}
                            <div
                              title={`Current: ${t.plannedStart} → ${t.plannedEnd} (${t.percentComplete}%)`}
                              className="absolute bottom-0.5 h-2.5 rounded"
                              style={{
                                left: `${pLeft}%`,
                                width: `${pWidth}%`,
                                backgroundColor: getRagDotColor(rag),
                              }}
                            />
                            {/* Simulated Today marker */}
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-[#D93025] z-10 pointer-events-none"
                              style={{ left: `${todayOffsetPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
};
