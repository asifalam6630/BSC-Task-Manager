import { Timestamp } from 'firebase/firestore';

export type NavSection =
  | 'dashboard'
  | 'workspace'
  | 'projects'
  | 'tasks'
  | 'calendar'
  | 'gantt'
  | 'meetings'
  | 'raci'
  | 'team'
  | 'excel'
  | 'reports'
  | 'notifications'
  | 'settings'
  | 'bsc-portfolio'
  | 'bsc-my-tasks'
  | 'bsc-board'
  | 'bsc-day-range'
  | 'bsc-followup-desk'
  | 'bsc-escalations'
  | 'bsc-reviews'
  | 'workload';

export type UserRole =
  | 'Super Admin'
  | 'MD / Executive'
  | 'ED / Project Sponsor'
  | 'Project Manager'
  | 'Department Head'
  | 'Team Member'
  | 'Viewer';

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

export type ProjectStatus =
  | 'Not Started'
  | 'Planning'
  | 'In Progress'
  | 'At Risk'
  | 'Delayed'
  | 'On Hold'
  | 'Completed'
  | 'Cancelled';

export type TaskStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Pending Approval'
  | 'Under Review'
  | 'Completed'
  | 'Delayed'
  | 'On Hold';

export type MeetingCategory =
  | 'BOD Meeting'
  | 'Steering Committee Meeting'
  | 'Project Review Meeting'
  | 'Departmental Meeting'
  | 'Progress Review Meeting'
  | 'Follow-up Meeting'
  | 'Monthly Project Review'
  | 'Quarterly BSC Review'
  | 'Half-Year Business Plan Review'
  | 'Yearly BSC Review'
  | 'Project Steering Committee'
  | 'Departmental Follow-up Meeting';

export type SyncStatus = 'not_synced' | 'synced' | 'pending' | 'error';

export type RaciLetter = 'R' | 'A' | 'C' | 'I' | '';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  department: string;
  designation: string;
  theme: 'light' | 'dark';
  reminderDays?: number[];
  emailAlerts?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  completed: boolean;
}

export interface ProjectDocument {
  id: string;
  name: string;
  type: string;
  url?: string;
  uploadedAt: string;
}

export interface Project {
  id: string;
  ownerId: string;
  projectCode: string;
  name: string;
  category: string;
  strategicObjective: string;
  description: string;
  projectOwner: string;
  projectChampion: string;
  department: string;
  startDate: string; // YYYY-MM-DD
  targetDate: string; // YYYY-MM-DD
  priority: Priority;
  status: ProjectStatus;
  budget?: number;
  color: string;
  milestones?: ProjectMilestone[];
  documents?: ProjectDocument[];
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Task {
  id: string;
  ownerId: string;
  taskCode: string;
  projectId: string;
  projectCode: string;
  parentTaskId?: string;
  name: string;
  description: string;
  responsible: string;
  accountable: string;
  consulted?: string[];
  informed?: string[];
  department: string;
  plannedStart: string; // YYYY-MM-DD
  plannedEnd: string; // YYYY-MM-DD
  actualStart?: string;
  actualEnd?: string;
  estimatedDays: number;
  weight: number;
  priority: Priority;
  status: TaskStatus;
  progress: number; // 0-100
  dependencies?: string[];
  remarks?: string;
  attachments?: string[];
  googleEventId?: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TaskActivity {
  id: string;
  ownerId: string;
  authorName: string;
  type: 'comment' | 'status_change' | 'progress_update' | 'sync';
  message: string;
  createdAt?: Timestamp;
}

export interface ActionPoint {
  id: string;
  description: string;
  owner: string;
  deadline: string; // YYYY-MM-DD
  status: 'Open' | 'In Progress' | 'Completed';
  convertedTaskId?: string;
}

export interface Meeting {
  id: string;
  ownerId: string;
  meetingCode: string;
  title: string;
  projectId: string;
  projectCode: string;
  category: MeetingCategory;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  venue: string;
  chairperson: string;
  participants?: string[];
  agenda: string;
  minutes: string;
  actionPoints?: ActionPoint[];
  googleEventId?: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RaciEntry {
  id: string;
  ownerId: string;
  projectId: string;
  projectCode: string;
  activity: string;
  department: string;
  roles: Record<string, RaciLetter>;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Employee {
  id: string;
  ownerId: string;
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
  email: string;
  reportingManager: string;
  systemRole: UserRole;
  isDemo: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AppNotification {
  id: string;
  ownerId: string;
  type: 'deadline' | 'overdue' | 'assignment' | 'meeting' | 'delay' | 'milestone' | 'approval' | 'raci' | 'escalation' | 'followup';
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: 'project' | 'task' | 'meeting' | 'raci' | 'charter' | 'bscTask' | 'dateChange';
  severity: 'info' | 'warning' | 'critical' | 'success';
  read: boolean;
  createdAt?: Timestamp;
}

export const ROLE_PERMISSIONS: Record<
  UserRole,
  {
    canCreateProject: boolean;
    canAssignTasks: boolean;
    canUpdateProgress: boolean;
    canApproveTasks: boolean;
    canEditCalendar: boolean;
    canManageMeetings: boolean;
    canAccessReports: boolean;
    canManageUsers: boolean;
  }
> = {
  'Super Admin': {
    canCreateProject: true,
    canAssignTasks: true,
    canUpdateProgress: true,
    canApproveTasks: true,
    canEditCalendar: true,
    canManageMeetings: true,
    canAccessReports: true,
    canManageUsers: true,
  },
  'MD / Executive': {
    canCreateProject: true,
    canAssignTasks: true,
    canUpdateProgress: true,
    canApproveTasks: true,
    canEditCalendar: true,
    canManageMeetings: true,
    canAccessReports: true,
    canManageUsers: false,
  },
  'ED / Project Sponsor': {
    canCreateProject: true,
    canAssignTasks: true,
    canUpdateProgress: true,
    canApproveTasks: true,
    canEditCalendar: true,
    canManageMeetings: true,
    canAccessReports: true,
    canManageUsers: false,
  },
  'Project Manager': {
    canCreateProject: true,
    canAssignTasks: true,
    canUpdateProgress: true,
    canApproveTasks: true,
    canEditCalendar: true,
    canManageMeetings: true,
    canAccessReports: true,
    canManageUsers: false,
  },
  'Department Head': {
    canCreateProject: false,
    canAssignTasks: true,
    canUpdateProgress: true,
    canApproveTasks: true,
    canEditCalendar: true,
    canManageMeetings: true,
    canAccessReports: true,
    canManageUsers: false,
  },
  'Team Member': {
    canCreateProject: false,
    canAssignTasks: false,
    canUpdateProgress: true,
    canApproveTasks: false,
    canEditCalendar: true,
    canManageMeetings: false,
    canAccessReports: true,
    canManageUsers: false,
  },
  Viewer: {
    canCreateProject: false,
    canAssignTasks: false,
    canUpdateProgress: false,
    canApproveTasks: false,
    canEditCalendar: false,
    canManageMeetings: false,
    canAccessReports: true,
    canManageUsers: false,
  },
};

export const PROJECT_COLORS = [
  '#1A73E8',
  '#188038',
  '#9334E6',
  '#E37400',
  '#007B83',
  '#C5221F',
  '#3F51B5',
  '#0B8043',
  '#795548',
  '#0284C7',
  '#B45309',
  '#6D28D9',
];

export const RACI_COLUMNS = ['MD', 'ED', 'CFO', 'Finance', 'HR', 'IE', 'Operations', 'IT', 'Supply Chain'];

export const DEPARTMENTS = [
  'Corporate Governance',
  'Finance & Accounts',
  'Human Resources',
  'Industrial Engineering (IE)',
  'Supply Chain & Planning',
  'Operations & Production',
  'IT & Digital Transformation',
  'Marketing & Branding',
  'Engineering & Energy',
  'Tax & Legal',
];
