import { addDays, differenceInCalendarDays, format, isValid, parseISO, startOfDay } from 'date-fns';
import {
  BscGovernanceConfig,
  BscKra,
  BscTask,
  BscTaskStatus,
  DayRangeBucket,
  DEFAULT_BSC_CONFIG,
  FollowUpFrequency,
  ProjectCharter,
  RagStatus,
  TaskFollowUp,
} from '../types/bsc';

export function parseDateSafe(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = parseISO(dateStr);
  return isValid(d) ? startOfDay(d) : null;
}

export function computeDayRangeBucket(plannedEnd: string, projectStart: string): DayRangeBucket {
  const end = parseDateSafe(plannedEnd);
  const start = parseDateSafe(projectStart);
  if (!end || !start) return '90 Days';
  const days = differenceInCalendarDays(end, start);
  if (days <= 15) return '15 Days';
  if (days <= 30) return '30 Days';
  if (days <= 45) return '45 Days';
  if (days <= 60) return '60 Days';
  if (days <= 90) return '90 Days';
  if (days <= 180) return '180 Days';
  if (days <= 365) return '365 Days';
  return 'New FY';
}

export function computeNextFollowUpDate(fromDateStr: string, freq: FollowUpFrequency): string {
  const base = parseDateSafe(fromDateStr) || startOfDay(new Date());
  const delta = freq === 'Daily' ? 1 : freq === 'Bi-weekly' ? 14 : freq === 'Monthly' ? 30 : 7;
  return format(addDays(base, delta), 'yyyy-MM-dd');
}

export function generateNextTaskCode(
  charterCode: string,
  milestoneNumber: number,
  existingTasks: BscTask[]
): string {
  const mStr = `M${String(milestoneNumber).padStart(2, '0')}`;
  const prefix = `${charterCode}-${mStr}-T`;
  let maxSeq = 0;
  existingTasks.forEach((t) => {
    if (t.taskCode.startsWith(prefix)) {
      const n = parseInt(t.taskCode.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
    }
  });
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export function isBscTaskOpen(task: BscTask): boolean {
  return task.status !== 'Completed' && task.status !== 'Cancelled';
}

export function getBscDaysOverdue(task: BscTask, refDate: Date = new Date()): number {
  if (!isBscTaskOpen(task) || task.status === 'Draft') return 0;
  const end = parseDateSafe(task.plannedEnd);
  if (!end) return 0;
  const diff = differenceInCalendarDays(startOfDay(refDate), end);
  return diff > 0 ? diff : 0;
}

export function getBscDaysUntilDue(task: BscTask, refDate: Date = new Date()): number {
  const end = parseDateSafe(task.plannedEnd);
  if (!end) return 999;
  return differenceInCalendarDays(end, startOfDay(refDate));
}

export function computeSlippageDays(task: BscTask): number {
  const base = parseDateSafe(task.baselineEnd);
  const compare = parseDateSafe(task.status === 'Completed' && task.actualEnd ? task.actualEnd : task.plannedEnd);
  if (!base || !compare) return 0;
  return differenceInCalendarDays(compare, base);
}

export function computeExpectedPercent(task: BscTask, refDate: Date = new Date()): number {
  const start = parseDateSafe(task.plannedStart);
  const end = parseDateSafe(task.plannedEnd);
  if (!start || !end) return 0;
  const today = startOfDay(refDate);
  if (today <= start) return 0;
  if (today >= end) return 100;
  const dur = Math.max(1, differenceInCalendarDays(end, start));
  const elapsed = differenceInCalendarDays(today, start);
  return Math.min(100, Math.max(0, Math.round((elapsed / dur) * 100)));
}

export function computeScheduleGap(task: BscTask, refDate: Date = new Date()): number {
  return computeExpectedPercent(task, refDate) - task.percentComplete;
}

export function isFollowUpMissed(task: BscTask, refDate: Date = new Date()): boolean {
  if (!isBscTaskOpen(task) || task.status === 'Draft' || task.status === 'Submitted for Review') {
    return false;
  }
  const next = parseDateSafe(task.nextFollowUpDate);
  if (!next) return false;
  return startOfDay(refDate) > next;
}

export function isFollowUpDueToday(task: BscTask, refDate: Date = new Date()): boolean {
  if (!isBscTaskOpen(task) || task.status === 'Draft') return false;
  const next = parseDateSafe(task.nextFollowUpDate);
  if (!next) return false;
  return differenceInCalendarDays(next, startOfDay(refDate)) === 0;
}

export function isAcceptanceOverdue(task: BscTask, refDate: Date = new Date()): boolean {
  if (task.status !== 'Assigned' || !task.assignedAt) return false;
  const assigned = parseDateSafe(task.assignedAt.slice(0, 10));
  if (!assigned) return false;
  return differenceInCalendarDays(startOfDay(refDate), assigned) > 2;
}

export function getBlockedDays(task: BscTask, refDate: Date = new Date()): number {
  if (task.status !== 'Blocked') return 0;
  const since = parseDateSafe(task.blockedSince || task.plannedStart);
  if (!since) return 0;
  return Math.max(0, differenceInCalendarDays(startOfDay(refDate), since));
}

/**
 * Exact §5 RAG Calculation (handles predecessor Red cascade safely with cycle guard).
 */
export function computeTaskRag(
  task: BscTask,
  allTasks: BscTask[],
  refDate: Date = new Date(),
  visited = new Set<string>()
): RagStatus {
  if (task.status === 'Completed') return 'Blue';
  if (task.status === 'Draft' || task.status === 'Cancelled') return 'Grey';
  if (task.status === 'Blocked') return 'Red';

  const daysOverdue = getBscDaysOverdue(task, refDate);
  if (daysOverdue > 7) return 'Red';

  // Check if any predecessor is Red
  if (!visited.has(task.id) && (task.predecessorIds || []).length > 0) {
    visited.add(task.id);
    for (const predId of task.predecessorIds) {
      const pred = allTasks.find((t) => t.id === predId);
      if (pred && computeTaskRag(pred, allTasks, refDate, visited) === 'Red') {
        return 'Red';
      }
    }
  }

  const daysUntilDue = getBscDaysUntilDue(task, refDate);
  const fuMissed = isFollowUpMissed(task, refDate);

  if (
    (daysUntilDue <= 3 && daysUntilDue >= 0 && task.percentComplete < 80) ||
    (daysOverdue >= 1 && daysOverdue <= 7) ||
    fuMissed
  ) {
    return 'Amber';
  }

  return 'Green';
}

export interface EscalationAssessment {
  level: 0 | 1 | 2 | 3 | 4;
  triggers: string[];
  notifyRoles: string[];
  notifyPeople: string[];
  ageDays: number;
  rag: RagStatus;
}

/**
 * Exact §6 Escalation Matrix
 */
export function computeEscalation(
  task: BscTask,
  charter: ProjectCharter | undefined,
  allTasks: BscTask[],
  config: Omit<BscGovernanceConfig, 'ownerId' | 'id' | 'updatedAt'> = DEFAULT_BSC_CONFIG,
  refDate: Date = new Date()
): EscalationAssessment {
  const rag = computeTaskRag(task, allTasks, refDate);
  if (!isBscTaskOpen(task) || task.status === 'Draft') {
    return { level: 0, triggers: [], notifyRoles: [], notifyPeople: [], ageDays: 0, rag };
  }

  const daysOverdue = getBscDaysOverdue(task, refDate);
  const blockedDays = getBlockedDays(task, refDate);
  const ms = charter?.milestones.find((m) => m.id === task.milestoneId);
  const msSlipped = ms ? task.plannedEnd > ms.plannedEnd : false;

  let level: 0 | 1 | 2 | 3 | 4 = 0;
  const triggers: string[] = [];

  if (daysOverdue >= config.escalationL4Days || msSlipped) {
    level = 4;
    if (daysOverdue >= config.escalationL4Days) triggers.push(`Overdue +${daysOverdue}d (≥${config.escalationL4Days}d)`);
    if (msSlipped) triggers.push('Milestone end date slipped');
  } else if (
    daysOverdue >= config.escalationL3Days ||
    blockedDays > config.blockedEscalationDays ||
    (task.priority === 'Critical' && rag === 'Red')
  ) {
    level = 3;
    if (daysOverdue >= config.escalationL3Days) triggers.push(`Overdue +${daysOverdue}d (≥${config.escalationL3Days}d)`);
    if (blockedDays > config.blockedEscalationDays) triggers.push(`Blocked ${blockedDays}d (>${config.blockedEscalationDays}d)`);
    if (task.priority === 'Critical' && rag === 'Red') triggers.push('Critical-priority task is Red');
  } else if (daysOverdue >= config.escalationL2Days) {
    level = 2;
    triggers.push(`Overdue +${daysOverdue}d (≥${config.escalationL2Days}d)`);
  } else if (daysOverdue >= config.escalationL1Days) {
    level = 1;
    triggers.push(`Overdue +${daysOverdue}d (≥${config.escalationL1Days}d)`);
  }

  const notifyRoles: string[] = [];
  const notifyPeople: string[] = [];
  const pushUnique = (arr: string[], val?: string) => {
    if (val && !arr.includes(val)) arr.push(val);
  };

  if (level === 1) {
    notifyRoles.push('Task Owner (R)', 'Project Lead (A)');
    pushUnique(notifyPeople, task.responsibleName);
    pushUnique(notifyPeople, task.accountableName);
  } else if (level === 2) {
    notifyRoles.push('Project Lead (A)', 'Project Manager (L3)');
    pushUnique(notifyPeople, task.accountableName);
    pushUnique(notifyPeople, charter?.projectManager);
  } else if (level === 3) {
    notifyRoles.push('Project Manager (L3)', 'Coordinator', 'Project Head – ED (L4)');
    pushUnique(notifyPeople, charter?.projectManager);
    pushUnique(notifyPeople, charter?.projectHead);
  } else if (level === 4) {
    notifyRoles.push('Project Head – ED (L4)', 'Project Sponsor – MD (L5)');
    pushUnique(notifyPeople, charter?.projectHead);
    pushUnique(notifyPeople, charter?.projectSponsor);
  }

  const ageDays = Math.max(daysOverdue, blockedDays);
  return { level, triggers, notifyRoles, notifyPeople, ageDays, rag };
}

export interface ReminderAlertItem {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  charterCode: string;
  trigger: string;
  severity: 'info' | 'warning' | 'critical';
  escalationLevel: 0 | 1 | 2 | 3 | 4;
  notify: string[];
  action: string;
}

/**
 * Generates all active reminders & escalations for a simulated/current date (§6).
 */
export function evaluateRemindersAndEscalations(
  tasks: BscTask[],
  charters: ProjectCharter[],
  config: Omit<BscGovernanceConfig, 'ownerId' | 'id' | 'updatedAt'> = DEFAULT_BSC_CONFIG,
  refDate: Date = new Date()
): ReminderAlertItem[] {
  const alerts: ReminderAlertItem[] = [];
  const charterMap = new Map(charters.map((c) => [c.id, c]));

  for (const t of tasks) {
    if (!isBscTaskOpen(t) || t.status === 'Draft') continue;
    const charter = charterMap.get(t.charterId);
    const daysUntilDue = getBscDaysUntilDue(t, refDate);
    const esc = computeEscalation(t, charter, tasks, config, refDate);

    // 1. 3 days before due
    if (daysUntilDue > 0 && daysUntilDue <= config.reminderDaysBeforeDue && t.status !== 'Submitted for Review') {
      alerts.push({
        taskId: t.id,
        taskCode: t.taskCode,
        taskTitle: t.title,
        charterCode: t.charterCode,
        trigger: `${daysUntilDue}d before due`,
        severity: 'info',
        escalationLevel: 0,
        notify: [t.responsibleName],
        action: 'Pre-deadline Reminder',
      });
    }

    // 2. On due date, not Submitted
    if (daysUntilDue === 0 && t.status !== 'Submitted for Review') {
      alerts.push({
        taskId: t.id,
        taskCode: t.taskCode,
        taskTitle: t.title,
        charterCode: t.charterCode,
        trigger: 'Due today (not Submitted)',
        severity: 'warning',
        escalationLevel: 0,
        notify: [t.responsibleName, `${t.accountableName} (cc)`],
        action: 'Due Date Reminder',
      });
    }

    // 3. Follow-up date missed
    if (isFollowUpMissed(t, refDate)) {
      alerts.push({
        taskId: t.id,
        taskCode: t.taskCode,
        taskTitle: t.title,
        charterCode: t.charterCode,
        trigger: `Follow-up missed (due ${t.nextFollowUpDate})`,
        severity: 'warning',
        escalationLevel: 0,
        notify: [t.responsibleName, charter?.projectManager || 'PM'],
        action: 'Reminder + "Follow-up Missed" Flag',
      });
    }

    // 4. Unaccepted > 2 working days
    if (isAcceptanceOverdue(t, refDate)) {
      alerts.push({
        taskId: t.id,
        taskCode: t.taskCode,
        taskTitle: t.title,
        charterCode: t.charterCode,
        trigger: 'Not accepted within 2 working days',
        severity: 'warning',
        escalationLevel: 0,
        notify: [t.responsibleName, charter?.projectManager || 'PM'],
        action: 'Flag unaccepted assignment to PM',
      });
    }

    // 5. Escalation L1 - L4
    if (esc.level > 0) {
      alerts.push({
        taskId: t.id,
        taskCode: t.taskCode,
        taskTitle: t.title,
        charterCode: t.charterCode,
        trigger: esc.triggers.join(' · '),
        severity: esc.level >= 3 ? 'critical' : 'warning',
        escalationLevel: esc.level,
        notify: esc.notifyPeople.length > 0 ? esc.notifyPeople : esc.notifyRoles,
        action: `Escalation L${esc.level} (${esc.rag})`,
      });
    }
  }

  return alerts.sort((a, b) => b.escalationLevel - a.escalationLevel);
}

/**
 * Weighted average progress excluding Cancelled tasks (§5).
 */
export function computeWeightedBscProgress(tasks: BscTask[]): number {
  const active = tasks.filter((t) => t.status !== 'Cancelled');
  if (active.length === 0) return 0;
  let wSum = 0;
  let totalW = 0;
  for (const t of active) {
    const w = Math.max(1, Number(t.weight) || 1);
    wSum += w * (Number(t.percentComplete) || 0);
    totalW += w;
  }
  return totalW > 0 ? Math.round(wSum / totalW) : 0;
}

export function computeMilestoneBscProgress(milestoneId: string, tasks: BscTask[]): number {
  return computeWeightedBscProgress(tasks.filter((t) => t.milestoneId === milestoneId));
}

export function computeCharterBscProgress(charterId: string, tasks: BscTask[]): number {
  return computeWeightedBscProgress(tasks.filter((t) => t.charterId === charterId));
}

export interface PortfolioBscKpis {
  totalPerspectives: number;
  totalSos: number;
  totalKras: number;
  totalCharters: number;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  onTimeCompletionPct: number;
  followUpCompliancePct: number;
  overdueCount: number;
  overduePctOfOpen: number;
  avgApprovalTurnaroundDays: number;
  escalationsByLevel: Record<1 | 2 | 3 | 4, number>;
  krasWithNoActiveTask: BscKra[];
  krasReadyForCompletionSuggestion: BscKra[];
}

export function computePortfolioBscKpis(
  kras: BscKra[],
  charters: ProjectCharter[],
  tasks: BscTask[],
  followUps: TaskFollowUp[],
  config: Omit<BscGovernanceConfig, 'ownerId' | 'id' | 'updatedAt'> = DEFAULT_BSC_CONFIG,
  refDate: Date = new Date()
): PortfolioBscKpis {
  const activePerspectives = new Set(kras.map((k) => k.perspective));
  const activeSos = new Set(kras.map((k) => k.soCode));

  const nonCancelled = tasks.filter((t) => t.status !== 'Cancelled');
  const openTasks = nonCancelled.filter((t) => t.status !== 'Completed');
  const completedTasks = nonCancelled.filter((t) => t.status === 'Completed');

  const onTimeCompleted = completedTasks.filter((t) => {
    const actual = parseDateSafe(t.actualEnd || t.plannedEnd);
    const base = parseDateSafe(t.baselineEnd);
    return actual && base ? actual <= base : true;
  });
  const onTimeCompletionPct =
    completedTasks.length > 0 ? Math.round((onTimeCompleted.length / completedTasks.length) * 100) : 0;

  // Follow-up compliance: logged on time / (total logged + currently missed follow-ups)
  const missedCount = openTasks.filter((t) => isFollowUpMissed(t, refDate)).length;
  const loggedOnTime = followUps.filter((f) => f.onTime).length;
  const totalFollowUpDue = followUps.length + missedCount;
  const followUpCompliancePct =
    totalFollowUpDue > 0 ? Math.round((loggedOnTime / totalFollowUpDue) * 100) : 100;

  const overdueCount = openTasks.filter((t) => getBscDaysOverdue(t, refDate) > 0).length;
  const overduePctOfOpen = openTasks.length > 0 ? Math.round((overdueCount / openTasks.length) * 100) : 0;

  // Avg approval turnaround (days between submittedAt and approvedAt)
  const turnaroundSamples: number[] = [];
  completedTasks.forEach((t) => {
    if (t.submittedAt && t.approvedAt) {
      const s = parseDateSafe(t.submittedAt.slice(0, 10));
      const a = parseDateSafe(t.approvedAt.slice(0, 10));
      if (s && a) turnaroundSamples.push(Math.max(0, differenceInCalendarDays(a, s)));
    }
  });
  const avgApprovalTurnaroundDays =
    turnaroundSamples.length > 0
      ? Number((turnaroundSamples.reduce((acc, v) => acc + v, 0) / turnaroundSamples.length).toFixed(1))
      : 0;

  // Open escalations by level
  const escalationsByLevel: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const charterMap = new Map(charters.map((c) => [c.id, c]));
  openTasks.forEach((t) => {
    const esc = computeEscalation(t, charterMap.get(t.charterId), tasks, config, refDate);
    if (esc.level >= 1 && esc.level <= 4) {
      escalationsByLevel[esc.level as 1 | 2 | 3 | 4] += 1;
    }
  });

  // KRAs with no active task (Gap list)
  const krasWithNoActiveTask = kras.filter((kra) => {
    if (kra.completionStatus) return false;
    const linkedActive = tasks.some(
      (t) => t.status !== 'Cancelled' && (t.kraIds || []).includes(kra.id)
    );
    return !linkedActive;
  });

  // KRAs where all linked non-cancelled tasks are Completed and KRA not yet confirmed complete
  const krasReadyForCompletionSuggestion = kras.filter((kra) => {
    if (kra.completionStatus) return false;
    const linked = tasks.filter(
      (t) => t.status !== 'Cancelled' && (t.kraIds || []).includes(kra.id)
    );
    return linked.length > 0 && linked.every((t) => t.status === 'Completed');
  });

  return {
    totalPerspectives: activePerspectives.size,
    totalSos: activeSos.size,
    totalKras: kras.length,
    totalCharters: charters.length,
    totalTasks: nonCancelled.length,
    openTasks: openTasks.length,
    completedTasks: completedTasks.length,
    onTimeCompletionPct,
    followUpCompliancePct,
    overdueCount,
    overduePctOfOpen,
    avgApprovalTurnaroundDays,
    escalationsByLevel,
    krasWithNoActiveTask,
    krasReadyForCompletionSuggestion,
  };
}

/**
 * Strict §4.1 Workflow State Transition Map
 */
export const ALLOWED_WORKFLOW_TRANSITIONS: Record<BscTaskStatus, BscTaskStatus[]> = {
  Draft: ['Assigned', 'Cancelled'],
  Assigned: ['Accepted', 'Query Raised', 'On Hold', 'Cancelled'],
  'Query Raised': ['Assigned', 'Accepted', 'Cancelled'],
  Accepted: ['In Progress', 'On Hold', 'Blocked', 'Cancelled'],
  'In Progress': ['Submitted for Review', 'On Hold', 'Blocked', 'Cancelled'],
  'Submitted for Review': ['Completed', 'Returned'],
  Returned: ['In Progress', 'Submitted for Review', 'Blocked', 'On Hold'],
  Completed: [],
  'On Hold': ['In Progress', 'Accepted', 'Assigned', 'Cancelled'],
  Blocked: ['In Progress', 'On Hold', 'Cancelled'],
  Cancelled: [],
};

export function isWorkflowTransitionAllowed(from: BscTaskStatus, to: BscTaskStatus): boolean {
  if (from === to) return false;
  return (ALLOWED_WORKFLOW_TRANSITIONS[from] || []).includes(to);
}

export function getRagBadgeClasses(rag: RagStatus): string {
  switch (rag) {
    case 'Green':
      return 'bg-[#188038]/12 text-[#188038] dark:bg-emerald-500/15 dark:text-emerald-400';
    case 'Amber':
      return 'bg-[#F9AB00]/18 text-[#B06000] dark:bg-amber-500/15 dark:text-amber-400';
    case 'Red':
      return 'bg-[#D93025]/12 text-[#D93025] dark:bg-red-500/15 dark:text-red-400';
    case 'Blue':
      return 'bg-[#1A73E8]/12 text-[#1A73E8] dark:bg-blue-500/15 dark:text-blue-400';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  }
}

export function getRagDotColor(rag: RagStatus): string {
  switch (rag) {
    case 'Green':
      return '#188038';
    case 'Amber':
      return '#D97706';
    case 'Red':
      return '#D93025';
    case 'Blue':
      return '#1A73E8';
    default:
      return '#64748B';
  }
}
