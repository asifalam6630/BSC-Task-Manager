import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  AppNotification,
  Employee,
  Meeting,
  Project,
  RaciEntry,
  Task,
  TaskActivity,
  UserProfile,
} from '../types';
import { buildDemoBundle } from '../data/demoSeed';

const clampStr = (val: string | undefined | null, max: number, fallback = ''): string => {
  const s = (val ?? fallback).toString().trim();
  return s.length > max ? s.slice(0, max) : s;
};

export const makeSafeId = (prefix: string): string => {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
};

// ============================================================================
// User Profile
// ============================================================================
export async function ensureUserProfile(
  uid: string,
  email: string,
  displayName: string,
  photoURL?: string
): Promise<UserProfile> {
  const ref = doc(db, 'users', uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const isBootstrappedAdmin = email.toLowerCase() === 'asifalamipe@gmail.com';
    const profilePayload: Record<string, unknown> = {
      uid,
      email: clampStr(email, 200, 'user@example.com'),
      displayName: clampStr(displayName, 120, email.split('@')[0] || 'Executive User'),
      role: isBootstrappedAdmin ? 'Super Admin' : 'Team Member',
      department: 'Corporate Governance',
      designation: isBootstrappedAdmin ? 'Strategic PMO Administrator' : 'Project Contributor',
      theme: 'light',
      reminderDays: [7, 3, 1, 0],
      emailAlerts: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (photoURL) {
      profilePayload.photoURL = clampStr(photoURL, 500);
    }
    await setDoc(ref, profilePayload);
    return {
      uid,
      email: profilePayload.email as string,
      displayName: profilePayload.displayName as string,
      photoURL: photoURL ? clampStr(photoURL, 500) : undefined,
      role: profilePayload.role as UserProfile['role'],
      department: profilePayload.department as string,
      designation: profilePayload.designation as string,
      theme: 'light',
      reminderDays: [7, 3, 1, 0],
      emailAlerts: true,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<
    Pick<
      UserProfile,
      'displayName' | 'department' | 'designation' | 'theme' | 'reminderDays' | 'emailAlerts' | 'role'
    >
  >
): Promise<void> {
  const ref = doc(db, 'users', uid);
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.displayName !== undefined) payload.displayName = clampStr(updates.displayName, 120, 'User');
    if (updates.department !== undefined) payload.department = clampStr(updates.department, 100, 'General');
    if (updates.designation !== undefined) payload.designation = clampStr(updates.designation, 100, 'Member');
    if (updates.theme !== undefined) payload.theme = updates.theme;
    if (updates.reminderDays !== undefined) payload.reminderDays = updates.reminderDays.slice(0, 4);
    if (updates.emailAlerts !== undefined) payload.emailAlerts = Boolean(updates.emailAlerts);
    if (updates.role !== undefined) payload.role = updates.role;
    await updateDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

// ============================================================================
// Projects
// ============================================================================
export async function createProjectDoc(
  ownerId: string,
  input: Omit<Project, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeSafeId('proj');
  const ref = doc(db, 'projects', id);
  const payload: Record<string, unknown> = {
    ownerId,
    projectCode: clampStr(input.projectCode, 32, 'P00'),
    name: clampStr(input.name, 180, 'Untitled Project'),
    category: clampStr(input.category, 100, 'Strategic Initiative'),
    strategicObjective: clampStr(input.strategicObjective, 400, ''),
    description: clampStr(input.description, 2000, ''),
    projectOwner: clampStr(input.projectOwner, 120, 'Unassigned'),
    projectChampion: clampStr(input.projectChampion, 120, ''),
    department: clampStr(input.department, 100, 'Corporate Governance'),
    startDate: clampStr(input.startDate, 20, '2026-11-22'),
    targetDate: clampStr(input.targetDate, 20, '2026-12-31'),
    priority: input.priority,
    status: input.status,
    color: clampStr(input.color, 20, '#1A73E8'),
    milestones: (input.milestones || []).slice(0, 25),
    documents: (input.documents || []).slice(0, 25),
    isDemo: Boolean(input.isDemo),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.budget !== undefined && !Number.isNaN(Number(input.budget))) {
    payload.budget = Math.max(0, Number(input.budget));
  }
  try {
    await setDoc(ref, payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `projects/${id}`);
  }
}

export async function updateProjectDoc(
  projectId: string,
  updates: Partial<Omit<Project, 'id' | 'ownerId' | 'isDemo' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'projects', projectId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.projectCode !== undefined) payload.projectCode = clampStr(updates.projectCode, 32, 'P00');
  if (updates.name !== undefined) payload.name = clampStr(updates.name, 180, 'Untitled');
  if (updates.category !== undefined) payload.category = clampStr(updates.category, 100, 'General');
  if (updates.strategicObjective !== undefined) payload.strategicObjective = clampStr(updates.strategicObjective, 400, '');
  if (updates.description !== undefined) payload.description = clampStr(updates.description, 2000, '');
  if (updates.projectOwner !== undefined) payload.projectOwner = clampStr(updates.projectOwner, 120, 'Unassigned');
  if (updates.projectChampion !== undefined) payload.projectChampion = clampStr(updates.projectChampion, 120, '');
  if (updates.department !== undefined) payload.department = clampStr(updates.department, 100, 'General');
  if (updates.startDate !== undefined) payload.startDate = clampStr(updates.startDate, 20, '2026-11-22');
  if (updates.targetDate !== undefined) payload.targetDate = clampStr(updates.targetDate, 20, '2026-12-31');
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.budget !== undefined) payload.budget = Math.max(0, Number(updates.budget) || 0);
  if (updates.color !== undefined) payload.color = clampStr(updates.color, 20, '#1A73E8');
  if (updates.milestones !== undefined) payload.milestones = updates.milestones.slice(0, 25);
  if (updates.documents !== undefined) payload.documents = updates.documents.slice(0, 25);

  try {
    await updateDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}`);
  }
}

export async function deleteProjectCascade(ownerId: string, projectId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'projects', projectId));

    const [tSnap, mSnap, rSnap] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('ownerId', '==', ownerId), where('projectId', '==', projectId))),
      getDocs(query(collection(db, 'meetings'), where('ownerId', '==', ownerId), where('projectId', '==', projectId))),
      getDocs(query(collection(db, 'raciEntries'), where('ownerId', '==', ownerId), where('projectId', '==', projectId))),
    ]);

    tSnap.forEach((d) => batch.delete(d.ref));
    mSnap.forEach((d) => batch.delete(d.ref));
    rSnap.forEach((d) => batch.delete(d.ref));

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}`);
  }
}

// ============================================================================
// Tasks & Activity Subcollection
// ============================================================================
export async function createTaskDoc(
  ownerId: string,
  input: Omit<Task, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeSafeId('task');
  const ref = doc(db, 'tasks', id);
  const payload: Record<string, unknown> = {
    ownerId,
    taskCode: clampStr(input.taskCode, 32, 'T000'),
    projectId: input.projectId,
    projectCode: clampStr(input.projectCode, 32, 'P00'),
    name: clampStr(input.name, 200, 'Untitled Task'),
    description: clampStr(input.description, 2000, ''),
    responsible: clampStr(input.responsible, 120, 'Unassigned'),
    accountable: clampStr(input.accountable, 120, ''),
    consulted: (input.consulted || []).map((s) => clampStr(s, 80)).filter(Boolean).slice(0, 10),
    informed: (input.informed || []).map((s) => clampStr(s, 80)).filter(Boolean).slice(0, 10),
    department: clampStr(input.department, 100, 'General'),
    plannedStart: clampStr(input.plannedStart, 20, '2026-11-22'),
    plannedEnd: clampStr(input.plannedEnd, 20, '2026-12-01'),
    estimatedDays: Math.min(3650, Math.max(0, Number(input.estimatedDays) || 1)),
    weight: Math.min(100, Math.max(1, Number(input.weight) || 10)),
    priority: input.priority,
    status: input.status,
    progress: Math.min(100, Math.max(0, Number(input.progress) || 0)),
    dependencies: (input.dependencies || []).slice(0, 10),
    remarks: clampStr(input.remarks, 1000, ''),
    attachments: (input.attachments || []).slice(0, 10),
    syncStatus: input.syncStatus || 'not_synced',
    isDemo: Boolean(input.isDemo),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.parentTaskId) payload.parentTaskId = clampStr(input.parentTaskId, 128);
  if (input.actualStart) payload.actualStart = clampStr(input.actualStart, 20);
  if (input.actualEnd) payload.actualEnd = clampStr(input.actualEnd, 20);
  if (input.googleEventId) payload.googleEventId = clampStr(input.googleEventId, 200);
  if (input.lastSyncedAt) payload.lastSyncedAt = clampStr(input.lastSyncedAt, 40);

  try {
    await setDoc(ref, payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `tasks/${id}`);
  }
}

export async function updateTaskDoc(
  taskId: string,
  updates: Partial<Omit<Task, 'id' | 'ownerId' | 'projectId' | 'isDemo' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'tasks', taskId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.taskCode !== undefined) payload.taskCode = clampStr(updates.taskCode, 32, 'T000');
  if (updates.projectCode !== undefined) payload.projectCode = clampStr(updates.projectCode, 32, 'P00');
  if (updates.parentTaskId !== undefined) payload.parentTaskId = clampStr(updates.parentTaskId, 128);
  if (updates.name !== undefined) payload.name = clampStr(updates.name, 200, 'Untitled Task');
  if (updates.description !== undefined) payload.description = clampStr(updates.description, 2000, '');
  if (updates.responsible !== undefined) payload.responsible = clampStr(updates.responsible, 120, 'Unassigned');
  if (updates.accountable !== undefined) payload.accountable = clampStr(updates.accountable, 120, '');
  if (updates.consulted !== undefined) payload.consulted = updates.consulted.slice(0, 10);
  if (updates.informed !== undefined) payload.informed = updates.informed.slice(0, 10);
  if (updates.department !== undefined) payload.department = clampStr(updates.department, 100, 'General');
  if (updates.plannedStart !== undefined) payload.plannedStart = clampStr(updates.plannedStart, 20);
  if (updates.plannedEnd !== undefined) payload.plannedEnd = clampStr(updates.plannedEnd, 20);
  if (updates.actualStart !== undefined) payload.actualStart = clampStr(updates.actualStart, 20);
  if (updates.actualEnd !== undefined) payload.actualEnd = clampStr(updates.actualEnd, 20);
  if (updates.estimatedDays !== undefined) payload.estimatedDays = Math.min(3650, Math.max(0, Number(updates.estimatedDays) || 0));
  if (updates.weight !== undefined) payload.weight = Math.min(100, Math.max(1, Number(updates.weight) || 1));
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.progress !== undefined) payload.progress = Math.min(100, Math.max(0, Number(updates.progress) || 0));
  if (updates.dependencies !== undefined) payload.dependencies = updates.dependencies.slice(0, 10);
  if (updates.remarks !== undefined) payload.remarks = clampStr(updates.remarks, 1000, '');
  if (updates.attachments !== undefined) payload.attachments = updates.attachments.slice(0, 10);
  if (updates.googleEventId !== undefined) payload.googleEventId = clampStr(updates.googleEventId, 200);
  if (updates.syncStatus !== undefined) payload.syncStatus = updates.syncStatus;
  if (updates.lastSyncedAt !== undefined) payload.lastSyncedAt = clampStr(updates.lastSyncedAt, 40);

  try {
    await updateDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tasks/${taskId}`);
  }
}

export async function deleteTaskDoc(taskId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'tasks', taskId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `tasks/${taskId}`);
  }
}

export async function addTaskActivityDoc(
  ownerId: string,
  taskId: string,
  authorName: string,
  type: TaskActivity['type'],
  message: string
): Promise<void> {
  const actId = makeSafeId('act');
  const ref = doc(db, 'tasks', taskId, 'activity', actId);
  try {
    await setDoc(ref, {
      ownerId,
      authorName: clampStr(authorName, 120, 'User'),
      type,
      message: clampStr(message, 1000, 'Updated task'),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `tasks/${taskId}/activity/${actId}`);
  }
}

// ============================================================================
// Meetings
// ============================================================================
export async function createMeetingDoc(
  ownerId: string,
  input: Omit<Meeting, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeSafeId('mtg');
  const ref = doc(db, 'meetings', id);
  const payload: Record<string, unknown> = {
    ownerId,
    meetingCode: clampStr(input.meetingCode, 32, 'M-01'),
    title: clampStr(input.title, 200, 'Untitled Meeting'),
    projectId: input.projectId,
    projectCode: clampStr(input.projectCode, 32, 'P00'),
    category: input.category,
    date: clampStr(input.date, 20, '2026-11-25'),
    startTime: clampStr(input.startTime, 10, '10:00'),
    endTime: clampStr(input.endTime, 10, '11:00'),
    venue: clampStr(input.venue, 300, 'Boardroom'),
    chairperson: clampStr(input.chairperson, 120, 'Chairperson'),
    participants: (input.participants || []).slice(0, 25),
    agenda: clampStr(input.agenda, 2000, ''),
    minutes: clampStr(input.minutes, 4000, ''),
    actionPoints: (input.actionPoints || []).slice(0, 30),
    syncStatus: input.syncStatus || 'not_synced',
    isDemo: Boolean(input.isDemo),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.googleEventId) payload.googleEventId = clampStr(input.googleEventId, 200);
  if (input.lastSyncedAt) payload.lastSyncedAt = clampStr(input.lastSyncedAt, 40);

  try {
    await setDoc(ref, payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `meetings/${id}`);
  }
}

export async function updateMeetingDoc(
  meetingId: string,
  updates: Partial<Omit<Meeting, 'id' | 'ownerId' | 'projectId' | 'isDemo' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'meetings', meetingId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.meetingCode !== undefined) payload.meetingCode = clampStr(updates.meetingCode, 32, 'M-01');
  if (updates.title !== undefined) payload.title = clampStr(updates.title, 200, 'Meeting');
  if (updates.projectCode !== undefined) payload.projectCode = clampStr(updates.projectCode, 32, 'P00');
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.date !== undefined) payload.date = clampStr(updates.date, 20);
  if (updates.startTime !== undefined) payload.startTime = clampStr(updates.startTime, 10);
  if (updates.endTime !== undefined) payload.endTime = clampStr(updates.endTime, 10);
  if (updates.venue !== undefined) payload.venue = clampStr(updates.venue, 300, '');
  if (updates.chairperson !== undefined) payload.chairperson = clampStr(updates.chairperson, 120, 'Chair');
  if (updates.participants !== undefined) payload.participants = updates.participants.slice(0, 25);
  if (updates.agenda !== undefined) payload.agenda = clampStr(updates.agenda, 2000, '');
  if (updates.minutes !== undefined) payload.minutes = clampStr(updates.minutes, 4000, '');
  if (updates.actionPoints !== undefined) payload.actionPoints = updates.actionPoints.slice(0, 30);
  if (updates.googleEventId !== undefined) payload.googleEventId = clampStr(updates.googleEventId, 200);
  if (updates.syncStatus !== undefined) payload.syncStatus = updates.syncStatus;
  if (updates.lastSyncedAt !== undefined) payload.lastSyncedAt = clampStr(updates.lastSyncedAt, 40);

  try {
    await updateDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `meetings/${meetingId}`);
  }
}

export async function deleteMeetingDoc(meetingId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'meetings', meetingId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `meetings/${meetingId}`);
  }
}

// ============================================================================
// RACI Entries
// ============================================================================
export async function createRaciEntryDoc(
  ownerId: string,
  input: Omit<RaciEntry, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeSafeId('raci');
  const ref = doc(db, 'raciEntries', id);
  try {
    await setDoc(ref, {
      ownerId,
      projectId: input.projectId,
      projectCode: clampStr(input.projectCode, 32, 'P00'),
      activity: clampStr(input.activity, 200, 'Activity'),
      department: clampStr(input.department, 100, 'General'),
      roles: input.roles || {},
      isDemo: Boolean(input.isDemo),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `raciEntries/${id}`);
  }
}

export async function updateRaciEntryDoc(
  entryId: string,
  updates: Partial<Pick<RaciEntry, 'activity' | 'department' | 'roles' | 'projectCode'>>
): Promise<void> {
  const ref = doc(db, 'raciEntries', entryId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.activity !== undefined) payload.activity = clampStr(updates.activity, 200, 'Activity');
  if (updates.department !== undefined) payload.department = clampStr(updates.department, 100, 'General');
  if (updates.projectCode !== undefined) payload.projectCode = clampStr(updates.projectCode, 32, 'P00');
  if (updates.roles !== undefined) payload.roles = updates.roles;
  try {
    await updateDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `raciEntries/${entryId}`);
  }
}

export async function deleteRaciEntryDoc(entryId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'raciEntries', entryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `raciEntries/${entryId}`);
  }
}

// ============================================================================
// Employees
// ============================================================================
export async function createEmployeeDoc(
  ownerId: string,
  input: Omit<Employee, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeSafeId('emp');
  const ref = doc(db, 'employees', id);
  try {
    await setDoc(ref, {
      ownerId,
      employeeCode: clampStr(input.employeeCode, 32, 'EMP-000'),
      name: clampStr(input.name, 120, 'Employee'),
      designation: clampStr(input.designation, 120, 'Specialist'),
      department: clampStr(input.department, 100, 'General'),
      email: clampStr(input.email, 200, 'employee@company.com'),
      reportingManager: clampStr(input.reportingManager, 120, ''),
      systemRole: input.systemRole,
      isDemo: Boolean(input.isDemo),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `employees/${id}`);
  }
}

export async function updateEmployeeDoc(
  employeeId: string,
  updates: Partial<Omit<Employee, 'id' | 'ownerId' | 'isDemo' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'employees', employeeId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.employeeCode !== undefined) payload.employeeCode = clampStr(updates.employeeCode, 32);
  if (updates.name !== undefined) payload.name = clampStr(updates.name, 120);
  if (updates.designation !== undefined) payload.designation = clampStr(updates.designation, 120);
  if (updates.department !== undefined) payload.department = clampStr(updates.department, 100);
  if (updates.email !== undefined) payload.email = clampStr(updates.email, 200);
  if (updates.reportingManager !== undefined) payload.reportingManager = clampStr(updates.reportingManager, 120);
  if (updates.systemRole !== undefined) payload.systemRole = updates.systemRole;
  try {
    await updateDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `employees/${employeeId}`);
  }
}

export async function deleteEmployeeDoc(employeeId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'employees', employeeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `employees/${employeeId}`);
  }
}

// ============================================================================
// Notifications
// ============================================================================
export async function createNotificationDoc(
  ownerId: string,
  input: Omit<AppNotification, 'id' | 'ownerId' | 'createdAt'>
): Promise<string> {
  const id = makeSafeId('notif');
  const ref = doc(db, 'notifications', id);
  const payload: Record<string, unknown> = {
    ownerId,
    type: input.type,
    title: clampStr(input.title, 160, 'Alert'),
    message: clampStr(input.message, 500, ''),
    severity: input.severity,
    read: Boolean(input.read),
    createdAt: serverTimestamp(),
  };
  if (input.relatedEntityId) payload.relatedEntityId = clampStr(input.relatedEntityId, 128);
  if (input.relatedEntityType) payload.relatedEntityType = input.relatedEntityType;

  try {
    await setDoc(ref, payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${id}`);
  }
}

export async function markNotificationRead(notificationId: string, read = true): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function deleteNotificationDoc(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

// ============================================================================
// Demo Dataset Seeding & Clearing (Atomic Firestore Batches)
// ============================================================================
export async function seedDemoDataset(ownerId: string): Promise<void> {
  const bundle = buildDemoBundle(ownerId);
  try {
    // Batch 1: Projects + Employees + Notifications
    const batch1 = writeBatch(db);
    bundle.projects.forEach((p) => {
      const { id, ...rest } = p;
      batch1.set(doc(db, 'projects', id), {
        ...rest,
        ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    bundle.employees.forEach((e) => {
      const { id, ...rest } = e;
      batch1.set(doc(db, 'employees', id), {
        ...rest,
        ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    bundle.notifications.forEach((n) => {
      const { id, ...rest } = n;
      batch1.set(doc(db, 'notifications', id), {
        ...rest,
        ownerId,
        createdAt: serverTimestamp(),
      });
    });
    await batch1.commit();

    // Batch 2: Tasks + Meetings + RACI Entries (projects already committed!)
    const batch2 = writeBatch(db);
    bundle.tasks.forEach((t) => {
      const { id, ...rest } = t;
      batch2.set(doc(db, 'tasks', id), {
        ...rest,
        ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    bundle.meetings.forEach((m) => {
      const { id, ...rest } = m;
      batch2.set(doc(db, 'meetings', id), {
        ...rest,
        ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    bundle.raciEntries.forEach((r) => {
      const { id, ...rest } = r;
      batch2.set(doc(db, 'raciEntries', id), {
        ...rest,
        ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch2.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'demo_seed_batch');
  }
}

export async function clearDemoDataset(ownerId: string): Promise<void> {
  try {
    const collections = ['tasks', 'meetings', 'raciEntries', 'projects', 'employees'];
    const batch = writeBatch(db);
    for (const col of collections) {
      const snap = await getDocs(
        query(collection(db, col), where('ownerId', '==', ownerId), where('isDemo', '==', true))
      );
      snap.forEach((d) => batch.delete(d.ref));
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'clear_demo_dataset');
  }
}
