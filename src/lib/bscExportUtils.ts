import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addDays, format, subDays } from 'date-fns';
import {
  BSC_PERSPECTIVES,
  BscGovernanceConfig,
  BscKra,
  BscTask,
  DateChangeRequest,
  DEFAULT_BSC_CONFIG,
  ProjectCharter,
  ReviewActionItem,
  ReviewMeeting,
  TaskFollowUp,
} from '../types/bsc';
import {
  computeCharterBscProgress,
  computeEscalation,
  computePortfolioBscKpis,
  computeSlippageDays,
  computeTaskRag,
  getBscDaysOverdue,
  parseDateSafe,
} from './bscMetrics';

export interface MonthlyReviewPack {
  charter: ProjectCharter;
  generatedDate: string;
  charterProgressPct: number;
  completedLastMonth: BscTask[];
  dueNextMonth: BscTask[];
  overdueOrSlipped: {
    task: BscTask;
    daysOverdue: number;
    slippageDays: number;
    reason: string;
  }[];
  blockers: {
    task: BscTask;
    blockedSince: string;
    blockerNote: string;
    supportNeeded: string;
  }[];
  dateChanges: DateChangeRequest[];
  decisionsNeeded: string[];
  actionItems: ReviewActionItem[];
}

export function buildMonthlyReviewPack(
  charter: ProjectCharter,
  allTasks: BscTask[],
  followUps: TaskFollowUp[],
  dateChanges: DateChangeRequest[],
  meetings: ReviewMeeting[],
  refDate: Date = new Date()
): MonthlyReviewPack {
  const charterTasks = allTasks.filter((t) => t.charterId === charter.id);
  const prev30 = subDays(refDate, 30);
  const next30 = addDays(refDate, 30);

  const completedLastMonth = charterTasks.filter((t) => {
    if (t.status !== 'Completed') return false;
    const d = parseDateSafe(t.actualEnd || t.plannedEnd);
    return d ? d >= prev30 && d <= refDate : true;
  });

  const dueNextMonth = charterTasks.filter((t) => {
    if (t.status === 'Completed' || t.status === 'Cancelled') return false;
    const d = parseDateSafe(t.plannedEnd);
    return d ? d >= refDate && d <= next30 : false;
  });

  const overdueOrSlipped = charterTasks
    .filter((t) => {
      if (t.status === 'Cancelled') return false;
      return getBscDaysOverdue(t, refDate) > 0 || computeSlippageDays(t) > 0;
    })
    .map((task) => {
      const latestFu = followUps
        .filter((f) => f.taskId === task.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      return {
        task,
        daysOverdue: getBscDaysOverdue(task, refDate),
        slippageDays: computeSlippageDays(task),
        reason:
          task.statusReason ||
          latestFu?.issuesBlockers ||
          latestFu?.progressNote ||
          'Pending root-cause update from owner',
      };
    });

  const blockers = charterTasks
    .filter((t) => t.status === 'Blocked' || t.status === 'On Hold')
    .map((task) => {
      const latestFu = followUps
        .filter((f) => f.taskId === task.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      return {
        task,
        blockedSince: task.blockedSince || latestFu?.date || task.plannedStart,
        blockerNote: task.statusReason || latestFu?.issuesBlockers || 'Blocker logged',
        supportNeeded: latestFu?.supportNeededFrom || charter.projectHead,
      };
    });

  const charterDateChanges = dateChanges.filter((d) => d.charterId === charter.id);

  const decisionsNeeded: string[] = [];
  charterDateChanges
    .filter((d) => d.decision === 'Pending')
    .forEach((d) => {
      decisionsNeeded.push(
        `Approve/Reject Date-Change for ${d.taskCode} (${d.oldEnd} → ${d.proposedEnd})${d.impactOnMilestone ? ' [Impacts Milestone — ED Sign-off Required]' : ''}`
      );
    });
  blockers.forEach((b) => {
    decisionsNeeded.push(
      `Unblock ${b.task.taskCode} (${b.task.title}) — Support needed from ${b.supportNeeded}`
    );
  });
  charterTasks
    .filter((t) => t.status === 'Submitted for Review')
    .forEach((t) => {
      decisionsNeeded.push(
        `Review & Approve deliverable for ${t.taskCode} (Accountable: ${t.accountableName})`
      );
    });

  const actionItems: ReviewActionItem[] = [];
  meetings.forEach((m) => {
    (m.actionItems || []).forEach((ai) => {
      if (ai.charterId === charter.id) actionItems.push(ai);
    });
  });

  return {
    charter,
    generatedDate: format(refDate, 'yyyy-MM-dd'),
    charterProgressPct: computeCharterBscProgress(charter.id, allTasks),
    completedLastMonth,
    dueNextMonth,
    overdueOrSlipped,
    blockers,
    dateChanges: charterDateChanges,
    decisionsNeeded,
    actionItems,
  };
}

export function exportMonthlyPackToExcel(pack: MonthlyReviewPack): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Executive Summary
  const summaryRows = [
    ['TURAG GARMENTS & HOSIERY MILLS LTD. — MONTHLY PROJECT REVIEW PACK'],
    [`Charter: ${pack.charter.charterCode} (${pack.charter.projectCode}) — ${pack.charter.title}`],
    [`Perspective: ${pack.charter.perspective} | SO: ${pack.charter.soCode} | Reference Date: ${pack.generatedDate}`],
    [`Lead (A): ${pack.charter.projectLead} | PM: ${pack.charter.projectManager} | Head (ED): ${pack.charter.projectHead} | Sponsor (MD): ${pack.charter.projectSponsor}`],
    [],
    ['Metric', 'Value'],
    ['Weighted Charter Completion %', `${pack.charterProgressPct}%`],
    ['Completed Last 30 Days', pack.completedLastMonth.length],
    ['Due Next 30 Days', pack.dueNextMonth.length],
    ['Overdue / Slipped Tasks', pack.overdueOrSlipped.length],
    ['Active Blockers / On Hold', pack.blockers.length],
    ['Date-Change Requests', pack.dateChanges.length],
    ['Decisions Needed', pack.decisionsNeeded.length],
    [],
    ['Decisions Needed for Review Meeting'],
    ...pack.decisionsNeeded.map((d, i) => [`${i + 1}. ${d}`]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

  // Sheet 2: Completed Last Month
  const compSheet = [
    ['Task Code', 'Title', 'Owner (R)', 'Accountable (A)', 'Baseline End', 'Actual End', 'Evidence'],
    ...pack.completedLastMonth.map((t) => [
      t.taskCode,
      t.title,
      t.responsibleName,
      t.accountableName,
      t.baselineEnd,
      t.actualEnd || t.plannedEnd,
      (t.attachments || []).join('; '),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compSheet), 'Completed_Last_Month');

  // Sheet 3: Due Next Month
  const dueSheet = [
    ['Task Code', 'Title', 'Owner (R)', 'Phase', 'Planned End', 'Status', 'Progress %'],
    ...pack.dueNextMonth.map((t) => [
      t.taskCode,
      t.title,
      t.responsibleName,
      t.phase,
      t.plannedEnd,
      t.status,
      `${t.percentComplete}%`,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dueSheet), 'Due_Next_Month');

  // Sheet 4: Overdue & Slipped
  const overdueSheet = [
    ['Task Code', 'Title', 'Owner (R)', 'Baseline End', 'Planned End', 'Days Overdue', 'Slippage (d)', 'Reason / Update'],
    ...pack.overdueOrSlipped.map((o) => [
      o.task.taskCode,
      o.task.title,
      o.task.responsibleName,
      o.task.baselineEnd,
      o.task.plannedEnd,
      o.daysOverdue,
      o.slippageDays,
      o.reason,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overdueSheet), 'Overdue_Slipped');

  // Sheet 5: Blockers & Date Changes
  const blockerSheet = [
    ['Task Code', 'Title', 'Status', 'Since', 'Blocker Details', 'Support Needed From'],
    ...pack.blockers.map((b) => [
      b.task.taskCode,
      b.task.title,
      b.task.status,
      b.blockedSince,
      b.blockerNote,
      b.supportNeeded,
    ]),
    [],
    ['Date-Change Task', 'Old End', 'Proposed End', 'Milestone Impact', 'A Decision', 'ED Decision', 'Overall', 'Reason'],
    ...pack.dateChanges.map((d) => [
      d.taskCode,
      d.oldEnd,
      d.proposedEnd,
      d.impactOnMilestone ? 'YES' : 'NO',
      d.decisionA,
      d.decisionEd,
      d.decision,
      d.reason,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(blockerSheet), 'Blockers_DateChanges');

  // Sheet 6: Action Items
  const actionSheet = [
    ['Charter', 'Issue', 'Action', 'Owner', 'Due Date', 'Status', 'Linked Task'],
    ...pack.actionItems.map((a) => [
      a.charterCode,
      a.issue,
      a.action,
      a.owner,
      a.dueDate,
      a.status,
      a.convertedTaskCode || '-',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actionSheet), 'Action_Items');

  XLSX.writeFile(wb, `Turag_BSC_Monthly_Pack_${pack.charter.charterCode}_${pack.generatedDate}.xlsx`);
}

export function exportMonthlyPackToPdf(pack: MonthlyReviewPack): void {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(14);
  doc.setTextColor(23, 43, 77);
  doc.text(`Monthly BSC Project Review Pack — ${pack.charter.charterCode}`, 14, 16);

  doc.setFontSize(9.5);
  doc.setTextColor(80, 90, 105);
  doc.text(
    `${pack.charter.title} | Perspective: ${pack.charter.perspective} | Weighted Progress: ${pack.charterProgressPct}% | Date: ${pack.generatedDate}`,
    14,
    22
  );

  let y = 28;
  const addSection = (title: string, head: string[], body: string[][]) => {
    if (y > 165) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(10.5);
    doc.setTextColor(23, 43, 77);
    doc.text(title, 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [head],
      body: body.length > 0 ? body : [['No records in this section', ...Array(head.length - 1).fill('')]],
      styles: { fontSize: 7.8, cellPadding: 2 },
      headStyles: { fillColor: [23, 43, 77], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [247, 249, 252] },
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y + 20;
    y = finalY + 9;
  };

  addSection(
    `1. Completed Last 30 Days (${pack.completedLastMonth.length})`,
    ['Code', 'Task Title', 'Owner (R)', 'Baseline End', 'Actual End', 'Evidence'],
    pack.completedLastMonth.map((t) => [
      t.taskCode,
      t.title,
      t.responsibleName,
      t.baselineEnd,
      t.actualEnd || t.plannedEnd,
      (t.attachments || []).join(', '),
    ])
  );

  addSection(
    `2. Due Next 30 Days (${pack.dueNextMonth.length})`,
    ['Code', 'Task Title', 'Owner (R)', 'Phase', 'Planned End', 'Status', '%'],
    pack.dueNextMonth.map((t) => [
      t.taskCode,
      t.title,
      t.responsibleName,
      t.phase,
      t.plannedEnd,
      t.status,
      `${t.percentComplete}%`,
    ])
  );

  addSection(
    `3. Overdue & Slipped Tasks (${pack.overdueOrSlipped.length})`,
    ['Code', 'Task Title', 'Owner (R)', 'Baseline', 'Planned', 'Overdue', 'Slip', 'Reason'],
    pack.overdueOrSlipped.map((o) => [
      o.task.taskCode,
      o.task.title,
      o.task.responsibleName,
      o.task.baselineEnd,
      o.task.plannedEnd,
      `${o.daysOverdue}d`,
      `${o.slippageDays >= 0 ? '+' : ''}${o.slippageDays}d`,
      o.reason,
    ])
  );

  addSection(
    `4. Blockers (${pack.blockers.length}) & Date-Change Requests (${pack.dateChanges.length})`,
    ['Code', 'Type', 'Detail', 'Support / Approvers', 'Status'],
    [
      ...pack.blockers.map((b) => [
        b.task.taskCode,
        'Blocker',
        b.blockerNote,
        b.supportNeeded,
        `${b.task.status} since ${b.blockedSince}`,
      ]),
      ...pack.dateChanges.map((d) => [
        d.taskCode,
        'Date Change',
        `${d.oldEnd} -> ${d.proposedEnd}: ${d.reason}`,
        `A: ${d.decisionA} / ED: ${d.decisionEd}`,
        d.decision,
      ]),
    ]
  );

  addSection(
    `5. Decisions Needed (${pack.decisionsNeeded.length})`,
    ['#', 'Decision Item'],
    pack.decisionsNeeded.map((d, i) => [String(i + 1), d])
  );

  doc.save(`Turag_BSC_Monthly_Pack_${pack.charter.charterCode}_${pack.generatedDate}.pdf`);
}

// =============================================================================
// Quarterly Board Pack — Rolled Up by 5 BSC Perspectives
// =============================================================================

export interface QuarterlyPerspectiveRow {
  perspective: string;
  soCount: number;
  kraCount: number;
  krasCompleted: number;
  chartersCount: number;
  avgProgressPct: number;
  openTasks: number;
  overdueTasks: number;
  redTasks: number;
  escalationsL3L4: number;
}

export interface QuarterlyBoardPack {
  generatedDate: string;
  kpis: ReturnType<typeof computePortfolioBscKpis>;
  perspectiveRows: QuarterlyPerspectiveRow[];
  gapKras: BscKra[];
}

export function buildQuarterlyBoardPack(
  kras: BscKra[],
  charters: ProjectCharter[],
  tasks: BscTask[],
  followUps: TaskFollowUp[],
  config: Omit<BscGovernanceConfig, 'ownerId' | 'id' | 'updatedAt'> = DEFAULT_BSC_CONFIG,
  refDate: Date = new Date()
): QuarterlyBoardPack {
  const kpis = computePortfolioBscKpis(kras, charters, tasks, followUps, config, refDate);
  const charterMap = new Map(charters.map((c) => [c.id, c]));

  const perspectiveRows: QuarterlyPerspectiveRow[] = BSC_PERSPECTIVES.map((persp) => {
    const pKras = kras.filter((k) => k.perspective === persp);
    const pSos = new Set(pKras.map((k) => k.soCode));
    const pCharters = charters.filter((c) => c.perspective === persp);
    const pCharterIds = new Set(pCharters.map((c) => c.id));
    const pTasks = tasks.filter((t) => pCharterIds.has(t.charterId) && t.status !== 'Cancelled');
    const open = pTasks.filter((t) => t.status !== 'Completed');
    const overdue = open.filter((t) => getBscDaysOverdue(t, refDate) > 0);
    const red = open.filter((t) => computeTaskRag(t, tasks, refDate) === 'Red');
    const l3l4 = open.filter(
      (t) => computeEscalation(t, charterMap.get(t.charterId), tasks, config, refDate).level >= 3
    );
    const avgProgressPct =
      pCharters.length > 0
        ? Math.round(
            pCharters.reduce((sum, c) => sum + computeCharterBscProgress(c.id, tasks), 0) /
              pCharters.length
          )
        : 0;

    return {
      perspective: persp,
      soCount: pSos.size,
      kraCount: pKras.length,
      krasCompleted: pKras.filter((k) => k.completionStatus).length,
      chartersCount: pCharters.length,
      avgProgressPct,
      openTasks: open.length,
      overdueTasks: overdue.length,
      redTasks: red.length,
      escalationsL3L4: l3l4.length,
    };
  });

  return {
    generatedDate: format(refDate, 'yyyy-MM-dd'),
    kpis,
    perspectiveRows,
    gapKras: kpis.krasWithNoActiveTask,
  };
}

export function exportQuarterlyPackToExcel(pack: QuarterlyBoardPack): void {
  const wb = XLSX.utils.book_new();
  const sheet1 = [
    ['TURAG GARMENTS & HOSIERY MILLS LTD. — QUARTERLY BSC BOARD PACK'],
    [`Generated: ${pack.generatedDate} | Live Portfolio Roll-up across ${pack.kpis.totalPerspectives} Perspectives, ${pack.kpis.totalSos} SOs, ${pack.kpis.totalKras} KRAs`],
    [],
    ['Portfolio KPI', 'Value'],
    ['On-Time Completion %', `${pack.kpis.onTimeCompletionPct}%`],
    ['Follow-Up Compliance %', `${pack.kpis.followUpCompliancePct}%`],
    ['Open Tasks / Overdue Tasks', `${pack.kpis.openTasks} / ${pack.kpis.overdueCount} (${pack.kpis.overduePctOfOpen}%)`],
    ['Avg Approval Turnaround', `${pack.kpis.avgApprovalTurnaroundDays} days`],
    ['Open Escalations (L1/L2/L3/L4)', `L1:${pack.kpis.escalationsByLevel[1]} L2:${pack.kpis.escalationsByLevel[2]} L3:${pack.kpis.escalationsByLevel[3]} L4:${pack.kpis.escalationsByLevel[4]}`],
    [],
    ['Perspective', 'SOs', 'KRAs', 'KRAs Complete', 'Charters', 'Avg %', 'Open Tasks', 'Overdue', 'Red', 'L3/L4 Escalations'],
    ...pack.perspectiveRows.map((r) => [
      r.perspective,
      r.soCount,
      r.kraCount,
      r.krasCompleted,
      r.chartersCount,
      `${r.avgProgressPct}%`,
      r.openTasks,
      r.overdueTasks,
      r.redTasks,
      r.escalationsL3L4,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1), 'Quarterly_Perspective_Rollup');

  const sheet2 = [
    ['KRA Ref', 'Perspective', 'SO Code', 'KRA Title', 'Data Owner', 'Target', 'Current'],
    ...pack.gapKras.map((k) => [
      k.refCode,
      k.perspective,
      k.soCode,
      k.title,
      k.dataOwner,
      k.targetValue || '-',
      k.currentValue || '-',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2), 'KRA_Gap_List');

  XLSX.writeFile(wb, `Turag_BSC_Quarterly_Board_Pack_${pack.generatedDate}.xlsx`);
}

export function exportQuarterlyPackToPdf(pack: QuarterlyBoardPack): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.setTextColor(23, 43, 77);
  doc.text('Turag BSC Quarterly Board Review Pack', 14, 16);

  doc.setFontSize(9.5);
  doc.setTextColor(80, 90, 105);
  doc.text(
    `Date: ${pack.generatedDate} | On-Time: ${pack.kpis.onTimeCompletionPct}% | Follow-Up Compliance: ${pack.kpis.followUpCompliancePct}% | Overdue: ${pack.kpis.overdueCount} (${pack.kpis.overduePctOfOpen}%)`,
    14,
    22
  );

  autoTable(doc, {
    startY: 28,
    head: [['Perspective', 'SOs', 'KRAs', 'KRAs Done', 'Charters', 'Avg %', 'Open', 'Overdue', 'Red', 'L3/L4']],
    body: pack.perspectiveRows.map((r) => [
      r.perspective,
      String(r.soCount),
      String(r.kraCount),
      String(r.krasCompleted),
      String(r.chartersCount),
      `${r.avgProgressPct}%`,
      String(r.openTasks),
      String(r.overdueTasks),
      String(r.redTasks),
      String(r.escalationsL3L4),
    ]),
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [23, 43, 77], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [247, 249, 252] },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 95;
  doc.setFontSize(10.5);
  doc.setTextColor(23, 43, 77);
  doc.text(`KRA Gap List — Unassigned KRAs with No Active Tasks (${pack.gapKras.length})`, 14, finalY + 10);

  autoTable(doc, {
    startY: finalY + 14,
    head: [['Ref Code', 'Perspective', 'SO', 'KRA Title', 'Data Owner', 'Current / Target']],
    body:
      pack.gapKras.length > 0
        ? pack.gapKras.map((k) => [
            k.refCode,
            k.perspective,
            k.soCode,
            k.title,
            k.dataOwner,
            `${k.currentValue || '-'} / ${k.targetValue || '-'}`,
          ])
        : [['None', 'All KRAs have active linked tasks', '', '', '', '']],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [23, 43, 77], textColor: [255, 255, 255] },
  });

  doc.save(`Turag_BSC_Quarterly_Board_Pack_${pack.generatedDate}.pdf`);
}
