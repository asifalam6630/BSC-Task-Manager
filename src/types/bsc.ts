import { Timestamp } from 'firebase/firestore';
import { Priority, SyncStatus } from './index';

export type BscPerspective =
  | 'Financial'
  | 'Customer'
  | 'Internal Business Processes'
  | 'Learning & Growth'
  | 'ESG';

export const BSC_PERSPECTIVES: BscPerspective[] = [
  'Financial',
  'Customer',
  'Internal Business Processes',
  'Learning & Growth',
  'ESG',
];

export type BscPhase =
  | 'Initialize'
  | 'Define'
  | 'Baseline'
  | 'Targets'
  | 'Improvement Drives'
  | 'Review'
  | 'Close to Deploy';

export const BSC_PHASES: BscPhase[] = [
  'Initialize',
  'Define',
  'Baseline',
  'Targets',
  'Improvement Drives',
  'Review',
  'Close to Deploy',
];

export type DayRangeBucket =
  | '15 Days'
  | '30 Days'
  | '45 Days'
  | '60 Days'
  | '90 Days'
  | '180 Days'
  | '365 Days'
  | 'New FY';

export const DAY_RANGE_BUCKETS: DayRangeBucket[] = [
  '15 Days',
  '30 Days',
  '45 Days',
  '60 Days',
  '90 Days',
  '180 Days',
  '365 Days',
  'New FY',
];

export type CharterStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Signed-off' | 'Closed';

export type BscTaskStatus =
  | 'Draft'
  | 'Assigned'
  | 'Query Raised'
  | 'Accepted'
  | 'In Progress'
  | 'Submitted for Review'
  | 'Returned'
  | 'Completed'
  | 'On Hold'
  | 'Blocked'
  | 'Cancelled';

export const BSC_BOARD_COLUMNS: BscTaskStatus[] = [
  'Draft',
  'Assigned',
  'Query Raised',
  'Accepted',
  'In Progress',
  'Submitted for Review',
  'Returned',
  'Completed',
  'On Hold',
  'Blocked',
  'Cancelled',
];

export type FollowUpFrequency = 'Daily' | 'Weekly' | 'Bi-weekly' | 'Monthly';

export type FollowUpType =
  | 'Owner Update'
  | 'PM Follow-up'
  | 'Review Comment'
  | 'Escalation'
  | 'System Reminder';

export type RagStatus = 'Green' | 'Amber' | 'Red' | 'Blue' | 'Grey';

export type ReviewMeetingType =
  | 'Monthly Project Review'
  | 'Quarterly BSC Review'
  | 'Half-Year BP Review'
  | 'Half-Year Business Plan Review'
  | 'Yearly Review'
  | 'Yearly BSC Review'
  | 'Project Steering Committee'
  | 'Departmental Follow-up Meeting';

export const UNIFIED_REVIEW_MEETING_TYPES: ReviewMeetingType[] = [
  'Monthly Project Review',
  'Quarterly BSC Review',
  'Half-Year Business Plan Review',
  'Yearly BSC Review',
  'Project Steering Committee',
  'Departmental Follow-up Meeting',
];

export type BscActingRole =
  | 'Admin'
  | 'Sponsor (MD) / Board'
  | 'Project Head (ED)'
  | 'Project Manager / Coordinator'
  | 'Project Lead (A)'
  | 'Task Owner (R)'
  | 'Consulted / Informed';

export interface BscRoleCapabilities {
  canConfigureAdmin: boolean;
  canOverrideDates: boolean;
  canApproveL3L4AndClosure: boolean;
  canCreateAndAssignTasks: boolean;
  canLogPmFollowUp: boolean;
  canGeneratePacks: boolean;
  canApproveSubmissions: boolean;
  canExecuteTask: boolean;
  canComment: boolean;
}

export const BSC_ROLE_CAPABILITIES: Record<BscActingRole, BscRoleCapabilities> = {
  Admin: {
    canConfigureAdmin: true,
    canOverrideDates: true,
    canApproveL3L4AndClosure: true,
    canCreateAndAssignTasks: true,
    canLogPmFollowUp: true,
    canGeneratePacks: true,
    canApproveSubmissions: true,
    canExecuteTask: true,
    canComment: true,
  },
  'Sponsor (MD) / Board': {
    canConfigureAdmin: false,
    canOverrideDates: false,
    canApproveL3L4AndClosure: false,
    canCreateAndAssignTasks: false,
    canLogPmFollowUp: false,
    canGeneratePacks: true,
    canApproveSubmissions: false,
    canExecuteTask: false,
    canComment: true,
  },
  'Project Head (ED)': {
    canConfigureAdmin: false,
    canOverrideDates: false,
    canApproveL3L4AndClosure: true,
    canCreateAndAssignTasks: false,
    canLogPmFollowUp: false,
    canGeneratePacks: true,
    canApproveSubmissions: true,
    canExecuteTask: false,
    canComment: true,
  },
  'Project Manager / Coordinator': {
    canConfigureAdmin: false,
    canOverrideDates: false,
    canApproveL3L4AndClosure: false,
    canCreateAndAssignTasks: true,
    canLogPmFollowUp: true,
    canGeneratePacks: true,
    canApproveSubmissions: false,
    canExecuteTask: true,
    canComment: true,
  },
  'Project Lead (A)': {
    canConfigureAdmin: false,
    canOverrideDates: false,
    canApproveL3L4AndClosure: false,
    canCreateAndAssignTasks: true,
    canLogPmFollowUp: true,
    canGeneratePacks: true,
    canApproveSubmissions: true,
    canExecuteTask: true,
    canComment: true,
  },
  'Task Owner (R)': {
    canConfigureAdmin: false,
    canOverrideDates: false,
    canApproveL3L4AndClosure: false,
    canCreateAndAssignTasks: false,
    canLogPmFollowUp: false,
    canGeneratePacks: false,
    canApproveSubmissions: false,
    canExecuteTask: true,
    canComment: true,
  },
  'Consulted / Informed': {
    canConfigureAdmin: false,
    canOverrideDates: false,
    canApproveL3L4AndClosure: false,
    canCreateAndAssignTasks: false,
    canLogPmFollowUp: false,
    canGeneratePacks: false,
    canApproveSubmissions: false,
    canExecuteTask: false,
    canComment: true,
  },
};

export interface BscKra {
  id: string;
  ownerId: string;
  refCode: string;
  perspective: BscPerspective;
  soCode: string;
  soTitle: string;
  title: string;
  unit: string;
  dataOwner: string;
  targetValue?: string;
  currentValue?: string;
  completionStatus: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CharterActivity {
  id: string;
  title: string;
  description: string;
  deliverableEvidence: string;
  phase: BscPhase;
  responsibleName: string;
  accountableName: string;
  priority: Priority;
  weight: number;
  plannedStart: string;
  plannedEnd: string;
}

export interface CharterMilestone {
  id: string;
  milestoneNumber: number;
  title: string;
  dayRangeBucket: DayRangeBucket;
  plannedStart: string;
  plannedEnd: string;
  status: 'Open' | 'Closed';
  activities: CharterActivity[];
}

export interface ProjectCharter {
  id: string;
  ownerId: string;
  charterCode: string;
  projectCode: string;
  projectId?: string;
  title: string;
  perspective: BscPerspective;
  soCode: string;
  kraIds: string[];
  status: CharterStatus;
  businessNeed: string;
  scope: string;
  objectivesGoals: string;
  opportunity: string;
  deliverables: string;
  risksAssumptions: string;
  teamSignOff: string;
  projectLead: string;
  projectManager: string;
  projectHead: string;
  projectSponsor: string;
  startDate: string;
  targetDate: string;
  milestones: CharterMilestone[];
  charterRevision: number;
  closureNote?: string;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BscTask {
  id: string;
  ownerId: string;
  taskCode: string;
  projectId?: string;
  charterId: string;
  charterCode: string;
  milestoneId: string;
  milestoneNumber: number;
  kraIds: string[];
  phase: BscPhase;
  title: string;
  description: string;
  deliverableEvidence: string;
  responsibleId?: string;
  responsibleName: string;
  accountableId?: string;
  accountableName: string;
  consultedIds: string[];
  informedIds: string[];
  priority: Priority;
  baselineStart: string;
  baselineEnd: string;
  baselineLocked: boolean;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  dayRangeBucket: DayRangeBucket;
  weight: number;
  predecessorIds: string[];
  status: BscTaskStatus;
  percentComplete: number; // 0-100 in steps of 10
  followUpFrequency: FollowUpFrequency;
  nextFollowUpDate: string;
  assignedAt?: string;
  submittedAt?: string;
  approvedAt?: string;
  blockedSince?: string;
  statusReason?: string;
  charterChangedFlag?: boolean;
  attachments: string[];
  sourceActionItemId?: string;
  parentTaskId?: string;
  department?: string;
  googleEventId?: string;
  syncStatus?: SyncStatus;
  lastSyncedAt?: string;
  createdBy: string;
  updatedBy: string;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TaskFollowUp {
  id: string;
  ownerId: string;
  taskId: string;
  taskCode: string;
  charterId: string;
  date: string;
  updatedBy: string;
  progressNote: string;
  percentBefore: number;
  percentAfter: number;
  statusBefore: string;
  statusAfter: string;
  issuesBlockers?: string;
  supportNeededFrom?: string;
  nextAction?: string;
  nextFollowUpDate?: string;
  attachments: string[];
  type: FollowUpType;
  onTime: boolean;
  isDemo: boolean;
  createdAt?: Timestamp;
}

export interface DateChangeRequest {
  id: string;
  ownerId: string;
  taskId: string;
  taskCode: string;
  charterId: string;
  milestoneId: string;
  oldEnd: string;
  proposedEnd: string;
  reason: string;
  impactOnMilestone: boolean;
  requestedBy: string;
  approverA: string;
  approverEd?: string;
  decisionA: 'Pending' | 'Approved' | 'Rejected';
  decisionEd: 'Not Required' | 'Pending' | 'Approved' | 'Rejected';
  decision: 'Pending' | 'Approved' | 'Rejected';
  decisionDate?: string;
  comment?: string;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ReviewActionItem {
  id: string;
  kraId?: string;
  charterId: string;
  charterCode: string;
  issue: string;
  action: string;
  owner: string;
  dueDate: string;
  status: 'Open' | 'Converted' | 'Closed';
  convertedTaskId?: string;
  convertedTaskCode?: string;
}

export interface ReviewMeeting {
  id: string;
  ownerId: string;
  meetingCode?: string;
  projectId?: string;
  charterId?: string;
  perspective?: BscPerspective;
  type: ReviewMeetingType;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
  chairperson?: string;
  attendees: string[];
  agenda?: string;
  minutes: string;
  decisions: string;
  actionItems: ReviewActionItem[];
  googleEventId?: string;
  syncStatus?: SyncStatus;
  lastSyncedAt?: string;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CalendarSyncLog {
  id: string;
  ownerId: string;
  entityType: 'task' | 'bscTask' | 'meeting' | 'reviewMeeting' | 'calendar';
  entityId: string;
  entityCode: string;
  googleEventId?: string;
  action: 'create' | 'update' | 'cancel' | 'pull' | 'error';
  status: 'success' | 'error';
  message: string;
  actorName: string;
  syncedAt: string;
  createdAt?: Timestamp;
}

export interface BscGovernanceConfig {
  id?: string;
  ownerId: string;
  reminderDaysBeforeDue: number;
  escalationL1Days: number;
  escalationL2Days: number;
  escalationL3Days: number;
  escalationL4Days: number;
  blockedEscalationDays: number;
  followUpComplianceTarget: number;
  dailyDigestTime: string;
  dailyDigestTimezone: string;
  channels: {
    inApp: boolean;
    email: boolean;
    whatsapp: boolean;
    sms: boolean;
  };
  updatedAt?: Timestamp;
}

export const DEFAULT_BSC_CONFIG: Omit<BscGovernanceConfig, 'ownerId' | 'id' | 'updatedAt'> = {
  reminderDaysBeforeDue: 3,
  escalationL1Days: 1,
  escalationL2Days: 3,
  escalationL3Days: 7,
  escalationL4Days: 15,
  blockedEscalationDays: 3,
  followUpComplianceTarget: 90,
  dailyDigestTime: '09:00',
  dailyDigestTimezone: 'Asia/Dhaka',
  channels: {
    inApp: true,
    email: true,
    whatsapp: false,
    sms: false,
  },
};
