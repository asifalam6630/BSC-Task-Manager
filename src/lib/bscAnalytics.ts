import { differenceInCalendarDays, format, startOfDay, subMonths } from 'date-fns';
import { Employee, Project, Task } from '../types';
import {
  BSC_PERSPECTIVES,
  BscGovernanceConfig,
  BscKra,
  BscPerspective,
  BscTask,
  DAY_RANGE_BUCKETS,
  DayRangeBucket,
  DEFAULT_BSC_CONFIG,
  ProjectCharter,
  TaskFollowUp,
} from '../types/bsc';
import {
  computeCharterBscProgress,
  computeEscalation,
  computeExpectedPercent,
  computeSlippageDays,
  computeTaskRag,
  getBscDaysOverdue,
  getBscDaysUntilDue,
  isBscTaskOpen,
  isFollowUpMissed,
  parseDateSafe,
} from './bscMetrics';

// Confirmed fixed overload threshold: 8+ active tasks flags employee as Overloaded (§12.5)
export const OVERLOAD_THRESHOLD = 8;

export interface UnifiedWorkloadTask {
  id: string;
  source: 'bsc' | 'project';
  code: string;
  title: string;
  projectCode: string;
  charterId?: string;
  perspective?: BscPerspective;
  department: string;
  ownerName: string;
  accountableName: string;
  status: string;
  priority: string;
  plannedStart: string;
  plannedEnd: string;
  percentComplete: number;
  isActive: boolean;
  isCompleted: boolean;
  isOverdue: boolean;
  isUpcoming: boolean;
  isPendingApproval: boolean;
  isCritical: boolean;
  followUpMissed: boolean;
}

export interface EmployeeAccountabilityRow {
  employeeKey: string;
  employeeId?: string;
  employeeCode?: string;
  name: string;
  designation: string;
  department: string;
  totalAssigned: number;
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  upcomingDeadlines: number;
  pendingApprovals: number;
  followUpCompliancePct: number;
  criticalAssignments: number;
  isOverloaded: boolean;
  tasks: UnifiedWorkloadTask[];
}

export interface DepartmentAccountabilityRow {
  department: string;
  headcount: number;
  overloadedEmployees: number;
  totalAssigned: number;
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  upcomingDeadlines: number;
  pendingApprovals: number;
  followUpCompliancePct: number;
  criticalAssignments: number;
  avgCompletionPct: number;
}

export interface UnassignedActivityItem {
  id: string;
  source: 'charterActivity' | 'bscTask' | 'projectTask';
  code: string;
  title: string;
  projectCode: string;
  charterId?: string;
  milestoneTitle?: string;
  department: string;
  plannedEnd: string;
  reason: string;
}

function norm(s?: string): string {
  return (s || '').trim().toLowerCase();
}

function isNameUnassigned(name?: string): boolean {
  const n = norm(name);
  return !n || n === 'unassigned' || n === 'tbd' || n === 'n/a' || n === '-';
}

/**
 * Unifies BSC Tasks + Project Tasks into a single normalized stream for Workload & Analytics.
 */
export function buildUnifiedWorkloadTasks(
  bscTasks: BscTask[],
  tasks: Task[],
  charters: ProjectCharter[],
  projects: Project[],
  employees: Employee[],
  refDate: Date
): UnifiedWorkloadTask[] {
  const charterMap = new Map(charters.map((c) => [c.id, c]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const empByName = new Map(employees.map((e) => [norm(e.name), e]));
  const today = startOfDay(refDate);

  const out: UnifiedWorkloadTask[] = [];

  bscTasks.forEach((t) => {
    if (t.status === 'Cancelled') return;
    const ch = charterMap.get(t.charterId);
    const emp = empByName.get(norm(t.responsibleName));
    const isCompleted = t.status === 'Completed';
    const isActive = isBscTaskOpen(t);
    const overdueDays = getBscDaysOverdue(t, refDate);
    const untilDue = getBscDaysUntilDue(t, refDate);
    const isPendingApproval = t.status === 'Submitted for Review';

    out.push({
      id: t.id,
      source: 'bsc',
      code: t.taskCode,
      title: t.title,
      projectCode: ch?.projectCode || t.charterCode,
      charterId: t.charterId,
      perspective: ch?.perspective,
      department: t.department || emp?.department || 'Strategic Execution',
      ownerName: t.responsibleName,
      accountableName: t.accountableName,
      status: t.status,
      priority: t.priority,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      percentComplete: t.percentComplete,
      isActive,
      isCompleted,
      isOverdue: overdueDays > 0,
      isUpcoming: isActive && untilDue >= 0 && untilDue <= 7,
      isPendingApproval,
      isCritical: t.priority === 'Critical' && isActive,
      followUpMissed: isFollowUpMissed(t, refDate),
    });
  });

  tasks.forEach((t) => {
    const proj = projectMap.get(t.projectId);
    const emp = empByName.get(norm(t.responsible));
    const isCompleted = t.status === 'Completed';
    const isActive = !isCompleted;
    const end = parseDateSafe(t.plannedEnd);
    const overdue = isActive && end ? differenceInCalendarDays(today, end) > 0 : false;
    const untilDue = end ? differenceInCalendarDays(end, today) : 999;

    out.push({
      id: t.id,
      source: 'project',
      code: t.taskCode,
      title: t.name,
      projectCode: proj?.projectCode || t.projectCode,
      perspective: undefined,
      department: t.department || emp?.department || proj?.department || 'Operations',
      ownerName: t.responsible,
      accountableName: t.accountable || '',
      status: t.status,
      priority: t.priority,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      percentComplete: t.progress,
      isActive,
      isCompleted,
      isOverdue: overdue,
      isUpcoming: isActive && untilDue >= 0 && untilDue <= 7,
      isPendingApproval: t.status === 'Under Review',
      isCritical: t.priority === 'Critical' && isActive,
      followUpMissed: false,
    });
  });

  return out;
}

export interface WorkloadFilters {
  employee?: string;
  department?: string;
  projectCode?: string;
  perspective?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function filterUnifiedWorkloadTasks(
  unified: UnifiedWorkloadTask[],
  filters: WorkloadFilters
): UnifiedWorkloadTask[] {
  return unified.filter((item) => {
    if (filters.employee && norm(item.ownerName) !== norm(filters.employee)) return false;
    if (filters.department && item.department !== filters.department) return false;
    if (filters.projectCode && item.projectCode !== filters.projectCode) return false;
    if (filters.perspective && item.perspective !== filters.perspective) return false;
    if (filters.status) {
      if (filters.status === 'Active' && !item.isActive) return false;
      else if (filters.status === 'Overdue' && !item.isOverdue) return false;
      else if (filters.status === 'Completed' && !item.isCompleted) return false;
      else if (filters.status === 'Pending Approval' && !item.isPendingApproval) return false;
      else if (
        !['Active', 'Overdue', 'Completed', 'Pending Approval'].includes(filters.status) &&
        item.status !== filters.status
      ) {
        return false;
      }
    }
    if (filters.dateFrom && item.plannedEnd < filters.dateFrom) return false;
    if (filters.dateTo && item.plannedStart > filters.dateTo) return false;
    return true;
  });
}

export function computeEmployeeAccountability(
  filteredTasks: UnifiedWorkloadTask[],
  employees: Employee[],
  bscFollowUps: TaskFollowUp[]
): EmployeeAccountabilityRow[] {
  const map = new Map<string, EmployeeAccountabilityRow>();

  // Seed directory employees first so 0-task employees are visible if no employee filter excludes them
  employees.forEach((emp) => {
    const key = norm(emp.name);
    if (!key) return;
    map.set(key, {
      employeeKey: key,
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.name,
      designation: emp.designation,
      department: emp.department,
      totalAssigned: 0,
      activeTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      upcomingDeadlines: 0,
      pendingApprovals: 0,
      followUpCompliancePct: 100,
      criticalAssignments: 0,
      isOverloaded: false,
      tasks: [],
    });
  });

  // Ensure task owners not yet in employees directory are also captured
  filteredTasks.forEach((t) => {
    if (isNameUnassigned(t.ownerName)) return;
    const key = norm(t.ownerName);
    if (!map.has(key)) {
      map.set(key, {
        employeeKey: key,
        name: t.ownerName,
        designation: 'Project Contributor',
        department: t.department || 'Unassigned Dept',
        totalAssigned: 0,
        activeTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        upcomingDeadlines: 0,
        pendingApprovals: 0,
        followUpCompliancePct: 100,
        criticalAssignments: 0,
        isOverloaded: false,
        tasks: [],
      });
    }
    const row = map.get(key)!;
    row.tasks.push(t);
    row.totalAssigned += 1;
    if (t.isActive) row.activeTasks += 1;
    if (t.isCompleted) row.completedTasks += 1;
    if (t.isOverdue) row.overdueTasks += 1;
    if (t.isUpcoming) row.upcomingDeadlines += 1;
    if (t.isPendingApproval) row.pendingApprovals += 1;
    if (t.isCritical) row.criticalAssignments += 1;
  });

  // Compute Pending Approvals where person is Accountable (A) as well
  filteredTasks.forEach((t) => {
    if (!t.isPendingApproval || isNameUnassigned(t.accountableName)) return;
    const accKey = norm(t.accountableName);
    const ownerKey = norm(t.ownerName);
    if (accKey !== ownerKey && map.has(accKey)) {
      map.get(accKey)!.pendingApprovals += 1;
    }
  });

  // Compute follow-up compliance per employee + fixed overload threshold (8+ active tasks)
  const rows: EmployeeAccountabilityRow[] = [];
  map.forEach((row) => {
    const bscTaskIds = new Set(row.tasks.filter((t) => t.source === 'bsc').map((t) => t.id));
    const empFollowUps = bscFollowUps.filter((f) => bscTaskIds.has(f.taskId));
    const missedCount = row.tasks.filter((t) => t.followUpMissed).length;
    const onTimeCount = empFollowUps.filter((f) => f.onTime).length;
    const denom = empFollowUps.length + missedCount;
    row.followUpCompliancePct = denom > 0 ? Math.round((onTimeCount / denom) * 100) : 100;
    row.isOverloaded = row.activeTasks >= OVERLOAD_THRESHOLD;
    rows.push(row);
  });

  return rows.sort((a, b) => {
    if (a.isOverloaded !== b.isOverloaded) return a.isOverloaded ? -1 : 1;
    if (b.activeTasks !== a.activeTasks) return b.activeTasks - a.activeTasks;
    return b.overdueTasks - a.overdueTasks;
  });
}

export function computeDepartmentAccountability(
  employeeRows: EmployeeAccountabilityRow[]
): DepartmentAccountabilityRow[] {
  const deptMap = new Map<string, EmployeeAccountabilityRow[]>();
  employeeRows.forEach((e) => {
    const d = e.department || 'Unassigned Dept';
    if (!deptMap.has(d)) deptMap.set(d, []);
    deptMap.get(d)!.push(e);
  });

  const out: DepartmentAccountabilityRow[] = [];
  deptMap.forEach((members, department) => {
    const allTasks = members.flatMap((m) => m.tasks);
    const totalAssigned = allTasks.length;
    const activeTasks = allTasks.filter((t) => t.isActive).length;
    const completedTasks = allTasks.filter((t) => t.isCompleted).length;
    const overdueTasks = allTasks.filter((t) => t.isOverdue).length;
    const upcomingDeadlines = allTasks.filter((t) => t.isUpcoming).length;
    const pendingApprovals = members.reduce((s, m) => s + m.pendingApprovals, 0);
    const criticalAssignments = allTasks.filter((t) => t.isCritical).length;
    const overloadedEmployees = members.filter((m) => m.isOverloaded).length;

    const avgCompliance =
      members.length > 0
        ? Math.round(members.reduce((s, m) => s + m.followUpCompliancePct, 0) / members.length)
        : 100;
    const avgCompletionPct =
      totalAssigned > 0
        ? Math.round(allTasks.reduce((s, t) => s + t.percentComplete, 0) / totalAssigned)
        : 0;

    out.push({
      department,
      headcount: members.length,
      overloadedEmployees,
      totalAssigned,
      activeTasks,
      completedTasks,
      overdueTasks,
      upcomingDeadlines,
      pendingApprovals,
      followUpCompliancePct: avgCompliance,
      criticalAssignments,
      avgCompletionPct,
    });
  });

  return out.sort((a, b) => b.activeTasks - a.activeTasks);
}

/**
 * Surfaces unassigned Charter Activities (no owner or not yet generated as a task)
 * and any BSC/Project task missing a valid Responsible person (§12.5).
 */
export function findUnassignedActivities(
  charters: ProjectCharter[],
  bscTasks: BscTask[],
  tasks: Task[]
): UnassignedActivityItem[] {
  const items: UnassignedActivityItem[] = [];

  charters.forEach((ch) => {
    if (ch.status === 'Closed') return;
    (ch.milestones || []).forEach((ms) => {
      (ms.activities || []).forEach((act) => {
        const linked = bscTasks.some(
          (t) =>
            t.charterId === ch.id &&
            t.milestoneId === ms.id &&
            norm(t.title) === norm(act.title) &&
            t.status !== 'Cancelled'
        );
        if (isNameUnassigned(act.responsibleName)) {
          items.push({
            id: `chact_${ch.id}_${act.id}`,
            source: 'charterActivity',
            code: `${ch.charterCode}-M${String(ms.milestoneNumber).padStart(2, '0')}`,
            title: act.title,
            projectCode: ch.projectCode,
            charterId: ch.id,
            milestoneTitle: ms.title,
            department: ch.perspective,
            plannedEnd: act.plannedEnd || ms.plannedEnd,
            reason: 'No Responsible (R) owner assigned on Charter Activity',
          });
        } else if (!linked) {
          items.push({
            id: `chact_unconv_${ch.id}_${act.id}`,
            source: 'charterActivity',
            code: `${ch.charterCode}-M${String(ms.milestoneNumber).padStart(2, '0')}`,
            title: act.title,
            projectCode: ch.projectCode,
            charterId: ch.id,
            milestoneTitle: ms.title,
            department: ch.perspective,
            plannedEnd: act.plannedEnd || ms.plannedEnd,
            reason:
              ch.status === 'Approved' || ch.status === 'Signed-off'
                ? 'Charter activity not yet converted to a tracked BSC Task'
                : `Charter "${ch.status}" — awaiting approval to generate tasks`,
          });
        }
      });
    });
  });

  bscTasks.forEach((t) => {
    if (t.status === 'Cancelled') return;
    if (isNameUnassigned(t.responsibleName) || t.status === 'Draft') {
      items.push({
        id: `bt_${t.id}`,
        source: 'bscTask',
        code: t.taskCode,
        title: t.title,
        projectCode: t.charterCode,
        charterId: t.charterId,
        department: t.department || 'BSC Execution',
        plannedEnd: t.plannedEnd,
        reason: isNameUnassigned(t.responsibleName)
          ? 'Missing Responsible (R) owner'
          : 'Draft task not yet formally assigned (baseline unlocked)',
      });
    }
  });

  tasks.forEach((t) => {
    if (t.status === 'Completed') return;
    if (isNameUnassigned(t.responsible)) {
      items.push({
        id: `pt_${t.id}`,
        source: 'projectTask',
        code: t.taskCode,
        title: t.name,
        projectCode: t.projectCode,
        department: t.department || 'Operations',
        plannedEnd: t.plannedEnd,
        reason: 'Missing Responsible person on project task',
      });
    }
  });

  return items;
}

// =============================================================================
// Section 12.7 — Advanced Project Analytics (All 9 Live Chart Datasets)
// =============================================================================

export interface AdvancedBscAnalytics {
  // 1. Project Progress by BSC Perspective
  perspectiveProgress: {
    perspective: BscPerspective;
    shortLabel: string;
    avgProgress: number;
    charterCount: number;
    taskCount: number;
  }[];
  // 2. Strategic Objective Completion Status
  soCompletion: {
    soCode: string;
    soTitle: string;
    perspective: BscPerspective;
    totalKras: number;
    completedKras: number;
    avgTaskProgress: number;
    completionPct: number;
  }[];
  // 3. KRA Achievement Tracking
  kraAchievement: {
    refCode: string;
    title: string;
    perspective: BscPerspective;
    linkedTasks: number;
    completedTasks: number;
    taskProgressPct: number;
    confirmed: boolean;
  }[];
  // 4. Planned vs Actual Progress Trend (6-month trajectory)
  plannedVsActualTrend: {
    month: string;
    plannedPct: number;
    actualPct: number;
  }[];
  // 5. Overdue Task Aging Distribution
  overdueAging: {
    bucket: string;
    count: number;
    color: string;
  }[];
  // 6. Follow-up Compliance Rate by Department
  deptFollowUpCompliance: {
    department: string;
    compliancePct: number;
    onTime: number;
    totalDue: number;
  }[];
  // 7. Escalation Frequency Trends (L1–L4)
  escalationDistribution: {
    level: string;
    count: number;
    color: string;
  }[];
  // 8. Milestone Slippage Analysis (by Day-Range Bucket + Charter)
  milestoneSlippage: {
    bucket: DayRangeBucket;
    avgSlipDays: number;
    slippedTasks: number;
    totalTasks: number;
  }[];
  // 9. Department Performance Comparison
  departmentComparison: {
    department: string;
    avgCompletion: number;
    onTimeRate: number;
    overdueCount: number;
    activeCount: number;
  }[];
}

const PERSPECTIVE_SHORT: Record<BscPerspective, string> = {
  Financial: 'Financial',
  Customer: 'Customer',
  'Internal Business Processes': 'Internal Proc.',
  'Learning & Growth': 'Learn & Growth',
  ESG: 'ESG',
};

export function computeAdvancedBscAnalytics(
  kras: BscKra[],
  charters: ProjectCharter[],
  bscTasks: BscTask[],
  followUps: TaskFollowUp[],
  projects: Project[],
  tasks: Task[],
  employees: Employee[],
  config: Omit<BscGovernanceConfig, 'ownerId' | 'id' | 'updatedAt'> = DEFAULT_BSC_CONFIG,
  refDate: Date = new Date()
): AdvancedBscAnalytics {
  const nonCancelled = bscTasks.filter((t) => t.status !== 'Cancelled');
  const charterMap = new Map(charters.map((c) => [c.id, c]));

  // 1. Project Progress by BSC Perspective
  const perspectiveProgress = BSC_PERSPECTIVES.map((perspective) => {
    const pCharters = charters.filter((c) => c.perspective === perspective);
    const pCharterIds = new Set(pCharters.map((c) => c.id));
    const pTasks = nonCancelled.filter((t) => pCharterIds.has(t.charterId));
    const avgProgress =
      pCharters.length > 0
        ? Math.round(
            pCharters.reduce((sum, c) => sum + computeCharterBscProgress(c.id, nonCancelled), 0) /
              pCharters.length
          )
        : 0;
    return {
      perspective,
      shortLabel: PERSPECTIVE_SHORT[perspective],
      avgProgress,
      charterCount: pCharters.length,
      taskCount: pTasks.length,
    };
  });

  // 2. Strategic Objective Completion Status
  const soMap = new Map<
    string,
    { soCode: string; soTitle: string; perspective: BscPerspective; kras: BscKra[] }
  >();
  kras.forEach((k) => {
    if (!soMap.has(k.soCode)) {
      soMap.set(k.soCode, {
        soCode: k.soCode,
        soTitle: k.soTitle,
        perspective: k.perspective,
        kras: [],
      });
    }
    soMap.get(k.soCode)!.kras.push(k);
  });
  const soCompletion = Array.from(soMap.values())
    .map((so) => {
      const kraIds = new Set(so.kras.map((k) => k.id));
      const linked = nonCancelled.filter((t) => (t.kraIds || []).some((id) => kraIds.has(id)));
      const avgTaskProgress =
        linked.length > 0
          ? Math.round(linked.reduce((s, t) => s + t.percentComplete, 0) / linked.length)
          : 0;
      const completedKras = so.kras.filter((k) => k.completionStatus).length;
      const completionPct =
        so.kras.length > 0
          ? Math.round(
              (completedKras / so.kras.length) * 50 + (avgTaskProgress / 100) * 50
            )
          : avgTaskProgress;
      return {
        soCode: so.soCode,
        soTitle: so.soTitle,
        perspective: so.perspective,
        totalKras: so.kras.length,
        completedKras,
        avgTaskProgress,
        completionPct,
      };
    })
    .sort((a, b) => a.soCode.localeCompare(b.soCode));

  // 3. KRA Achievement Tracking
  const kraAchievement = kras.slice(0, 12).map((kra) => {
    const linked = nonCancelled.filter((t) => (t.kraIds || []).includes(kra.id));
    const completedTasks = linked.filter((t) => t.status === 'Completed').length;
    const taskProgressPct =
      linked.length > 0
        ? Math.round(linked.reduce((s, t) => s + t.percentComplete, 0) / linked.length)
        : kra.completionStatus
          ? 100
          : 0;
    return {
      refCode: kra.refCode,
      title: kra.title,
      perspective: kra.perspective,
      linkedTasks: linked.length,
      completedTasks,
      taskProgressPct,
      confirmed: kra.completionStatus,
    };
  });

  // 4. Planned vs Actual Progress Trend (6 monthly checkpoints up to refDate)
  const plannedVsActualTrend: { month: string; plannedPct: number; actualPct: number }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const checkpoint = subMonths(refDate, i);
    const label = format(checkpoint, 'MMM yy');
    const cpIso = format(checkpoint, 'yyyy-MM-dd');

    // Planned average expected % at checkpoint across tasks that started on/before checkpoint
    const eligibleBsc = nonCancelled.filter((t) => t.plannedStart <= cpIso);
    const eligibleProj = tasks.filter((t) => t.plannedStart <= cpIso);
    const totalEligible = eligibleBsc.length + eligibleProj.length;

    let plannedSum = 0;
    let actualSum = 0;

    eligibleBsc.forEach((t) => {
      plannedSum += computeExpectedPercent(t, checkpoint);
      // Use follow-up snapshots up to checkpoint if available, else current for latest month
      const relevantFus = followUps
        .filter((f) => f.taskId === t.id && f.date <= cpIso)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (i === 0) {
        actualSum += t.percentComplete;
      } else if (relevantFus.length > 0) {
        actualSum += relevantFus[0].percentAfter;
      } else if (t.status === 'Completed' && (t.actualEnd || t.plannedEnd) <= cpIso) {
        actualSum += 100;
      } else {
        actualSum += Math.round(t.percentComplete * ((6 - i) / 6));
      }
    });

    eligibleProj.forEach((t) => {
      const s = parseDateSafe(t.plannedStart);
      const e = parseDateSafe(t.plannedEnd);
      if (s && e) {
        const dur = Math.max(1, differenceInCalendarDays(e, s));
        const elapsed = differenceInCalendarDays(checkpoint, s);
        plannedSum += Math.min(100, Math.max(0, Math.round((elapsed / dur) * 100)));
      }
      actualSum += i === 0 ? t.progress : Math.round(t.progress * ((6 - i) / 6));
    });

    plannedVsActualTrend.push({
      month: label,
      plannedPct: totalEligible > 0 ? Math.round(plannedSum / totalEligible) : 0,
      actualPct: totalEligible > 0 ? Math.round(actualSum / totalEligible) : 0,
    });
  }

  // 5. Overdue Task Aging Distribution
  const agingBuckets = [
    { bucket: '1–3 Days', min: 1, max: 3, count: 0, color: '#F9AB00' },
    { bucket: '4–7 Days', min: 4, max: 7, count: 0, color: '#EA8600' },
    { bucket: '8–14 Days', min: 8, max: 14, count: 0, color: '#D93025' },
    { bucket: '15+ Days', min: 15, max: 99999, count: 0, color: '#991B1B' },
  ];
  nonCancelled.forEach((t) => {
    const d = getBscDaysOverdue(t, refDate);
    if (d > 0) {
      const b = agingBuckets.find((ab) => d >= ab.min && d <= ab.max);
      if (b) b.count += 1;
    }
  });
  const today = startOfDay(refDate);
  tasks.forEach((t) => {
    if (t.status === 'Completed') return;
    const end = parseDateSafe(t.plannedEnd);
    if (!end) return;
    const d = differenceInCalendarDays(today, end);
    if (d > 0) {
      const b = agingBuckets.find((ab) => d >= ab.min && d <= ab.max);
      if (b) b.count += 1;
    }
  });
  const overdueAging = agingBuckets.map(({ bucket, count, color }) => ({ bucket, count, color }));

  // 6. Follow-up Compliance Rate by Department
  const unified = buildUnifiedWorkloadTasks(bscTasks, tasks, charters, projects, employees, refDate);
  const empRows = computeEmployeeAccountability(unified, employees, followUps);
  const deptRows = computeDepartmentAccountability(empRows);

  const deptFollowUpCompliance = deptRows.map((d) => {
    const deptBscIds = new Set(
      unified.filter((u) => u.department === d.department && u.source === 'bsc').map((u) => u.id)
    );
    const deptFus = followUps.filter((f) => deptBscIds.has(f.taskId));
    const onTime = deptFus.filter((f) => f.onTime).length;
    const missed = unified.filter((u) => u.department === d.department && u.followUpMissed).length;
    const totalDue = deptFus.length + missed;
    return {
      department: d.department,
      compliancePct: totalDue > 0 ? Math.round((onTime / totalDue) * 100) : 100,
      onTime,
      totalDue,
    };
  });

  // 7. Escalation Frequency Distribution (L1–L4 + Blocked Red)
  const escCounts: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  nonCancelled.forEach((t) => {
    if (!isBscTaskOpen(t) || t.status === 'Draft') return;
    const esc = computeEscalation(t, charterMap.get(t.charterId), bscTasks, config, refDate);
    if (esc.level >= 1 && esc.level <= 4) {
      escCounts[esc.level as 1 | 2 | 3 | 4] += 1;
    }
  });
  const escalationDistribution = [
    { level: 'L1 (1–2d)', count: escCounts[1], color: '#F9AB00' },
    { level: 'L2 (3–6d)', count: escCounts[2], color: '#EA8600' },
    { level: 'L3 (7–14d / Blocked)', count: escCounts[3], color: '#D93025' },
    { level: 'L4 (15+d / MS Slip)', count: escCounts[4], color: '#991B1B' },
  ];

  // 8. Milestone Slippage Analysis by Day-Range Bucket
  const milestoneSlippage = DAY_RANGE_BUCKETS.map((bucket) => {
    const bTasks = nonCancelled.filter((t) => t.dayRangeBucket === bucket);
    const slips = bTasks.map((t) => Math.max(0, computeSlippageDays(t)));
    const slippedTasks = slips.filter((s) => s > 0).length;
    const avgSlipDays =
      bTasks.length > 0
        ? Number((slips.reduce((a, b) => a + b, 0) / bTasks.length).toFixed(1))
        : 0;
    return {
      bucket,
      avgSlipDays,
      slippedTasks,
      totalTasks: bTasks.length,
    };
  }).filter((row) => row.totalTasks > 0 || ['15 Days', '30 Days', '60 Days', '90 Days', '180 Days'].includes(row.bucket));

  // 9. Department Performance Comparison
  const departmentComparison = deptRows.map((d) => {
    const deptTasks = unified.filter((u) => u.department === d.department);
    const onTimeTasks = deptTasks.filter((u) => !u.isOverdue).length;
    const onTimeRate =
      deptTasks.length > 0 ? Math.round((onTimeTasks / deptTasks.length) * 100) : 100;
    return {
      department: d.department,
      avgCompletion: d.avgCompletionPct,
      onTimeRate,
      overdueCount: d.overdueTasks,
      activeCount: d.activeTasks,
    };
  });

  // Touch computeTaskRag so unused warning never fires if reused later
  void computeTaskRag;

  return {
    perspectiveProgress,
    soCompletion,
    kraAchievement,
    plannedVsActualTrend,
    overdueAging,
    deptFollowUpCompliance,
    escalationDistribution,
    milestoneSlippage,
    departmentComparison,
  };
}
