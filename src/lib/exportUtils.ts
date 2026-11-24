import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Employee, Meeting, Project, RaciEntry, RACI_COLUMNS, Task } from '../types';
import {
  computeEmployeeWorkloads,
  getDaysOverdue,
  getProjectMilestoneProgress,
  getProjectPlannedProgress,
  getProjectWeightedProgress,
  getScheduleVariance,
  isTaskOverdue,
} from './metrics';

export type ReportId =
  | 'executive_summary'
  | 'individual_project'
  | 'task_completion'
  | 'overdue_tasks'
  | 'meeting_actions'
  | 'raci_matrix'
  | 'employee_workload'
  | 'planned_vs_actual'
  | 'monthly_review';

export interface ReportContext {
  projects: Project[];
  tasks: Task[];
  meetings: Meeting[];
  raciEntries: RaciEntry[];
  employees: Employee[];
  selectedProjectId?: string;
}

export interface GeneratedReportTable {
  title: string;
  subtitle: string;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}

export function buildReportData(reportId: ReportId, ctx: ReportContext): GeneratedReportTable {
  const dateStamp = format(new Date(), 'yyyy-MM-dd');
  const { projects, tasks, meetings, raciEntries, employees, selectedProjectId } = ctx;

  switch (reportId) {
    case 'executive_summary': {
      return {
        title: 'Executive Project Summary Report',
        subtitle: `Strategic Portfolio Overview · Generated ${dateStamp}`,
        filename: `Executive_Project_Summary_${dateStamp}`,
        headers: [
          'Project ID',
          'Project Name',
          'Department',
          'Owner',
          'Priority',
          'Status',
          'Planned %',
          'Actual %',
          'Variance',
          'Milestones',
          'Target Date',
        ],
        rows: projects.map((p) => {
          const actual = getProjectWeightedProgress(p.id, tasks);
          const planned = getProjectPlannedProgress(p, tasks);
          const variance = getScheduleVariance(actual, planned);
          const ms = getProjectMilestoneProgress(p);
          return [
            p.projectCode,
            p.name,
            p.department,
            p.projectOwner,
            p.priority,
            p.status,
            `${planned}%`,
            `${actual}%`,
            `${variance >= 0 ? '+' : ''}${variance}%`,
            `${ms.completed}/${ms.total}`,
            p.targetDate,
          ];
        }),
      };
    }

    case 'individual_project': {
      const proj =
        projects.find((p) => p.id === selectedProjectId) || projects[0];
      const projTasks = proj ? tasks.filter((t) => t.projectId === proj.id) : [];
      return {
        title: proj ? `${proj.projectCode} — ${proj.name}` : 'Individual Project Progress Report',
        subtitle: proj
          ? `Owner: ${proj.projectOwner} · Department: ${proj.department} · Target: ${proj.targetDate}`
          : `Generated ${dateStamp}`,
        filename: `${proj ? proj.projectCode : 'Project'}_Progress_Report_${dateStamp}`,
        headers: [
          'Task ID',
          'Task Name',
          'Responsible',
          'Accountable',
          'Planned Start',
          'Planned End',
          'Weight',
          'Status',
          'Progress %',
        ],
        rows: projTasks.map((t) => [
          t.taskCode,
          t.name,
          t.responsible,
          t.accountable || '-',
          t.plannedStart,
          t.plannedEnd,
          t.weight,
          t.status,
          `${t.progress}%`,
        ]),
      };
    }

    case 'task_completion': {
      return {
        title: 'Task Completion Report',
        subtitle: `All Project Tasks & Weighted Completion · Generated ${dateStamp}`,
        filename: `Task_Completion_Report_${dateStamp}`,
        headers: [
          'Task ID',
          'Project',
          'Task Name',
          'Responsible',
          'Department',
          'Start',
          'End',
          'Priority',
          'Status',
          'Progress',
        ],
        rows: tasks.map((t) => [
          t.taskCode,
          t.projectCode,
          t.name,
          t.responsible,
          t.department,
          t.plannedStart,
          t.plannedEnd,
          t.priority,
          t.status,
          `${t.progress}%`,
        ]),
      };
    }

    case 'overdue_tasks': {
      const overdue = tasks.filter((t) => isTaskOverdue(t));
      return {
        title: 'Overdue Task Analysis Report',
        subtitle: `${overdue.length} Overdue Activities Requiring Escalation · Generated ${dateStamp}`,
        filename: `Overdue_Task_Report_${dateStamp}`,
        headers: [
          'Task ID',
          'Project',
          'Task Name',
          'Responsible',
          'Department',
          'Due Date',
          'Days Overdue',
          'Progress',
          'Status',
        ],
        rows: overdue.map((t) => [
          t.taskCode,
          t.projectCode,
          t.name,
          t.responsible,
          t.department,
          t.plannedEnd,
          getDaysOverdue(t),
          `${t.progress}%`,
          t.status,
        ]),
      };
    }

    case 'meeting_actions': {
      const rows: (string | number)[][] = [];
      meetings.forEach((m) => {
        (m.actionPoints || []).forEach((ap) => {
          rows.push([
            m.meetingCode,
            m.projectCode,
            m.title,
            m.date,
            ap.description,
            ap.owner,
            ap.deadline,
            ap.status,
            ap.convertedTaskId ? 'Converted' : 'Not Converted',
          ]);
        });
      });
      return {
        title: 'Meeting Action Tracker',
        subtitle: `Governance Action Items & Follow-ups · Generated ${dateStamp}`,
        filename: `Meeting_Action_Tracker_${dateStamp}`,
        headers: [
          'Meeting ID',
          'Project',
          'Meeting Title',
          'Date',
          'Action Point',
          'Owner',
          'Deadline',
          'Status',
          'Task Link',
        ],
        rows,
      };
    }

    case 'raci_matrix': {
      const filtered = selectedProjectId
        ? raciEntries.filter((r) => r.projectId === selectedProjectId)
        : raciEntries;
      return {
        title: 'RACI Responsibility Matrix',
        subtitle: `Governance Role Allocation (R=Responsible, A=Accountable, C=Consulted, I=Informed) · ${dateStamp}`,
        filename: `RACI_Matrix_${dateStamp}`,
        headers: ['Project', 'Activity', 'Department', ...RACI_COLUMNS],
        rows: filtered.map((r) => [
          r.projectCode,
          r.activity,
          r.department,
          ...RACI_COLUMNS.map((col) => r.roles?.[col] || '-'),
        ]),
      };
    }

    case 'employee_workload': {
      const workloads = computeEmployeeWorkloads(employees, tasks);
      return {
        title: 'Employee Workload & Utilization Report',
        subtitle: `Individual Assignments, Overdue & Progress Metrics · Generated ${dateStamp}`,
        filename: `Employee_Workload_Report_${dateStamp}`,
        headers: [
          'Emp ID',
          'Name',
          'Designation',
          'Department',
          'Projects',
          'Total Tasks',
          'Completed',
          'Pending',
          'Overdue',
          'Avg Progress',
        ],
        rows: workloads.map((w) => [
          w.employee.employeeCode,
          w.employee.name,
          w.employee.designation,
          w.employee.department,
          w.projectsCount,
          w.totalTasks,
          w.completedTasks,
          w.pendingTasks,
          w.overdueTasks,
          `${w.avgProgress}%`,
        ]),
      };
    }

    case 'planned_vs_actual': {
      return {
        title: 'Planned vs Actual Performance Report',
        subtitle: `Weighted Schedule Variance Analysis · Generated ${dateStamp}`,
        filename: `Planned_vs_Actual_Report_${dateStamp}`,
        headers: [
          'Project ID',
          'Project Name',
          'Department',
          'Start Date',
          'Target Date',
          'Planned %',
          'Actual %',
          'Schedule Variance',
          'Health',
        ],
        rows: projects.map((p) => {
          const actual = getProjectWeightedProgress(p.id, tasks);
          const planned = getProjectPlannedProgress(p, tasks);
          const variance = getScheduleVariance(actual, planned);
          const health =
            variance >= -5 ? 'On Track' : variance >= -15 ? 'At Risk' : 'Behind Schedule';
          return [
            p.projectCode,
            p.name,
            p.department,
            p.startDate,
            p.targetDate,
            `${planned}%`,
            `${actual}%`,
            `${variance >= 0 ? '+' : ''}${variance}%`,
            health,
          ];
        }),
      };
    }

    case 'monthly_review': {
      const deptMap = new Map<
        string,
        { projects: number; totalTasks: number; completed: number; overdue: number; progressSum: number }
      >();
      projects.forEach((p) => {
        const entry = deptMap.get(p.department) || {
          projects: 0,
          totalTasks: 0,
          completed: 0,
          overdue: 0,
          progressSum: 0,
        };
        entry.projects += 1;
        entry.progressSum += getProjectWeightedProgress(p.id, tasks);
        deptMap.set(p.department, entry);
      });
      tasks.forEach((t) => {
        const entry = deptMap.get(t.department) || {
          projects: 0,
          totalTasks: 0,
          completed: 0,
          overdue: 0,
          progressSum: 0,
        };
        entry.totalTasks += 1;
        if (t.status === 'Completed' || t.progress >= 100) entry.completed += 1;
        if (isTaskOverdue(t)) entry.overdue += 1;
        deptMap.set(t.department, entry);
      });

      return {
        title: 'Monthly Project Review Report',
        subtitle: `Departmental Execution Scorecard · Generated ${dateStamp}`,
        filename: `Monthly_Project_Review_${dateStamp}`,
        headers: [
          'Department',
          'Projects',
          'Total Tasks',
          'Completed',
          'Overdue',
          'On-Time Completion %',
          'Avg Project Progress',
        ],
        rows: Array.from(deptMap.entries()).map(([dept, stats]) => [
          dept,
          stats.projects,
          stats.totalTasks,
          stats.completed,
          stats.overdue,
          stats.totalTasks > 0 ? `${Math.round((stats.completed / stats.totalTasks) * 100)}%` : '0%',
          stats.projects > 0 ? `${Math.round(stats.progressSum / stats.projects)}%` : '0%',
        ]),
      };
    }
  }
}

export function exportReportToExcel(report: GeneratedReportTable): void {
  const wsData = [[report.title], [report.subtitle], [], report.headers, ...report.rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${report.filename}.xlsx`);
}

export function exportReportToPdf(report: GeneratedReportTable): void {
  const doc = new jsPDF({ orientation: report.headers.length > 7 ? 'landscape' : 'portrait' });
  doc.setFontSize(15);
  doc.setTextColor(23, 43, 77);
  doc.text(report.title, 14, 18);

  doc.setFontSize(9.5);
  doc.setTextColor(95, 99, 104);
  doc.text(report.subtitle, 14, 24);

  autoTable(doc, {
    startY: 30,
    head: [report.headers],
    body: report.rows.map((r) => r.map((cell) => String(cell))),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [23, 43, 77], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
  });

  doc.save(`${report.filename}.pdf`);
}

export function downloadExcelImportTemplate(): void {
  const sampleRows = [
    [
      'Project ID',
      'Project Name',
      'Charter ID',
      'Milestone ID',
      'Task ID',
      'Parent Task ID',
      'Task Name',
      'Department',
      'Employee ID',
      'Responsible',
      'Accountable',
      'Consulted',
      'Informed',
      'Baseline Start',
      'Baseline End',
      'Planned Start',
      'Planned End',
      'Follow-up Frequency',
      'Next Follow-up Date',
      'Priority',
      'Status',
      'Progress',
      'Weight',
      'Deliverable Evidence',
    ],
    [
      'P04',
      'Stock Ageing & Working Capital Optimization',
      'TG-BSC05',
      'M01',
      'TG-BSC05-M01-T091',
      '',
      'Reconcile 180+ Day Aged Fabric Lot Register',
      'Supply Chain & Planning',
      'EMP-102',
      'Rajib Hossain',
      'Md. Ashiful Alam',
      'Finance',
      'Humayon Mostaque',
      '2026-12-01',
      '2026-12-12',
      '2026-12-01',
      '2026-12-12',
      'Weekly',
      '2026-12-08',
      'High',
      'Assigned',
      '0%',
      15,
      'Signed Fabric Lot Ageing Audit Sheet (.xlsx)',
    ],
    [
      'P04',
      'Stock Ageing & Working Capital Optimization',
      'TG-BSC05',
      'M02',
      'TG-BSC05-M02-T092',
      'TG-BSC05-M01-T091',
      'Liquidation Approval Workflow for Dead Stock',
      'Finance & Accounts',
      'EMP-105',
      'Shaymol Sarker',
      'Md. Ashiful Alam',
      'Operations',
      'Md. Rashedul Hasan',
      '2026-12-10',
      '2026-12-22',
      '2026-12-10',
      '2026-12-22',
      'Weekly',
      '2026-12-17',
      'Critical',
      'Assigned',
      '0%',
      20,
      'ED-Approved Stock Liquidation SOP (.pdf)',
    ],
    [
      'P25',
      'Corporate Governance & Policy Development',
      '',
      'MS-01',
      'T201',
      '',
      'Finalize Delegation of Authority Matrix',
      'Corporate Governance',
      'EMP-101',
      'Farhana Rahman',
      'Executive Director (ED)',
      'Finance, HR',
      'MD',
      '2026-12-03',
      '2026-12-18',
      '2026-12-03',
      '2026-12-18',
      'Bi-weekly',
      '2026-12-10',
      'High',
      'Not Started',
      '0%',
      15,
      'Board-Approved DoA Matrix (.pdf)',
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BSC_Project_Plan_Template');
  XLSX.writeFile(wb, 'Turag_BSC_TaskMaster_Import_Template.xlsx');
}
