import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useApp } from '../context/AppContext';
import { DEPARTMENTS, Project, ProjectStatus } from '../types';
import {
  getDaysOverdue,
  getProjectMilestoneProgress,
  getProjectPlannedProgress,
  getProjectWeightedProgress,
  getScheduleVariance,
  getStatusBadgeClasses,
  getStatusColorHex,
  getUpcomingMeetingsCount,
  isTaskOverdue,
} from '../lib/metrics';

interface ExecutiveDashboardProps {
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  onCreateTask: () => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  onOpenProject,
  onCreateProject,
  onCreateTask,
}) => {
  const { projects, tasks, meetings, globalSearch, setActiveNav } = useApp();

  const [filterProject, setFilterProject] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const owners = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => p.projectOwner && set.add(p.projectOwner));
    tasks.forEach((t) => t.responsible && set.add(t.responsible));
    return Array.from(set).sort();
  }, [projects, tasks]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (filterProject !== 'all' && p.id !== filterProject) return false;
      if (filterDept !== 'all' && p.department !== filterDept) return false;
      if (filterOwner !== 'all' && p.projectOwner !== filterOwner) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (dateFrom && p.targetDate < dateFrom) return false;
      if (dateTo && p.startDate > dateTo) return false;
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.projectCode.toLowerCase().includes(q) &&
          !p.department.toLowerCase().includes(q) &&
          !p.projectOwner.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [projects, filterProject, filterDept, filterOwner, filterStatus, dateFrom, dateTo, globalSearch]);

  const filteredProjectIds = useMemo(
    () => new Set(filteredProjects.map((p) => p.id)),
    [filteredProjects]
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!filteredProjectIds.has(t.projectId)) return false;
      if (filterOwner !== 'all' && t.responsible !== filterOwner) return false;
      if (dateFrom && t.plannedEnd < dateFrom) return false;
      if (dateTo && t.plannedStart > dateTo) return false;
      return true;
    });
  }, [tasks, filteredProjectIds, filterOwner, dateFrom, dateTo]);

  const filteredMeetings = useMemo(
    () => meetings.filter((m) => filteredProjectIds.has(m.projectId)),
    [meetings, filteredProjectIds]
  );

  // KPI computations
  const kpis = useMemo(() => {
    const totalProjects = filteredProjects.length;
    const activeProjects = filteredProjects.filter((p) =>
      ['In Progress', 'Planning', 'At Risk', 'Delayed'].includes(p.status)
    ).length;
    const completedProjects = filteredProjects.filter((p) => p.status === 'Completed').length;
    const onHoldProjects = filteredProjects.filter((p) => p.status === 'On Hold').length;

    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter(
      (t) => t.status === 'Completed' || t.progress >= 100
    ).length;
    const overdueTasks = filteredTasks.filter((t) => isTaskOverdue(t)).length;
    const pendingTasks = totalTasks - completedTasks;
    const upcomingMeetings = getUpcomingMeetingsCount(filteredMeetings);

    // Weighted overall completion across filtered tasks
    let wSum = 0;
    let wTotal = 0;
    filteredTasks.forEach((t) => {
      const w = Math.max(1, t.weight || 1);
      wSum += w * t.progress;
      wTotal += w;
    });
    const overallCompletion = wTotal > 0 ? Math.round(wSum / wTotal) : 0;

    return {
      totalProjects,
      activeProjects,
      completedProjects,
      onHoldProjects,
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      upcomingMeetings,
      overallCompletion,
    };
  }, [filteredProjects, filteredTasks, filteredMeetings]);

  // Chart 1: Overall Progress Donut
  const donutData = useMemo(
    () => [
      { name: 'Completed', value: kpis.overallCompletion, color: '#188038' },
      { name: 'Remaining', value: Math.max(0, 100 - kpis.overallCompletion), color: '#E2E8F0' },
    ],
    [kpis.overallCompletion]
  );

  // Chart 2: Project Status Distribution
  const statusDistribution = useMemo(() => {
    const counts = new Map<ProjectStatus, number>();
    filteredProjects.forEach((p) => {
      counts.set(p.status, (counts.get(p.status) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([status, count]) => ({
      status,
      count,
      fill: getStatusColorHex(status),
    }));
  }, [filteredProjects]);

  // Chart 3: Planned vs Actual Progress by Project
  const plannedVsActualData = useMemo(() => {
    return filteredProjects.map((p) => {
      const actual = getProjectWeightedProgress(p.id, tasks);
      const planned = getProjectPlannedProgress(p, tasks);
      return {
        code: p.projectCode,
        name: p.name,
        Planned: planned,
        Actual: actual,
        variance: getScheduleVariance(actual, planned),
      };
    });
  }, [filteredProjects, tasks]);

  // Chart 4: Monthly Task Completion Trend
  const monthlyTrendData = useMemo(() => {
    const map = new Map<string, { month: string; Planned: number; Completed: number; Overdue: number }>();
    filteredTasks.forEach((t) => {
      const key = t.plannedEnd.slice(0, 7); // YYYY-MM
      let label = key;
      try {
        label = format(parseISO(`${key}-01`), 'MMM yy');
      } catch {
        // fallback
      }
      const entry = map.get(key) || { month: label, Planned: 0, Completed: 0, Overdue: 0 };
      entry.Planned += 1;
      if (t.status === 'Completed' || t.progress >= 100) entry.Completed += 1;
      if (isTaskOverdue(t)) entry.Overdue += 1;
      map.set(key, entry);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val]) => val);
  }, [filteredTasks]);

  // Chart 5: Department-wise Performance
  const deptPerformanceData = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    filteredProjects.forEach((p) => {
      const curr = map.get(p.department) || { sum: 0, count: 0 };
      curr.sum += getProjectWeightedProgress(p.id, tasks);
      curr.count += 1;
      map.set(p.department, curr);
    });
    return Array.from(map.entries())
      .map(([department, v]) => ({
        department: department.length > 18 ? `${department.slice(0, 17)}…` : department,
        fullDepartment: department,
        progress: Math.round(v.sum / v.count),
      }))
      .sort((a, b) => b.progress - a.progress);
  }, [filteredProjects, tasks]);

  // Chart 6: Overdue Task Analysis
  const overdueAnalysisData = useMemo(() => {
    const map = new Map<string, { code: string; overdueCount: number; maxDays: number }>();
    filteredTasks
      .filter((t) => isTaskOverdue(t))
      .forEach((t) => {
        const curr = map.get(t.projectCode) || { code: t.projectCode, overdueCount: 0, maxDays: 0 };
        curr.overdueCount += 1;
        curr.maxDays = Math.max(curr.maxDays, getDaysOverdue(t));
        map.set(t.projectCode, curr);
      });
    return Array.from(map.values());
  }, [filteredTasks]);

  // Upcoming Milestones
  const upcomingMilestones = useMemo(() => {
    const items: { project: Project; title: string; dueDate: string; completed: boolean }[] = [];
    filteredProjects.forEach((p) => {
      (p.milestones || []).forEach((m) => {
        if (!m.completed) {
          items.push({ project: p, title: m.title, dueDate: m.dueDate, completed: m.completed });
        }
      });
    });
    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
  }, [filteredProjects]);

  const hasDemoData = projects.some((p) => p.isDemo);
  const hasFilters =
    filterProject !== 'all' ||
    filterDept !== 'all' ||
    filterOwner !== 'all' ||
    filterStatus !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const resetFilters = () => {
    setFilterProject('all');
    setFilterDept('all');
    setFilterOwner('all');
    setFilterStatus('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            Executive Dashboard
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Strategic portfolio execution, weighted progress variance, and operational risk monitoring.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCreateTask}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#172B4D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            + Add Task
          </button>
          <button
            type="button"
            onClick={onCreateProject}
            className="px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Subtle Demo Identification Banner */}
      {hasDemoData && (
        <div className="px-4 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span>
            <strong className="text-[#172B4D] dark:text-slate-200">Demonstration Portfolio Active:</strong>{' '}
            Showing sample BSC &amp; Corporate Governance projects (P01–P20) alongside your custom records.
          </span>
          <button
            type="button"
            onClick={() => setActiveNav('settings')}
            className="text-[#1A73E8] dark:text-blue-400 font-semibold hover:underline whitespace-nowrap"
          >
            Manage Demo Data
          </button>
        </div>
      )}

      {/* Multi-Dimensional Filter Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">
            <Filter className="w-3.5 h-3.5" />
            Filters
          </div>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 text-[#172B4D] dark:text-slate-200"
          >
            <option value="all">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode} — {p.name}
              </option>
            ))}
          </select>

          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 text-[#172B4D] dark:text-slate-200"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 text-[#172B4D] dark:text-slate-200"
          >
            <option value="all">All Responsible Persons</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 text-[#172B4D] dark:text-slate-200"
          >
            <option value="all">All Statuses</option>
            {['Not Started', 'Planning', 'In Progress', 'At Risk', 'Delayed', 'On Hold', 'Completed', 'Cancelled'].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              )
            )}
          </select>

          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              aria-label="Filter from date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2.5 py-1.5 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              aria-label="Filter to date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1.5 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
            />
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#1A73E8] hover:underline"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* 10 Executive KPI Cards — Clean 5x2 Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          { label: 'Total Projects', value: kpis.totalProjects, accent: 'text-[#172B4D] dark:text-white' },
          { label: 'Active Projects', value: kpis.activeProjects, accent: 'text-[#1A73E8] dark:text-blue-400' },
          { label: 'Completed Projects', value: kpis.completedProjects, accent: 'text-[#188038] dark:text-emerald-400' },
          { label: 'On-Hold Projects', value: kpis.onHoldProjects, accent: 'text-slate-500 dark:text-slate-400' },
          { label: 'Overall Completion', value: `${kpis.overallCompletion}%`, accent: 'text-[#1A73E8] dark:text-blue-400' },
          { label: 'Total Tasks', value: kpis.totalTasks, accent: 'text-[#172B4D] dark:text-white' },
          { label: 'Completed Tasks', value: kpis.completedTasks, accent: 'text-[#188038] dark:text-emerald-400' },
          { label: 'Pending Tasks', value: kpis.pendingTasks, accent: 'text-[#B06000] dark:text-amber-400' },
          { label: 'Overdue Tasks', value: kpis.overdueTasks, accent: kpis.overdueTasks > 0 ? 'text-[#D93025] dark:text-red-400' : 'text-[#188038]' },
          { label: 'Upcoming Meetings', value: kpis.upcomingMeetings, accent: 'text-[#9334E6] dark:text-purple-400' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              {kpi.label}
            </p>
            <p className={`mt-2 font-mono text-2xl font-bold tabular-nums ${kpi.accent}`}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Primary Charts Row: Donut + Planned vs Actual Line Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
                Overall Weighted Progress
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Weighted by task complexity &amp; duration
              </p>
            </div>
          </div>
          <div className="flex-1 min-h-[230px] relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  innerRadius={68}
                  outerRadius={92}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {donutData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: unknown) => `${val}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-mono text-3xl font-bold text-[#172B4D] dark:text-white tabular-nums">
                {kpis.overallCompletion}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Portfolio Complete</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
                Planned vs Actual Project Progress (%)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Identify schedule variance across strategic initiatives
              </p>
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={plannedVsActualData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.45} />
                <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="Planned"
                  stroke="#80868B"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Actual"
                  stroke="#1A73E8"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Secondary Charts Row: Status Distribution + Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white mb-1">
            Project Status Distribution
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Active governance health breakdown
          </p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusDistribution} margin={{ top: 5, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.45} />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Projects" radius={[5, 5, 0, 0]}>
                  {statusDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white mb-1">
            Monthly Task Completion Trend
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Scheduled deliverables vs completed &amp; overdue by due month
          </p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrendData} margin={{ top: 5, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.45} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Planned" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Completed" fill="#188038" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Overdue" fill="#D93025" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tertiary Row: Department Performance + Overdue Analysis + Upcoming Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white mb-1">
            Department-wise Project Performance
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Average weighted completion by owning department
          </p>
          <div className="h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={deptPerformanceData}
                layout="vertical"
                margin={{ top: 0, right: 18, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.45} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="department" width={115} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: unknown) => `${val}%`} />
                <Bar dataKey="progress" name="Avg Progress" fill="#1A73E8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-3 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white mb-1">
            Overdue Task Analysis
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Projects with missed task deadlines
          </p>
          {overdueAnalysisData.length === 0 ? (
            <div className="h-[210px] flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-8 h-8 text-[#188038] mb-2" />
              <p className="text-sm font-semibold text-[#172B4D] dark:text-slate-200">Zero Overdue Tasks</p>
              <p className="text-xs text-slate-500 mt-1">All filtered tasks are on schedule.</p>
            </div>
          ) : (
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overdueAnalysisData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.45} />
                  <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="overdueCount" name="Overdue Tasks" fill="#D93025" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
                Upcoming Milestones
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Next critical governance gates
              </p>
            </div>
            <CalendarClock className="w-4 h-4 text-slate-400" />
          </div>
          {upcomingMilestones.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">All milestones completed.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingMilestones.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onOpenProject(item.project)}
                  className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 px-1.5 rounded transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#172B4D] dark:text-slate-200 truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.project.projectCode} · {item.project.name}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-slate-600 dark:text-slate-300 shrink-0">
                    {item.dueDate}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Project-wise Performance & Delayed Identification Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
              Strategic Portfolio Performance Matrix
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any project row to open its dedicated project workspace.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {filteredProjects.length} projects
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Project</th>
                <th className="py-3 px-3 font-semibold">Department</th>
                <th className="py-3 px-3 font-semibold">Owner</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold text-right">Planned</th>
                <th className="py-3 px-3 font-semibold text-right">Actual</th>
                <th className="py-3 px-3 font-semibold text-right">Variance</th>
                <th className="py-3 px-3 font-semibold text-right">Milestones</th>
                <th className="py-3 px-4 font-semibold text-right">Target Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredProjects.map((p) => {
                const actual = getProjectWeightedProgress(p.id, tasks);
                const planned = getProjectPlannedProgress(p, tasks);
                const variance = getScheduleVariance(actual, planned);
                const ms = getProjectMilestoneProgress(p);
                const isDelayed = p.status === 'Delayed' || variance < -15;

                return (
                  <tr
                    key={p.id}
                    onClick={() => onOpenProject(p)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-[#172B4D] dark:text-slate-200">
                              {p.projectCode}
                            </span>
                            <span className="font-medium text-[#172B4D] dark:text-slate-100 truncate max-w-[220px]">
                              {p.name}
                            </span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </div>
                          {isDelayed && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#D93025] dark:text-red-400 mt-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              Delayed / Schedule risk
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {p.department}
                    </td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {p.projectOwner}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-medium text-[11px] ${getStatusBadgeClasses(
                          p.status
                        )}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {planned}%
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${actual}%`, backgroundColor: p.color }}
                          />
                        </div>
                        <span className="font-mono font-semibold tabular-nums text-[#172B4D] dark:text-slate-100 w-9 text-right">
                          {actual}%
                        </span>
                      </div>
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-semibold tabular-nums ${
                        variance >= 0
                          ? 'text-[#188038] dark:text-emerald-400'
                          : variance >= -12
                          ? 'text-[#B06000] dark:text-amber-400'
                          : 'text-[#D93025] dark:text-red-400'
                      }`}
                    >
                      {variance >= 0 ? `+${variance}%` : `${variance}%`}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {ms.completed}/{ms.total}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {p.targetDate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
