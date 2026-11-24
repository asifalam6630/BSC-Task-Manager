import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  buildReportData,
  exportReportToExcel,
  exportReportToPdf,
  ReportId,
} from '../lib/exportUtils';
import {
  getProjectMilestoneProgress,
  getProjectPlannedProgress,
  getProjectWeightedProgress,
  getScheduleVariance,
  isTaskOverdue,
} from '../lib/metrics';

const REPORT_CATALOG: { id: ReportId; title: string; desc: string }[] = [
  {
    id: 'executive_summary',
    title: '1. Executive Project Summary',
    desc: 'Portfolio-wide weighted completion, planned vs actual variance, and milestones.',
  },
  {
    id: 'individual_project',
    title: '2. Individual Project Progress Report',
    desc: 'Detailed task schedule, weights, RACI owners, and progress for one selected project.',
  },
  {
    id: 'task_completion',
    title: '3. Task Completion Report',
    desc: 'Complete task register across all strategic initiatives.',
  },
  {
    id: 'overdue_tasks',
    title: '4. Overdue Task Report',
    desc: 'Escalation list of past-due tasks with days overdue and responsible owners.',
  },
  {
    id: 'meeting_actions',
    title: '5. Meeting Action Tracker',
    desc: 'All BOD, steering, and project meeting action points with conversion status.',
  },
  {
    id: 'raci_matrix',
    title: '6. RACI Responsibility Matrix',
    desc: 'Spreadsheet-ready R/A/C/I matrix for governance audits.',
  },
  {
    id: 'employee_workload',
    title: '7. Employee Workload Report',
    desc: 'Individual task counts, completed vs pending, overdue alerts, and average progress.',
  },
  {
    id: 'planned_vs_actual',
    title: '8. Planned vs Actual Performance',
    desc: 'Weighted schedule variance and health classification per project.',
  },
  {
    id: 'monthly_review',
    title: '9. Monthly Project Review Report',
    desc: 'Department-level execution scorecard and on-time completion rate.',
  },
];

export const ReportsAnalyticsModule: React.FC = () => {
  const { projects, tasks, meetings, raciEntries, employees, notify } = useApp();
  const [selectedReport, setSelectedReport] = useState<ReportId>('executive_summary');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');

  // Three distinct progress metrics (Task vs Milestone vs Overall Weighted Project)
  const analyticsSummary = useMemo(() => {
    const taskAvg =
      tasks.length > 0
        ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
        : 0;

    let totalMs = 0;
    let doneMs = 0;
    let projWeightedSum = 0;
    let projPlannedSum = 0;
    projects.forEach((p) => {
      const ms = getProjectMilestoneProgress(p);
      totalMs += ms.total;
      doneMs += ms.completed;
      projWeightedSum += getProjectWeightedProgress(p.id, tasks);
      projPlannedSum += getProjectPlannedProgress(p, tasks);
    });

    const milestoneRate = totalMs > 0 ? Math.round((doneMs / totalMs) * 100) : 0;
    const weightedProjectAvg =
      projects.length > 0 ? Math.round(projWeightedSum / projects.length) : 0;
    const plannedAvg =
      projects.length > 0 ? Math.round(projPlannedSum / projects.length) : 0;
    const scheduleVariance = getScheduleVariance(weightedProjectAvg, plannedAvg);

    const completedTasks = tasks.filter((t) => t.status === 'Completed' || t.progress >= 100);
    const onTimeCompleted = completedTasks.filter(
      (t) => !t.actualEnd || t.actualEnd <= t.plannedEnd
    );
    const onTimeRate =
      completedTasks.length > 0
        ? Math.round((onTimeCompleted.length / completedTasks.length) * 100)
        : 100;
    const overdueCount = tasks.filter((t) => isTaskOverdue(t)).length;

    return {
      taskAvg,
      milestoneRate,
      doneMs,
      totalMs,
      weightedProjectAvg,
      plannedAvg,
      scheduleVariance,
      onTimeRate,
      overdueCount,
    };
  }, [projects, tasks]);

  const activeReportData = useMemo(
    () =>
      buildReportData(selectedReport, {
        projects,
        tasks,
        meetings,
        raciEntries,
        employees,
        selectedProjectId: selectedProjectId || projects[0]?.id,
      }),
    [selectedReport, projects, tasks, meetings, raciEntries, employees, selectedProjectId]
  );

  const handleDownloadExcel = () => {
    exportReportToExcel(activeReportData);
    notify('success', 'Excel report downloaded', `${activeReportData.filename}.xlsx`);
  };

  const handleDownloadPdf = () => {
    exportReportToPdf(activeReportData);
    notify('success', 'PDF report downloaded', `${activeReportData.filename}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
          Reports &amp; Progress Analytics
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Weighted project completion, schedule variance, and executive Excel/PDF reporting suite.
        </p>
      </div>

      {/* Clear Distinction: Task Completion vs Milestone Completion vs Weighted Project Completion */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500">Task Completion Rate</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-[#172B4D] dark:text-white tabular-nums">
            {analyticsSummary.taskAvg}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Unweighted mean across {tasks.length} tasks</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500">Milestone Completion</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-[#188038] dark:text-emerald-400 tabular-nums">
            {analyticsSummary.milestoneRate}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {analyticsSummary.doneMs} of {analyticsSummary.totalMs} gates verified
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500">Weighted Project Progress</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-[#1A73E8] dark:text-blue-400 tabular-nums">
            {analyticsSummary.weightedProjectAvg}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Planned baseline: {analyticsSummary.plannedAvg}%
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500">Schedule Variance</p>
          <p
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
              analyticsSummary.scheduleVariance >= 0
                ? 'text-[#188038]'
                : analyticsSummary.scheduleVariance >= -10
                ? 'text-[#B06000]'
                : 'text-[#D93025]'
            }`}
          >
            {analyticsSummary.scheduleVariance >= 0
              ? `+${analyticsSummary.scheduleVariance}%`
              : `${analyticsSummary.scheduleVariance}%`}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Actual minus Planned</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500">On-Time Completion</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-[#172B4D] dark:text-white tabular-nums">
            {analyticsSummary.onTimeRate}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {analyticsSummary.overdueCount} active overdue task(s)
          </p>
        </div>
      </div>

      {/* Report Selector & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Downloadable Executive Reports (9)</span>
          </div>
          {REPORT_CATALOG.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => setSelectedReport(rep.id)}
              className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                selectedReport === rep.id
                  ? 'bg-[#1A73E8]/5 border-[#1A73E8] dark:bg-blue-950/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <p className="text-xs font-bold text-[#172B4D] dark:text-white">{rep.title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                {rep.desc}
              </p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#172B4D] dark:text-white">
                {activeReportData.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeReportData.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(selectedReport === 'individual_project' || selectedReport === 'raci_matrix') && (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
                >
                  {selectedReport === 'raci_matrix' && <option value="">All Projects</option>}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} — {p.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={handleDownloadExcel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#188038]" />
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                PDF (.pdf)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 text-slate-500">
                  {activeReportData.headers.map((h, i) => (
                    <th key={i} className="py-3 px-3.5 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeReportData.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeReportData.headers.length}
                      className="py-12 text-center text-slate-500"
                    >
                      <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      No records for this report scope.
                    </td>
                  </tr>
                ) : (
                  activeReportData.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
