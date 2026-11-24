import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from 'date-fns';
import { Employee, Meeting, Project, RaciEntry, Task } from '../types';

export function getTodayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function safeParseDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : null;
}

export function isTaskOverdue(task: Task, refDate: Date = new Date()): boolean {
  if (task.status === 'Completed' || task.progress >= 100) return false;
  const end = safeParseDate(task.plannedEnd);
  if (!end) return false;
  return startOfDay(end) < startOfDay(refDate);
}

export function getDaysOverdue(task: Task, refDate: Date = new Date()): number {
  if (!isTaskOverdue(task, refDate)) return 0;
  const end = safeParseDate(task.plannedEnd);
  if (!end) return 0;
  return Math.max(0, differenceInCalendarDays(startOfDay(refDate), startOfDay(end)));
}

/**
 * Planned completion % for a single task on refDate (linear schedule curve).
 */
export function getTaskPlannedProgress(task: Task, refDate: Date = new Date()): number {
  const start = safeParseDate(task.plannedStart);
  const end = safeParseDate(task.plannedEnd);
  if (!start || !end) return 0;
  const today = startOfDay(refDate);
  if (today <= startOfDay(start)) return 0;
  if (today >= startOfDay(end)) return 100;
  const total = Math.max(1, differenceInCalendarDays(end, start));
  const elapsed = differenceInCalendarDays(today, start);
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/**
 * Weighted actual project progress:
 * Project Progress (%) = SUM(Task Weight * Task Completion %) / SUM(Task Weight)
 */
export function getProjectWeightedProgress(projectId: string, tasks: Task[]): number {
  const projTasks = tasks.filter((t) => t.projectId === projectId);
  if (projTasks.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const t of projTasks) {
    const w = Math.max(1, Number(t.weight) || Number(t.estimatedDays) || 1);
    weightedSum += w * (Number(t.progress) || 0);
    totalWeight += w;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/**
 * Weighted planned project progress for Planned vs Actual comparison.
 */
export function getProjectPlannedProgress(
  project: Project,
  tasks: Task[],
  refDate: Date = new Date()
): number {
  const projTasks = tasks.filter((t) => t.projectId === project.id);
  if (projTasks.length === 0) {
    const start = safeParseDate(project.startDate);
    const end = safeParseDate(project.targetDate);
    if (!start || !end) return 0;
    const today = startOfDay(refDate);
    if (today <= startOfDay(start)) return 0;
    if (today >= startOfDay(end)) return 100;
    const total = Math.max(1, differenceInCalendarDays(end, start));
    return Math.round((differenceInCalendarDays(today, start) / total) * 100);
  }
  let weightedSum = 0;
  let totalWeight = 0;
  for (const t of projTasks) {
    const w = Math.max(1, Number(t.weight) || Number(t.estimatedDays) || 1);
    weightedSum += w * getTaskPlannedProgress(t, refDate);
    totalWeight += w;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

export function getProjectMilestoneProgress(project: Project): {
  completed: number;
  total: number;
  percent: number;
} {
  const ms = project.milestones || [];
  if (ms.length === 0) return { completed: 0, total: 0, percent: 0 };
  const completed = ms.filter((m) => m.completed).length;
  return { completed, total: ms.length, percent: Math.round((completed / ms.length) * 100) };
}

export function getScheduleVariance(actualPct: number, plannedPct: number): number {
  return Math.round(actualPct - plannedPct);
}

export interface RaciValidationIssue {
  entryId: string;
  activity: string;
  projectCode: string;
  type: 'missing_accountable' | 'multiple_accountable' | 'missing_responsible';
  message: string;
}

export function validateRaciEntries(entries: RaciEntry[]): RaciValidationIssue[] {
  const issues: RaciValidationIssue[] = [];
  for (const entry of entries) {
    const vals = Object.values(entry.roles || {});
    const aCount = vals.filter((v) => v === 'A').length;
    const rCount = vals.filter((v) => v === 'R').length;
    if (aCount === 0) {
      issues.push({
        entryId: entry.id,
        activity: entry.activity,
        projectCode: entry.projectCode,
        type: 'missing_accountable',
        message: 'No Accountable (A) role assigned.',
      });
    } else if (aCount > 1) {
      issues.push({
        entryId: entry.id,
        activity: entry.activity,
        projectCode: entry.projectCode,
        type: 'multiple_accountable',
        message: `Conflict: ${aCount} roles marked Accountable (A). Only one should be Accountable.`,
      });
    }
    if (rCount === 0) {
      issues.push({
        entryId: entry.id,
        activity: entry.activity,
        projectCode: entry.projectCode,
        type: 'missing_responsible',
        message: 'No Responsible (R) owner assigned to execute this activity.',
      });
    }
  }
  return issues;
}

export interface EmployeeWorkload {
  employee: Employee;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  avgProgress: number;
  projectsCount: number;
  upcomingDeadlines: Task[];
}

export function computeEmployeeWorkloads(
  employees: Employee[],
  tasks: Task[],
  refDate: Date = new Date()
): EmployeeWorkload[] {
  return employees.map((emp) => {
    const nameLower = emp.name.toLowerCase();
    const deptLower = emp.department.toLowerCase();
    const assigned = tasks.filter(
      (t) =>
        t.responsible.toLowerCase() === nameLower ||
        t.accountable.toLowerCase() === nameLower ||
        t.responsible.toLowerCase() === emp.designation.toLowerCase() ||
        (t.responsible.toLowerCase() === deptLower && emp.systemRole === 'Department Head')
    );
    const completed = assigned.filter((t) => t.status === 'Completed' || t.progress >= 100).length;
    const overdue = assigned.filter((t) => isTaskOverdue(t, refDate)).length;
    const pending = assigned.length - completed;
    const avgProgress =
      assigned.length > 0
        ? Math.round(assigned.reduce((acc, t) => acc + t.progress, 0) / assigned.length)
        : 0;
    const projectIds = new Set(assigned.map((t) => t.projectId));
    const upcomingDeadlines = assigned
      .filter((t) => t.status !== 'Completed' && !isTaskOverdue(t, refDate))
      .sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd))
      .slice(0, 3);

    return {
      employee: emp,
      totalTasks: assigned.length,
      completedTasks: completed,
      pendingTasks: pending,
      overdueTasks: overdue,
      avgProgress,
      projectsCount: projectIds.size,
      upcomingDeadlines,
    };
  });
}

export function getUpcomingMeetingsCount(meetings: Meeting[], refDate: Date = new Date()): number {
  const today = format(refDate, 'yyyy-MM-dd');
  return meetings.filter((m) => m.date >= today).length;
}

export function getStatusColorHex(status: string): string {
  switch (status) {
    case 'Completed':
      return '#188038';
    case 'In Progress':
    case 'Planning':
      return '#1A73E8';
    case 'At Risk':
    case 'Pending Approval':
    case 'Under Review':
      return '#F9AB00';
    case 'Delayed':
    case 'Overdue':
    case 'Cancelled':
      return '#D93025';
    default:
      return '#80868B';
  }
}

export function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'Completed':
      return 'text-[#188038] dark:text-emerald-400 bg-[#188038]/10 dark:bg-emerald-500/15';
    case 'In Progress':
    case 'Planning':
      return 'text-[#1A73E8] dark:text-blue-400 bg-[#1A73E8]/10 dark:bg-blue-500/15';
    case 'At Risk':
    case 'Pending Approval':
    case 'Under Review':
      return 'text-[#B06000] dark:text-amber-400 bg-[#F9AB00]/15 dark:bg-amber-500/15';
    case 'Delayed':
    case 'Overdue':
    case 'Cancelled':
      return 'text-[#D93025] dark:text-red-400 bg-[#D93025]/10 dark:bg-red-500/15';
    default:
      return 'text-[#5F6368] dark:text-slate-400 bg-slate-100 dark:bg-slate-800';
  }
}

export function getPriorityTextClass(priority: string): string {
  switch (priority) {
    case 'Critical':
      return 'text-[#D93025] dark:text-red-400 font-semibold';
    case 'High':
      return 'text-[#B06000] dark:text-amber-400 font-semibold';
    case 'Medium':
      return 'text-[#1A73E8] dark:text-blue-400 font-medium';
    default:
      return 'text-slate-500 dark:text-slate-400';
  }
}
