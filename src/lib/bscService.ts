import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  BscGovernanceConfig,
  BscKra,
  BscPerspective,
  BscTask,
  BscTaskStatus,
  CalendarSyncLog,
  CharterMilestone,
  CharterStatus,
  DateChangeRequest,
  DEFAULT_BSC_CONFIG,
  FollowUpFrequency,
  FollowUpType,
  ProjectCharter,
  ReviewActionItem,
  ReviewMeeting,
  ReviewMeetingType,
  TaskFollowUp,
} from '../types/bsc';
import {
  computeDayRangeBucket,
  computeNextFollowUpDate,
  generateNextTaskCode,
  isWorkflowTransitionAllowed,
  parseDateSafe,
} from './bscMetrics';
import { buildTuragBscSeed } from '../data/turagBscSeed';
import { Priority, SyncStatus } from '../types';

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) out[k] = v;
  });
  return out;
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

async function createBscNotification(
  ownerId: string,
  payload: {
    type: 'deadline' | 'overdue' | 'assignment' | 'meeting' | 'delay' | 'milestone' | 'approval' | 'raci' | 'escalation' | 'followup';
    title: string;
    message: string;
    relatedEntityId?: string;
    relatedEntityType?: 'project' | 'task' | 'meeting' | 'raci' | 'charter' | 'bscTask' | 'dateChange';
    severity: 'info' | 'warning' | 'critical' | 'success';
  }
): Promise<void> {
  try {
    const id = makeId('notif');
    await setDoc(
      doc(db, 'notifications', id),
      stripUndefined({
        ownerId,
        type: payload.type,
        title: payload.title.slice(0, 155),
        message: payload.message.slice(0, 490),
        relatedEntityId: payload.relatedEntityId,
        relatedEntityType: payload.relatedEntityType,
        severity: payload.severity,
        read: false,
        createdAt: serverTimestamp(),
      })
    );
  } catch (err) {
    // Non-blocking notification audit failure shouldn't break primary transaction
    console.warn('BSC notification creation skipped:', err);
  }
}

// =============================================================================
// Toggleable Seed & Clear (§9 — TG-BSC05)
// =============================================================================

export async function seedTuragBscDemo(ownerId: string): Promise<{
  kras: number;
  charters: number;
  tasks: number;
}> {
  const bundle = buildTuragBscSeed(ownerId);

  try {
    // Batch 1: KRAs, Project Charters, and Turag Governance Ladder Employees
    // Must commit BEFORE bscTasks because firestore.rules checks charterBelongsToCallerAndApproved(charterId)
    const batch1 = writeBatch(db);
    bundle.kras.forEach((kra) => {
      const { id, ...rest } = kra;
      batch1.set(
        doc(db, 'bscKras', id),
        stripUndefined({
          ...rest,
          ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });

    bundle.charters.forEach((ch) => {
      const { id, ...rest } = ch;
      batch1.set(
        doc(db, 'projectCharters', id),
        stripUndefined({
          ...rest,
          ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });

    bundle.governanceTeam.forEach((emp) => {
      const { id, ...rest } = emp;
      batch1.set(
        doc(db, 'employees', id),
        stripUndefined({
          ...rest,
          ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });
    await batch1.commit();

    // Batch 2: BSC Tasks (depends on Approved Charter TG-BSC05)
    const batch2 = writeBatch(db);
    bundle.tasks.forEach((task) => {
      const { id, ...rest } = task;
      batch2.set(
        doc(db, 'bscTasks', id),
        stripUndefined({
          ...rest,
          ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });
    await batch2.commit();

    // Batch 3: Follow-ups, Date-Change Requests, and Review Meetings (depend on bscTasks)
    const batch3 = writeBatch(db);
    bundle.followUps.forEach((fu) => {
      const { id, ...rest } = fu;
      batch3.set(
        doc(db, 'bscFollowUps', id),
        stripUndefined({
          ...rest,
          ownerId,
          createdAt: serverTimestamp(),
        })
      );
    });

    bundle.dateChangeRequests.forEach((dcr) => {
      const { id, ...rest } = dcr;
      batch3.set(
        doc(db, 'dateChangeRequests', id),
        stripUndefined({
          ...rest,
          ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });

    bundle.reviewMeetings.forEach((rm) => {
      const { id, ...rest } = rm;
      batch3.set(
        doc(db, 'reviewMeetings', id),
        stripUndefined({
          ...rest,
          ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });
    await batch3.commit();

    return {
      kras: bundle.kras.length,
      charters: bundle.charters.length,
      tasks: bundle.tasks.length,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'turag_bsc_seed');
  }
}

export async function clearTuragBscDemo(ownerId: string): Promise<void> {
  const bscCollections = [
    'bscFollowUps',
    'dateChangeRequests',
    'reviewMeetings',
    'bscTasks',
    'projectCharters',
    'bscKras',
  ];

  try {
    for (const colName of bscCollections) {
      const snap = await getDocs(
        query(collection(db, colName), where('ownerId', '==', ownerId))
      );
      const batch = writeBatch(db);
      let count = 0;
      snap.forEach((d) => {
        if (d.data().isDemo === true) {
          batch.delete(d.ref);
          count += 1;
        }
      });
      if (count > 0) await batch.commit();
    }

    // Only delete Turag BSC demo employees (tbsc_ prefix), preserving existing Task Master employees
    const empSnap = await getDocs(
      query(collection(db, 'employees'), where('ownerId', '==', ownerId))
    );
    const empBatch = writeBatch(db);
    let empCount = 0;
    empSnap.forEach((d) => {
      if (d.id.startsWith('tbsc_') && d.data().isDemo === true) {
        empBatch.delete(d.ref);
        empCount += 1;
      }
    });
    if (empCount > 0) await empBatch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'turag_bsc_seed');
  }
}

// =============================================================================
// KRAs — Master BSC Indicators & Completion Confirmation
// =============================================================================

export async function createBscKraDoc(
  ownerId: string,
  input: Omit<BscKra, 'id' | 'ownerId' | 'createdAt' | 'updatedAt' | 'isDemo'>
): Promise<string> {
  const id = makeId('kra');
  try {
    await setDoc(
      doc(db, 'bscKras', id),
      stripUndefined({
        ownerId,
        refCode: input.refCode.trim().slice(0, 32),
        perspective: input.perspective,
        soCode: input.soCode.trim().slice(0, 32),
        soTitle: input.soTitle.trim().slice(0, 240),
        title: input.title.trim().slice(0, 240),
        unit: input.unit.trim().slice(0, 40) || '%',
        dataOwner: input.dataOwner.trim().slice(0, 120),
        targetValue: input.targetValue?.trim().slice(0, 80),
        currentValue: input.currentValue?.trim().slice(0, 80),
        completionStatus: Boolean(input.completionStatus),
        confirmedBy: input.confirmedBy?.trim().slice(0, 120),
        confirmedAt: input.confirmedAt,
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `bscKras/${id}`);
  }
}

export async function confirmKraCompletion(
  kraId: string,
  currentValue: string,
  confirmedBy: string,
  completionStatus = true
): Promise<void> {
  try {
    await updateDoc(
      doc(db, 'bscKras', kraId),
      stripUndefined({
        currentValue: currentValue.trim().slice(0, 80),
        completionStatus,
        confirmedBy: confirmedBy.trim().slice(0, 120),
        confirmedAt: new Date().toISOString().slice(0, 19),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `bscKras/${kraId}`);
  }
}

// =============================================================================
// Project Charters (8-Section Standard + Master Gate + Revision Flagging)
// =============================================================================

export async function createProjectCharterDoc(
  ownerId: string,
  input: Omit<ProjectCharter, 'id' | 'ownerId' | 'charterRevision' | 'isDemo' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeId('ch');
  try {
    await setDoc(
      doc(db, 'projectCharters', id),
      stripUndefined({
        ownerId,
        charterCode: input.charterCode.trim().slice(0, 32),
        projectCode: input.projectCode.trim().slice(0, 32),
        projectId: input.projectId,
        title: input.title.trim().slice(0, 200),
        perspective: input.perspective,
        soCode: input.soCode.trim().slice(0, 32),
        kraIds: (input.kraIds || []).slice(0, 20),
        status: input.status,
        businessNeed: (input.businessNeed || '').slice(0, 2000),
        scope: (input.scope || '').slice(0, 2000),
        objectivesGoals: (input.objectivesGoals || '').slice(0, 2000),
        opportunity: (input.opportunity || '').slice(0, 2000),
        deliverables: (input.deliverables || '').slice(0, 2000),
        risksAssumptions: (input.risksAssumptions || '').slice(0, 2000),
        teamSignOff: (input.teamSignOff || '').slice(0, 1000),
        projectLead: input.projectLead.trim().slice(0, 120),
        projectManager: input.projectManager.trim().slice(0, 120),
        projectHead: input.projectHead.trim().slice(0, 120),
        projectSponsor: input.projectSponsor.trim().slice(0, 120),
        startDate: input.startDate,
        targetDate: input.targetDate,
        milestones: (input.milestones || []).slice(0, 25),
        charterRevision: 1,
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `projectCharters/${id}`);
  }
}

export async function updateProjectCharterDoc(
  charter: ProjectCharter,
  updates: Partial<
    Pick<
      ProjectCharter,
      | 'title'
      | 'perspective'
      | 'soCode'
      | 'kraIds'
      | 'status'
      | 'businessNeed'
      | 'scope'
      | 'objectivesGoals'
      | 'opportunity'
      | 'deliverables'
      | 'risksAssumptions'
      | 'teamSignOff'
      | 'projectLead'
      | 'projectManager'
      | 'projectHead'
      | 'projectSponsor'
      | 'startDate'
      | 'targetDate'
      | 'milestones'
      | 'closureNote'
    >
  >,
  linkedTasks: BscTask[],
  actorName: string
): Promise<{ flaggedTaskCount: number }> {
  const isApprovedBefore = charter.status === 'Approved' || charter.status === 'Signed-off';
  const scopeOrMilestonesChanged =
    isApprovedBefore &&
    (updates.scope !== undefined && updates.scope !== charter.scope ||
      updates.deliverables !== undefined && updates.deliverables !== charter.deliverables ||
      updates.milestones !== undefined);

  const nextRevision = scopeOrMilestonesChanged ? (charter.charterRevision || 1) + 1 : charter.charterRevision || 1;

  try {
    await updateDoc(
      doc(db, 'projectCharters', charter.id),
      stripUndefined({
        ...updates,
        charterRevision: nextRevision,
        updatedAt: serverTimestamp(),
      })
    );

    let flaggedTaskCount = 0;
    if (scopeOrMilestonesChanged && linkedTasks.length > 0) {
      const batch = writeBatch(db);
      linkedTasks.forEach((t) => {
        if (t.status !== 'Cancelled') {
          batch.update(doc(db, 'bscTasks', t.id), {
            charterChangedFlag: true,
            updatedBy: actorName.slice(0, 120),
            updatedAt: serverTimestamp(),
          });
          flaggedTaskCount += 1;
        }
      });
      if (flaggedTaskCount > 0) {
        await batch.commit();
        await createBscNotification(charter.ownerId, {
          type: 'milestone',
          title: `Charter ${charter.charterCode} Revised (Rev ${nextRevision})`,
          message: `${flaggedTaskCount} linked task(s) flagged "Charter Changed – Review" after scope/milestone update by ${actorName}.`,
          relatedEntityId: charter.id,
          relatedEntityType: 'charter',
          severity: 'warning',
        });
      }
    }

    return { flaggedTaskCount };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projectCharters/${charter.id}`);
  }
}

export async function approveProjectCharter(
  charter: ProjectCharter,
  newStatus: CharterStatus,
  actorName: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'projectCharters', charter.id), {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
    await createBscNotification(charter.ownerId, {
      type: 'approval',
      title: `Charter ${charter.charterCode} → ${newStatus}`,
      message: `${charter.title} marked ${newStatus} by ${actorName}. Task generation is now unlocked.`,
      relatedEntityId: charter.id,
      relatedEntityType: 'charter',
      severity: 'success',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projectCharters/${charter.id}`);
  }
}

export async function closeCharterMilestone(
  charter: ProjectCharter,
  milestoneId: string,
  charterTasks: BscTask[]
): Promise<void> {
  const msTasks = charterTasks.filter((t) => t.milestoneId === milestoneId);
  const openTasks = msTasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled');
  if (openTasks.length > 0) {
    throw new Error(
      `Cannot close milestone: ${openTasks.length} task(s) are still open (${openTasks.map((t) => t.taskCode).join(', ')}). All tasks must be Completed or Cancelled.`
    );
  }
  const updatedMilestones: CharterMilestone[] = charter.milestones.map((m) =>
    m.id === milestoneId ? { ...m, status: 'Closed' } : m
  );
  try {
    await updateDoc(doc(db, 'projectCharters', charter.id), {
      milestones: updatedMilestones,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projectCharters/${charter.id}`);
  }
}

export async function closeProjectCharter(
  charter: ProjectCharter,
  closureNote: string,
  charterTasks: BscTask[],
  actorName: string
): Promise<void> {
  const openTasks = charterTasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled');
  if (openTasks.length > 0) {
    throw new Error(
      `Cannot close project charter: ${openTasks.length} task(s) are still active. Complete or cancel all tasks first.`
    );
  }
  if (!closureNote.trim()) {
    throw new Error('A Close-to-Deploy handover note is required to close a project charter.');
  }
  try {
    await updateDoc(doc(db, 'projectCharters', charter.id), {
      status: 'Closed',
      closureNote: closureNote.trim().slice(0, 2000),
      updatedAt: serverTimestamp(),
    });
    await createBscNotification(charter.ownerId, {
      type: 'milestone',
      title: `Charter ${charter.charterCode} Closed to Deploy`,
      message: `${charter.title} formally closed by ${actorName}. Handover recorded.`,
      relatedEntityId: charter.id,
      relatedEntityType: 'charter',
      severity: 'success',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projectCharters/${charter.id}`);
  }
}

// =============================================================================
// Generate Tasks from Approved Charter (§2.1 + Acceptance Criterion #1)
// =============================================================================

export async function generateTasksFromCharter(
  ownerId: string,
  charter: ProjectCharter,
  existingTasks: BscTask[],
  actorName: string
): Promise<{ createdCount: number; skippedCount: number }> {
  if (charter.status !== 'Approved' && charter.status !== 'Signed-off') {
    throw new Error(
      `Charter ${charter.charterCode} is currently "${charter.status}". Tasks can only be created or generated after a charter is Approved or Signed-off.`
    );
  }

  const workingTasks = [...existingTasks];
  const batch = writeBatch(db);
  let createdCount = 0;
  let skippedCount = 0;

  for (const ms of charter.milestones || []) {
    for (const act of ms.activities || []) {
      const alreadyExists = workingTasks.some(
        (t) =>
          t.charterId === charter.id &&
          t.milestoneId === ms.id &&
          t.title.trim().toLowerCase() === act.title.trim().toLowerCase()
      );
      if (alreadyExists) {
        skippedCount += 1;
        continue;
      }

      const taskId = makeId('btask');
      const taskCode = generateNextTaskCode(charter.charterCode, ms.milestoneNumber, workingTasks);
      const start = act.plannedStart || ms.plannedStart || charter.startDate;
      const end = act.plannedEnd || ms.plannedEnd || charter.targetDate;
      const bucket = computeDayRangeBucket(end, charter.startDate);
      const nextFu = computeNextFollowUpDate(start, 'Weekly');

      const newTaskObj: Omit<BscTask, 'createdAt' | 'updatedAt'> = {
        id: taskId,
        ownerId,
        taskCode,
        charterId: charter.id,
        charterCode: charter.charterCode,
        milestoneId: ms.id,
        milestoneNumber: ms.milestoneNumber,
        kraIds: charter.kraIds || [],
        phase: act.phase || 'Define',
        title: act.title.trim().slice(0, 220),
        description: (act.description || '').slice(0, 2000),
        deliverableEvidence: (act.deliverableEvidence || 'Verified deliverable evidence attachment').slice(0, 400),
        responsibleName: (act.responsibleName || charter.projectLead).slice(0, 120),
        accountableName: (act.accountableName || charter.projectLead).slice(0, 120),
        consultedIds: [],
        informedIds: [charter.projectHead],
        priority: act.priority || 'Medium',
        baselineStart: start,
        baselineEnd: end,
        baselineLocked: false,
        plannedStart: start,
        plannedEnd: end,
        dayRangeBucket: bucket,
        weight: Math.min(100, Math.max(1, Number(act.weight) || 10)),
        predecessorIds: [],
        status: 'Draft',
        percentComplete: 0,
        followUpFrequency: 'Weekly',
        nextFollowUpDate: nextFu,
        attachments: [],
        createdBy: actorName.slice(0, 120),
        updatedBy: actorName.slice(0, 120),
        isDemo: false,
      };

      const { id, ...docPayload } = newTaskObj;
      batch.set(
        doc(db, 'bscTasks', id),
        stripUndefined({
          ...docPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      workingTasks.push(newTaskObj);
      createdCount += 1;
    }
  }

  if (createdCount > 0) {
    try {
      await batch.commit();
      await createBscNotification(ownerId, {
        type: 'assignment',
        title: `Generated ${createdCount} Draft task(s) from ${charter.charterCode}`,
        message: `${createdCount} milestone activity task(s) generated in Draft state (${skippedCount} already existed). Assign tasks to lock baselines.`,
        relatedEntityId: charter.id,
        relatedEntityType: 'charter',
        severity: 'info',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bscTasks');
    }
  }

  return { createdCount, skippedCount };
}

// =============================================================================
// Individual Governed BSC Task CRUD & Lifecycle (§4)
// =============================================================================

export interface CreateBscTaskInput {
  charter: ProjectCharter;
  projectId?: string;
  milestoneId: string;
  milestoneNumber: number;
  kraIds: string[];
  phase: BscTask['phase'];
  title: string;
  description: string;
  deliverableEvidence: string;
  responsibleId?: string;
  responsibleName: string;
  accountableId?: string;
  accountableName: string;
  consultedIds?: string[];
  informedIds?: string[];
  priority: Priority;
  baselineStart?: string;
  baselineEnd?: string;
  plannedStart: string;
  plannedEnd: string;
  weight: number;
  predecessorIds?: string[];
  followUpFrequency: FollowUpFrequency;
  nextFollowUpDate?: string;
  assignImmediately?: boolean;
  sourceActionItemId?: string;
  parentTaskId?: string;
  department?: string;
  customTaskCode?: string;
}

export async function createBscTaskDoc(
  ownerId: string,
  input: CreateBscTaskInput,
  existingTasks: BscTask[],
  actorName: string
): Promise<{ id: string; taskCode: string }> {
  if (input.charter.status !== 'Approved' && input.charter.status !== 'Signed-off') {
    throw new Error(
      `Charter ${input.charter.charterCode} is "${input.charter.status}". Only Approved or Signed-off charters can accept tasks.`
    );
  }
  if (!input.deliverableEvidence.trim()) {
    throw new Error('Deliverable / Evidence definition is mandatory.');
  }
  if (!input.responsibleName.trim() || !input.accountableName.trim()) {
    throw new Error('Both Responsible (R) and Accountable (A) owners are mandatory.');
  }

  const id = makeId('btask');
  const taskCode = input.customTaskCode?.trim()
    ? input.customTaskCode.trim().slice(0, 48)
    : generateNextTaskCode(
        input.charter.charterCode,
        input.milestoneNumber,
        existingTasks
      );
  const bucket = computeDayRangeBucket(input.plannedEnd, input.charter.startDate);
  const nextFollowUpDate =
    input.nextFollowUpDate?.trim() ||
    computeNextFollowUpDate(format(new Date(), 'yyyy-MM-dd'), input.followUpFrequency);

  const lockNow = Boolean(input.assignImmediately);

  try {
    await setDoc(
      doc(db, 'bscTasks', id),
      stripUndefined({
        ownerId,
        taskCode,
        projectId: input.projectId || input.charter.projectId,
        charterId: input.charter.id,
        charterCode: input.charter.charterCode,
        milestoneId: input.milestoneId,
        milestoneNumber: input.milestoneNumber,
        kraIds: (input.kraIds || []).slice(0, 15),
        phase: input.phase,
        title: input.title.trim().slice(0, 220),
        description: (input.description || '').slice(0, 2000),
        deliverableEvidence: input.deliverableEvidence.trim().slice(0, 400),
        responsibleId: input.responsibleId?.trim().slice(0, 128),
        responsibleName: input.responsibleName.trim().slice(0, 120),
        accountableId: input.accountableId?.trim().slice(0, 128),
        accountableName: input.accountableName.trim().slice(0, 120),
        consultedIds: (input.consultedIds || []).slice(0, 10),
        informedIds: (input.informedIds || []).slice(0, 10),
        priority: input.priority,
        baselineStart: input.baselineStart || input.plannedStart,
        baselineEnd: input.baselineEnd || input.plannedEnd,
        baselineLocked: lockNow,
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
        dayRangeBucket: bucket,
        weight: Math.min(100, Math.max(1, Number(input.weight) || 10)),
        predecessorIds: (input.predecessorIds || []).slice(0, 10),
        status: lockNow ? 'Assigned' : 'Draft',
        percentComplete: 0,
        followUpFrequency: input.followUpFrequency,
        nextFollowUpDate,
        assignedAt: lockNow ? new Date().toISOString().slice(0, 19) : undefined,
        attachments: [],
        sourceActionItemId: input.sourceActionItemId,
        parentTaskId: input.parentTaskId?.trim().slice(0, 128),
        department: input.department?.trim().slice(0, 100),
        syncStatus: 'not_synced',
        createdBy: actorName.slice(0, 120),
        updatedBy: actorName.slice(0, 120),
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    if (lockNow) {
      await createBscNotification(ownerId, {
        type: 'assignment',
        title: `Assigned ${taskCode} to ${input.responsibleName}`,
        message: `Baseline dates locked (${input.baselineStart || input.plannedStart} → ${input.baselineEnd || input.plannedEnd}). Owner must accept within 2 working days.`,
        relatedEntityId: id,
        relatedEntityType: 'bscTask',
        severity: 'info',
      });
    }

    return { id, taskCode };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `bscTasks/${id}`);
  }
}

/**
 * Assigns a Draft task -> locks baselineStart & baselineEnd permanently (§4.2).
 */
export async function assignBscTask(
  task: BscTask,
  charter: ProjectCharter | undefined,
  actorName: string,
  todayStr: string
): Promise<void> {
  if (task.status !== 'Draft') {
    throw new Error('Only Draft tasks can be assigned to lock baseline dates.');
  }
  if (!task.responsibleName.trim() || !task.accountableName.trim()) {
    throw new Error('Assign requires both Responsible (R) and Accountable (A).');
  }
  if (!task.plannedStart || !task.plannedEnd) {
    throw new Error('Assign requires valid Planned Start and Planned End dates.');
  }
  if (!task.deliverableEvidence.trim()) {
    throw new Error('Assign requires a defined Deliverable / Evidence requirement.');
  }

  const nextFu = computeNextFollowUpDate(todayStr, task.followUpFrequency);
  const bucket = charter
    ? computeDayRangeBucket(task.plannedEnd, charter.startDate)
    : task.dayRangeBucket;

  try {
    await updateDoc(doc(db, 'bscTasks', task.id), {
      status: 'Assigned',
      baselineStart: task.plannedStart,
      baselineEnd: task.plannedEnd,
      baselineLocked: true,
      plannedStart: task.plannedStart,
      plannedEnd: task.plannedEnd,
      dayRangeBucket: bucket,
      assignedAt: `${todayStr}T09:00:00`,
      nextFollowUpDate: nextFu,
      updatedBy: actorName.slice(0, 120),
      updatedAt: serverTimestamp(),
    });

    await appendFollowUpEntry(task.ownerId, {
      taskId: task.id,
      taskCode: task.taskCode,
      charterId: task.charterId,
      date: todayStr,
      updatedBy: actorName,
      progressNote: `Task assigned to ${task.responsibleName} (A: ${task.accountableName}). Baseline locked (${task.plannedStart} → ${task.plannedEnd}).`,
      percentBefore: task.percentComplete,
      percentAfter: task.percentComplete,
      statusBefore: 'Draft',
      statusAfter: 'Assigned',
      nextAction: 'Owner (R) to accept or raise query within 2 working days.',
      nextFollowUpDate: nextFu,
      attachments: [],
      type: 'PM Follow-up',
      onTime: true,
    });

    await createBscNotification(task.ownerId, {
      type: 'assignment',
      title: `Task Assigned: ${task.taskCode}`,
      message: `${task.title} assigned to ${task.responsibleName}. Baseline locked permanently.`,
      relatedEntityId: task.id,
      relatedEntityType: 'bscTask',
      severity: 'info',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `bscTasks/${task.id}`);
  }
}

export interface TransitionTaskOptions {
  targetStatus: BscTaskStatus;
  actorName: string;
  todayStr: string;
  reasonOrComment?: string;
  percentComplete?: number;
  newAttachments?: string[];
  allTasks?: BscTask[];
  adminOverridePredecessors?: boolean;
}

/**
 * Governed State Machine Transition (§4.1 & §4.2) with automated append-only FollowUp log.
 */
export async function transitionBscTaskStatus(
  task: BscTask,
  opts: TransitionTaskOptions
): Promise<void> {
  const { targetStatus, actorName, todayStr } = opts;

  if (!isWorkflowTransitionAllowed(task.status, targetStatus)) {
    throw new Error(
      `Illegal workflow transition: "${task.status}" → "${targetStatus}" is not permitted under BSC Task Governance.`
    );
  }

  const mergedAttachments = Array.from(
    new Set([...(task.attachments || []), ...(opts.newAttachments || [])])
  ).slice(0, 15);

  // Dependency check when moving to In Progress
  if (targetStatus === 'In Progress' && (task.predecessorIds || []).length > 0 && opts.allTasks) {
    const incompletePreds = task.predecessorIds
      .map((pid) => opts.allTasks!.find((t) => t.id === pid))
      .filter((p): p is BscTask => p !== undefined && p.status !== 'Completed');

    if (incompletePreds.length > 0 && !opts.adminOverridePredecessors) {
      throw new Error(
        `Predecessor task(s) not yet Completed: ${incompletePreds.map((p) => p.taskCode).join(', ')}. Complete predecessors first or use Admin Override with reason.`
      );
    }
    if (incompletePreds.length > 0 && opts.adminOverridePredecessors && !opts.reasonOrComment?.trim()) {
      throw new Error('Admin predecessor override requires a logged reason.');
    }
  }

  // Mandatory evidence before Submitted for Review or Completed
  if (targetStatus === 'Submitted for Review' && mergedAttachments.length === 0) {
    throw new Error(
      `Evidence required: attach at least 1 deliverable file/reference ("${task.deliverableEvidence}") before submitting for review.`
    );
  }
  if (targetStatus === 'Completed') {
    if (task.status !== 'Submitted for Review') {
      throw new Error('A task must be Submitted for Review before Accountable (A) can approve it to Completed.');
    }
    if (mergedAttachments.length === 0) {
      throw new Error('Cannot complete task without attached deliverable evidence.');
    }
  }

  // Mandatory comment/reason for Returned, Query Raised, On Hold, Blocked, Cancelled
  const reasonRequiredStates: BscTaskStatus[] = [
    'Returned',
    'Query Raised',
    'On Hold',
    'Blocked',
    'Cancelled',
  ];
  if (reasonRequiredStates.includes(targetStatus) && !opts.reasonOrComment?.trim()) {
    throw new Error(`A reason/comment is required when moving a task to "${targetStatus}".`);
  }

  const nextPercent =
    targetStatus === 'Completed' || targetStatus === 'Submitted for Review'
      ? 100
      : opts.percentComplete !== undefined
        ? Math.min(100, Math.max(0, Math.round(opts.percentComplete / 10) * 10))
        : task.percentComplete;

  const updatePayload: Record<string, unknown> = {
    status: targetStatus,
    percentComplete: nextPercent,
    attachments: mergedAttachments,
    updatedBy: actorName.slice(0, 120),
    updatedAt: serverTimestamp(),
  };

  if (targetStatus === 'In Progress' && !task.actualStart) {
    updatePayload.actualStart = todayStr;
  }
  if (targetStatus === 'Submitted for Review') {
    updatePayload.submittedAt = `${todayStr}T12:00:00`;
  }
  if (targetStatus === 'Completed') {
    updatePayload.actualEnd = todayStr;
    updatePayload.approvedAt = `${todayStr}T16:00:00`;
  }
  if (targetStatus === 'Blocked') {
    updatePayload.blockedSince = todayStr;
  }
  if (opts.reasonOrComment?.trim()) {
    updatePayload.statusReason = opts.reasonOrComment.trim().slice(0, 1000);
  }

  const nextFu = computeNextFollowUpDate(todayStr, task.followUpFrequency);
  if (targetStatus !== 'Completed' && targetStatus !== 'Cancelled') {
    updatePayload.nextFollowUpDate = nextFu;
  }

  const refDate = parseDateSafe(todayStr);
  const dueFu = parseDateSafe(task.nextFollowUpDate);
  const onTime = refDate && dueFu ? refDate <= dueFu : true;

  try {
    await updateDoc(doc(db, 'bscTasks', task.id), stripUndefined(updatePayload));

    const fuType: FollowUpType =
      targetStatus === 'Completed' || targetStatus === 'Returned'
        ? 'Review Comment'
        : targetStatus === 'Blocked'
          ? 'Escalation'
          : 'Owner Update';

    await appendFollowUpEntry(task.ownerId, {
      taskId: task.id,
      taskCode: task.taskCode,
      charterId: task.charterId,
      date: todayStr,
      updatedBy: actorName,
      progressNote:
        opts.reasonOrComment?.trim() ||
        `Status transitioned from ${task.status} to ${targetStatus} (${nextPercent}%).`,
      percentBefore: task.percentComplete,
      percentAfter: nextPercent,
      statusBefore: task.status,
      statusAfter: targetStatus,
      issuesBlockers:
        targetStatus === 'Blocked' || targetStatus === 'On Hold' || targetStatus === 'Query Raised'
          ? opts.reasonOrComment?.trim()
          : undefined,
      nextAction:
        targetStatus === 'Submitted for Review'
          ? `Awaiting approval by ${task.accountableName} (A).`
          : targetStatus === 'Returned'
            ? `Rework requested by ${actorName}.`
            : targetStatus === 'Completed'
              ? 'Task closed and verified.'
              : 'Continue execution per plan.',
      nextFollowUpDate: targetStatus === 'Completed' || targetStatus === 'Cancelled' ? undefined : nextFu,
      attachments: opts.newAttachments || [],
      type: fuType,
      onTime,
    });

    if (targetStatus === 'Submitted for Review' || targetStatus === 'Completed' || targetStatus === 'Returned' || targetStatus === 'Blocked') {
      await createBscNotification(task.ownerId, {
        type: targetStatus === 'Blocked' ? 'escalation' : 'approval',
        title: `${task.taskCode} → ${targetStatus}`,
        message:
          opts.reasonOrComment?.trim() ||
          `${task.title} moved to ${targetStatus} by ${actorName}.`,
        relatedEntityId: task.id,
        relatedEntityType: 'bscTask',
        severity:
          targetStatus === 'Completed'
            ? 'success'
            : targetStatus === 'Blocked' || targetStatus === 'Returned'
              ? 'warning'
              : 'info',
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `bscTasks/${task.id}`);
  }
}

export async function clearCharterChangedFlag(taskId: string, actorName: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'bscTasks', taskId), {
      charterChangedFlag: false,
      updatedBy: actorName.slice(0, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `bscTasks/${taskId}`);
  }
}

export async function addTaskAttachment(
  task: BscTask,
  attachmentName: string,
  actorName: string
): Promise<void> {
  const clean = attachmentName.trim();
  if (!clean) return;
  const next = Array.from(new Set([...(task.attachments || []), clean])).slice(0, 15);
  try {
    await updateDoc(doc(db, 'bscTasks', task.id), {
      attachments: next,
      updatedBy: actorName.slice(0, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `bscTasks/${task.id}`);
  }
}

/**
 * Admin-only direct plannedEnd override with mandatory audit reason.
 * Locked baselineEnd is NEVER touched.
 */
export async function adminOverrideTaskDate(
  task: BscTask,
  charter: ProjectCharter | undefined,
  newPlannedEnd: string,
  reason: string,
  actorName: string,
  todayStr: string
): Promise<void> {
  return adminOverrideTaskDates(
    task,
    charter,
    task.plannedStart,
    newPlannedEnd,
    reason,
    actorName,
    todayStr
  );
}

/**
 * Admin-only direct plannedStart/plannedEnd override (used by Calendar & Gantt drag-and-drop).
 * Locked baselineStart & baselineEnd are NEVER mutated.
 */
export async function adminOverrideTaskDates(
  task: BscTask,
  charter: ProjectCharter | undefined,
  newPlannedStart: string,
  newPlannedEnd: string,
  reason: string,
  actorName: string,
  todayStr: string
): Promise<void> {
  if (!reason.trim()) {
    throw new Error('Admin schedule override requires a mandatory audit reason.');
  }
  if (!newPlannedStart || !newPlannedEnd) {
    throw new Error('Please provide valid revised start and end dates.');
  }
  const bucket = charter
    ? computeDayRangeBucket(newPlannedEnd, charter.startDate)
    : task.dayRangeBucket;

  try {
    await updateDoc(doc(db, 'bscTasks', task.id), {
      plannedStart: newPlannedStart,
      plannedEnd: newPlannedEnd,
      dayRangeBucket: bucket,
      statusReason: `Admin Schedule Override (${task.plannedStart}→${task.plannedEnd} ⇒ ${newPlannedStart}→${newPlannedEnd}): ${reason.trim()}`.slice(0, 1000),
      updatedBy: actorName.slice(0, 120),
      updatedAt: serverTimestamp(),
    });

    await appendFollowUpEntry(task.ownerId, {
      taskId: task.id,
      taskCode: task.taskCode,
      charterId: task.charterId,
      date: todayStr,
      updatedBy: `${actorName} (Admin Override)`,
      progressNote: `Admin shifted Planned Schedule from ${task.plannedStart} → ${task.plannedEnd} to ${newPlannedStart} → ${newPlannedEnd} (Locked Baseline ${task.baselineStart} → ${task.baselineEnd} unchanged). Reason: ${reason.trim()}`,
      percentBefore: task.percentComplete,
      percentAfter: task.percentComplete,
      statusBefore: task.status,
      statusAfter: task.status,
      nextAction: 'Track execution against Admin-revised planned schedule.',
      nextFollowUpDate: task.nextFollowUpDate,
      attachments: [],
      type: 'PM Follow-up',
      onTime: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `bscTasks/${task.id}`);
  }
}

/**
 * Non-locked Draft task direct schedule update (Calendar/Gantt drag before baseline lock).
 */
export async function updateDraftBscTaskDates(
  task: BscTask,
  charter: ProjectCharter | undefined,
  newStart: string,
  newEnd: string,
  actorName: string
): Promise<void> {
  if (task.baselineLocked) {
    throw new Error('Task baseline is locked. Use Date-Change Request or Admin Override.');
  }
  const bucket = charter ? computeDayRangeBucket(newEnd, charter.startDate) : task.dayRangeBucket;
  try {
    await updateDoc(doc(db, 'bscTasks', task.id), {
      plannedStart: newStart,
      plannedEnd: newEnd,
      dayRangeBucket: bucket,
      updatedBy: actorName.slice(0, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `bscTasks/${task.id}`);
  }
}

// =============================================================================
// Google Calendar Sync Metadata & Append-Only Sync Logs (§12.1)
// =============================================================================

export async function updateBscTaskSyncMeta(
  taskId: string,
  meta: { googleEventId?: string; syncStatus: SyncStatus; lastSyncedAt: string }
): Promise<void> {
  try {
    await updateDoc(
      doc(db, 'bscTasks', taskId),
      stripUndefined({
        googleEventId: meta.googleEventId ?? '',
        syncStatus: meta.syncStatus,
        lastSyncedAt: meta.lastSyncedAt,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `bscTasks/${taskId}`);
  }
}

export async function updateReviewMeetingSyncMeta(
  meetingId: string,
  meta: { googleEventId?: string; syncStatus: SyncStatus; lastSyncedAt: string }
): Promise<void> {
  try {
    await updateDoc(
      doc(db, 'reviewMeetings', meetingId),
      stripUndefined({
        googleEventId: meta.googleEventId ?? '',
        syncStatus: meta.syncStatus,
        lastSyncedAt: meta.lastSyncedAt,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reviewMeetings/${meetingId}`);
  }
}

export async function createCalendarSyncLogDoc(
  ownerId: string,
  payload: Omit<CalendarSyncLog, 'id' | 'ownerId' | 'createdAt' | 'syncedAt'> & { syncedAt?: string }
): Promise<string> {
  const id = makeId('csync');
  try {
    await setDoc(
      doc(db, 'calendarSyncLogs', id),
      stripUndefined({
        ownerId,
        entityType: payload.entityType,
        entityId: payload.entityId.slice(0, 128),
        entityCode: payload.entityCode.slice(0, 48),
        googleEventId: payload.googleEventId?.slice(0, 200),
        action: payload.action,
        status: payload.status,
        message: payload.message.slice(0, 500),
        actorName: payload.actorName.slice(0, 120),
        syncedAt: payload.syncedAt || new Date().toISOString().slice(0, 19),
        createdAt: serverTimestamp(),
      })
    );
    return id;
  } catch (err) {
    console.warn('Calendar sync log write failed:', err);
    return id;
  }
}

// =============================================================================
// Strictly Append-Only Follow-Up Log (§3.2)
// =============================================================================

async function appendFollowUpEntry(
  ownerId: string,
  input: Omit<TaskFollowUp, 'id' | 'ownerId' | 'isDemo' | 'createdAt'>
): Promise<string> {
  const id = makeId('fu');
  await setDoc(
    doc(db, 'bscFollowUps', id),
    stripUndefined({
      ownerId,
      taskId: input.taskId,
      taskCode: input.taskCode.slice(0, 48),
      charterId: input.charterId,
      date: input.date,
      updatedBy: input.updatedBy.trim().slice(0, 120),
      progressNote: input.progressNote.trim().slice(0, 2000),
      percentBefore: input.percentBefore,
      percentAfter: input.percentAfter,
      statusBefore: input.statusBefore.slice(0, 40),
      statusAfter: input.statusAfter.slice(0, 40),
      issuesBlockers: input.issuesBlockers?.trim().slice(0, 1000),
      supportNeededFrom: input.supportNeededFrom?.trim().slice(0, 200),
      nextAction: input.nextAction?.trim().slice(0, 600),
      nextFollowUpDate: input.nextFollowUpDate,
      attachments: (input.attachments || []).slice(0, 10),
      type: input.type,
      onTime: Boolean(input.onTime),
      isDemo: false,
      createdAt: serverTimestamp(),
    })
  );
  return id;
}

export interface LogTaskFollowUpInput {
  progressNote: string;
  percentAfter: number;
  issuesBlockers?: string;
  supportNeededFrom?: string;
  nextAction?: string;
  nextFollowUpDate?: string;
  newAttachments?: string[];
  type: FollowUpType;
  actorName: string;
  todayStr: string;
}

export async function logTaskFollowUp(
  task: BscTask,
  input: LogTaskFollowUpInput
): Promise<string> {
  if (!input.progressNote.trim()) {
    throw new Error('Progress note is required when logging a follow-up.');
  }

  const roundedPct = Math.min(100, Math.max(0, Math.round(input.percentAfter / 10) * 10));
  const nextFu =
    input.nextFollowUpDate ||
    computeNextFollowUpDate(input.todayStr, task.followUpFrequency);

  const refDate = parseDateSafe(input.todayStr);
  const scheduledFu = parseDateSafe(task.nextFollowUpDate);
  const onTime = refDate && scheduledFu ? refDate <= scheduledFu : true;

  const mergedAttachments = Array.from(
    new Set([...(task.attachments || []), ...(input.newAttachments || [])])
  ).slice(0, 15);

  try {
    // 1. Append immutable follow-up record
    const fuId = await appendFollowUpEntry(task.ownerId, {
      taskId: task.id,
      taskCode: task.taskCode,
      charterId: task.charterId,
      date: input.todayStr,
      updatedBy: input.actorName,
      progressNote: input.progressNote,
      percentBefore: task.percentComplete,
      percentAfter: roundedPct,
      statusBefore: task.status,
      statusAfter: task.status,
      issuesBlockers: input.issuesBlockers,
      supportNeededFrom: input.supportNeededFrom,
      nextAction: input.nextAction,
      nextFollowUpDate: nextFu,
      attachments: input.newAttachments || [],
      type: input.type,
      onTime,
    });

    // 2. Update live task progress & next follow-up date (if not terminal)
    if (task.status !== 'Completed' && task.status !== 'Cancelled') {
      const nextStatus: BscTaskStatus =
        task.status === 'Accepted' && roundedPct > 0 ? 'In Progress' : task.status;
      await updateDoc(
        doc(db, 'bscTasks', task.id),
        stripUndefined({
          status: nextStatus,
          percentComplete: roundedPct,
          actualStart: !task.actualStart && roundedPct > 0 ? input.todayStr : undefined,
          nextFollowUpDate: nextFu,
          attachments: mergedAttachments,
          updatedBy: input.actorName.slice(0, 120),
          updatedAt: serverTimestamp(),
        })
      );
    }

    return fuId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `bscFollowUps`);
  }
}

// =============================================================================
// Governed Date-Change Requests (§3.3 + §4.2 Two-Stage Approval)
// =============================================================================

export async function submitDateChangeRequest(
  task: BscTask,
  charter: ProjectCharter | undefined,
  proposedEnd: string,
  reason: string,
  requestedBy: string
): Promise<string> {
  if (!proposedEnd) throw new Error('Proposed End Date is required.');
  if (proposedEnd === task.plannedEnd) {
    throw new Error('Proposed End Date must differ from the current Planned End Date.');
  }
  if (!reason.trim()) throw new Error('A clear justification reason is required for any date-change request.');

  const ms = charter?.milestones.find((m) => m.id === task.milestoneId);
  const impactOnMilestone = ms ? proposedEnd > ms.plannedEnd : false;
  const id = makeId('dcr');

  try {
    await setDoc(
      doc(db, 'dateChangeRequests', id),
      stripUndefined({
        ownerId: task.ownerId,
        taskId: task.id,
        taskCode: task.taskCode,
        charterId: task.charterId,
        milestoneId: task.milestoneId,
        oldEnd: task.plannedEnd,
        proposedEnd,
        reason: reason.trim().slice(0, 1000),
        impactOnMilestone,
        requestedBy: requestedBy.trim().slice(0, 120),
        approverA: task.accountableName.slice(0, 120),
        approverEd: impactOnMilestone ? (charter?.projectHead || 'Executive Director').slice(0, 120) : undefined,
        decisionA: 'Pending',
        decisionEd: impactOnMilestone ? 'Pending' : 'Not Required',
        decision: 'Pending',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await createBscNotification(task.ownerId, {
      type: 'approval',
      title: `Date-Change Request: ${task.taskCode}`,
      message: `${requestedBy} requested moving due date ${task.plannedEnd} → ${proposedEnd}${impactOnMilestone ? ' (IMPACTS MILESTONE — requires A & Project Head ED approval)' : ' (requires A approval)'}.`,
      relatedEntityId: id,
      relatedEntityType: 'dateChange',
      severity: impactOnMilestone ? 'warning' : 'info',
    });

    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `dateChangeRequests/${id}`);
  }
}

export async function decideDateChangeRequest(
  req: DateChangeRequest,
  task: BscTask | undefined,
  charter: ProjectCharter | undefined,
  stage: 'A' | 'ED',
  outcome: 'Approved' | 'Rejected',
  comment: string,
  actorName: string,
  todayStr: string
): Promise<{ fullyApproved: boolean }> {
  let nextA = req.decisionA;
  let nextEd = req.decisionEd;

  if (stage === 'A') {
    nextA = outcome;
  } else {
    nextEd = outcome;
  }

  let overall: 'Pending' | 'Approved' | 'Rejected' = 'Pending';
  if (nextA === 'Rejected' || nextEd === 'Rejected') {
    overall = 'Rejected';
  } else if (nextA === 'Approved' && (nextEd === 'Not Required' || nextEd === 'Approved')) {
    overall = 'Approved';
  }

  try {
    await updateDoc(
      doc(db, 'dateChangeRequests', req.id),
      stripUndefined({
        decisionA: nextA,
        decisionEd: nextEd,
        decision: overall,
        decisionDate: overall !== 'Pending' ? todayStr : undefined,
        comment: comment.trim()
          ? `${req.comment ? `${req.comment} | ` : ''}[${stage} – ${actorName}]: ${comment.trim()}`.slice(0, 1000)
          : req.comment,
        updatedAt: serverTimestamp(),
      })
    );

    if (overall === 'Approved' && task) {
      const bucket = charter
        ? computeDayRangeBucket(req.proposedEnd, charter.startDate)
        : task.dayRangeBucket;
      await updateDoc(doc(db, 'bscTasks', task.id), {
        plannedEnd: req.proposedEnd,
        dayRangeBucket: bucket,
        updatedBy: actorName.slice(0, 120),
        updatedAt: serverTimestamp(),
      });

      await appendFollowUpEntry(req.ownerId, {
        taskId: task.id,
        taskCode: task.taskCode,
        charterId: task.charterId,
        date: todayStr,
        updatedBy: actorName,
        progressNote: `Approved Date-Change Request: Planned End revised ${req.oldEnd} → ${req.proposedEnd} (Baseline ${task.baselineEnd} remains locked). ${comment.trim()}`,
        percentBefore: task.percentComplete,
        percentAfter: task.percentComplete,
        statusBefore: task.status,
        statusAfter: task.status,
        nextAction: 'Execute against approved revised due date.',
        nextFollowUpDate: task.nextFollowUpDate,
        attachments: [],
        type: 'Review Comment',
        onTime: true,
      });

      await createBscNotification(req.ownerId, {
        type: 'approval',
        title: `Date Change Approved: ${req.taskCode}`,
        message: `Planned end updated ${req.oldEnd} → ${req.proposedEnd}. Baseline remains locked at ${task.baselineEnd}.`,
        relatedEntityId: task.id,
        relatedEntityType: 'bscTask',
        severity: 'success',
      });
    } else if (overall === 'Rejected' && task) {
      await appendFollowUpEntry(req.ownerId, {
        taskId: task.id,
        taskCode: task.taskCode,
        charterId: task.charterId,
        date: todayStr,
        updatedBy: actorName,
        progressNote: `Rejected Date-Change Request (${req.oldEnd} → ${req.proposedEnd}) at stage ${stage}. Reason: ${comment.trim() || 'No comment provided.'}`,
        percentBefore: task.percentComplete,
        percentAfter: task.percentComplete,
        statusBefore: task.status,
        statusAfter: task.status,
        nextAction: `Maintain original planned end ${req.oldEnd}.`,
        nextFollowUpDate: task.nextFollowUpDate,
        attachments: [],
        type: 'Review Comment',
        onTime: true,
      });
    }

    return { fullyApproved: overall === 'Approved' };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `dateChangeRequests/${req.id}`);
  }
}

// =============================================================================
// Review Meetings & Auto-Converting Action Items into Tasks (§3.4 & Criterion #8)
// =============================================================================

export interface CreateReviewMeetingInput {
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
  actionItems: {
    kraId?: string;
    charterId: string;
    issue: string;
    action: string;
    owner: string;
    dueDate: string;
  }[];
}

export async function createReviewMeetingWithTasks(
  ownerId: string,
  input: CreateReviewMeetingInput,
  charters: ProjectCharter[],
  existingTasks: BscTask[],
  actorName: string
): Promise<{ meetingId: string; tasksCreated: number }> {
  const meetingId = makeId('rm');
  const workingTasks = [...existingTasks];
  const convertedItems: ReviewActionItem[] = [];
  let tasksCreated = 0;

  try {
    for (let idx = 0; idx < input.actionItems.length; idx += 1) {
      const raw = input.actionItems[idx];
      const charter = charters.find((c) => c.id === raw.charterId);
      const itemId = `ai_${Date.now()}_${idx}`;

      if (charter && (charter.status === 'Approved' || charter.status === 'Signed-off')) {
        const firstOpenMs =
          charter.milestones.find((m) => m.status === 'Open') || charter.milestones[0];
        const msId = firstOpenMs?.id || 'ms-review';
        const msNum = firstOpenMs?.milestoneNumber || 1;

        const created = await createBscTaskDoc(
          ownerId,
          {
            charter,
            milestoneId: msId,
            milestoneNumber: msNum,
            kraIds: raw.kraId ? [raw.kraId] : charter.kraIds,
            phase: 'Review',
            title: raw.action.trim(),
            description: `Generated from ${input.type} ("${input.title}", ${input.date}). Issue: ${raw.issue}`,
            deliverableEvidence: `Review Action Completion Evidence (${input.type})`,
            responsibleName: raw.owner.trim() || charter.projectLead,
            accountableName: charter.projectLead,
            priority: 'High',
            plannedStart: input.date,
            plannedEnd: raw.dueDate || input.date,
            weight: 10,
            followUpFrequency: 'Weekly',
            assignImmediately: true,
            sourceActionItemId: itemId,
          },
          workingTasks,
          actorName
        );

        workingTasks.push({
          id: created.id,
          taskCode: created.taskCode,
        } as BscTask);

        convertedItems.push({
          id: itemId,
          kraId: raw.kraId,
          charterId: charter.id,
          charterCode: charter.charterCode,
          issue: raw.issue.trim(),
          action: raw.action.trim(),
          owner: raw.owner.trim() || charter.projectLead,
          dueDate: raw.dueDate || input.date,
          status: 'Converted',
          convertedTaskId: created.id,
          convertedTaskCode: created.taskCode,
        });
        tasksCreated += 1;
      } else {
        convertedItems.push({
          id: itemId,
          kraId: raw.kraId,
          charterId: raw.charterId || '',
          charterCode: charter?.charterCode || 'UNASSIGNED',
          issue: raw.issue.trim(),
          action: raw.action.trim(),
          owner: raw.owner.trim(),
          dueDate: raw.dueDate || input.date,
          status: 'Open',
        });
      }
    }

    const generatedCode =
      input.meetingCode?.trim().slice(0, 32) ||
      `MTG-BSC-${String(Date.now()).slice(-4)}`;

    await setDoc(
      doc(db, 'reviewMeetings', meetingId),
      stripUndefined({
        ownerId,
        meetingCode: generatedCode,
        projectId: input.projectId?.trim().slice(0, 128),
        charterId: input.charterId?.trim().slice(0, 128),
        perspective: input.perspective,
        type: input.type,
        title: input.title.trim().slice(0, 200),
        date: input.date,
        startTime: input.startTime || '10:00',
        endTime: input.endTime || '11:30',
        venue: (input.venue || 'Executive Boardroom').trim().slice(0, 300),
        chairperson: (input.chairperson || actorName).trim().slice(0, 120),
        attendees: input.attendees.slice(0, 30),
        agenda: input.agenda?.trim().slice(0, 2000),
        minutes: input.minutes.slice(0, 4000),
        decisions: input.decisions.slice(0, 2000),
        actionItems: convertedItems.slice(0, 40),
        syncStatus: 'not_synced',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    if (tasksCreated > 0) {
      await createBscNotification(ownerId, {
        type: 'meeting',
        title: `${input.type} Recorded (${tasksCreated} Action Tasks)`,
        message: `"${input.title}" saved and auto-converted ${tasksCreated} action item(s) into governed BSC tasks.`,
        relatedEntityId: meetingId,
        relatedEntityType: 'meeting',
        severity: 'success',
      });
    }

    return { meetingId, tasksCreated };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reviewMeetings/${meetingId}`);
  }
}

export async function updateReviewMeetingDoc(
  meetingId: string,
  updates: Partial<
    Pick<
      ReviewMeeting,
      | 'meetingCode'
      | 'projectId'
      | 'charterId'
      | 'perspective'
      | 'type'
      | 'title'
      | 'date'
      | 'startTime'
      | 'endTime'
      | 'venue'
      | 'chairperson'
      | 'attendees'
      | 'agenda'
      | 'minutes'
      | 'decisions'
      | 'actionItems'
    >
  >
): Promise<void> {
  try {
    await updateDoc(
      doc(db, 'reviewMeetings', meetingId),
      stripUndefined({
        ...updates,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reviewMeetings/${meetingId}`);
  }
}

export async function convertReviewActionItemToBscTask(
  ownerId: string,
  meeting: ReviewMeeting,
  actionItemId: string,
  targetCharter: ProjectCharter,
  existingTasks: BscTask[],
  actorName: string
): Promise<{ taskId: string; taskCode: string }> {
  if (targetCharter.status !== 'Approved' && targetCharter.status !== 'Signed-off') {
    throw new Error(
      `Charter ${targetCharter.charterCode} is "${targetCharter.status}". Only Approved or Signed-off charters can accept action-item tasks.`
    );
  }
  const item = meeting.actionItems.find((a) => a.id === actionItemId);
  if (!item) throw new Error('Action item not found.');
  if (item.status === 'Converted' && item.convertedTaskId) {
    throw new Error(`Action item already converted to ${item.convertedTaskCode}.`);
  }

  const firstOpenMs =
    targetCharter.milestones.find((m) => m.status === 'Open') || targetCharter.milestones[0];
  const msId = firstOpenMs?.id || 'ms-review';
  const msNum = firstOpenMs?.milestoneNumber || 1;

  const created = await createBscTaskDoc(
    ownerId,
    {
      charter: targetCharter,
      milestoneId: msId,
      milestoneNumber: msNum,
      kraIds: item.kraId ? [item.kraId] : targetCharter.kraIds,
      phase: 'Review',
      title: item.action.trim(),
      description: `Converted from ${meeting.type} ("${meeting.title}", ${meeting.date}). Issue: ${item.issue}`,
      deliverableEvidence: `Review Action Completion Evidence (${meeting.type})`,
      responsibleName: item.owner.trim() || targetCharter.projectLead,
      accountableName: targetCharter.projectLead,
      priority: 'High',
      plannedStart: meeting.date,
      plannedEnd: item.dueDate || meeting.date,
      weight: 10,
      followUpFrequency: 'Weekly',
      assignImmediately: true,
      sourceActionItemId: item.id,
    },
    existingTasks,
    actorName
  );

  const nextItems: ReviewActionItem[] = meeting.actionItems.map((a) =>
    a.id === actionItemId
      ? {
          ...a,
          charterId: targetCharter.id,
          charterCode: targetCharter.charterCode,
          status: 'Converted',
          convertedTaskId: created.id,
          convertedTaskCode: created.taskCode,
        }
      : a
  );

  await updateReviewMeetingDoc(meeting.id, { actionItems: nextItems });
  return { taskId: created.id, taskCode: created.taskCode };
}

export async function deleteReviewMeetingDoc(meetingId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'reviewMeetings', meetingId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `reviewMeetings/${meetingId}`);
  }
}

// =============================================================================
// Governance & Escalation Threshold Config (§6 Admin Configuration)
// =============================================================================

export async function saveBscGovernanceConfig(
  ownerId: string,
  config: Omit<BscGovernanceConfig, 'id' | 'ownerId' | 'updatedAt'>
): Promise<void> {
  const ref = doc(db, 'bscGovernanceConfig', ownerId);
  const payload = {
    reminderDaysBeforeDue: Math.min(30, Math.max(1, Number(config.reminderDaysBeforeDue) || DEFAULT_BSC_CONFIG.reminderDaysBeforeDue)),
    escalationL1Days: Math.min(30, Math.max(1, Number(config.escalationL1Days) || DEFAULT_BSC_CONFIG.escalationL1Days)),
    escalationL2Days: Math.min(60, Math.max(1, Number(config.escalationL2Days) || DEFAULT_BSC_CONFIG.escalationL2Days)),
    escalationL3Days: Math.min(90, Math.max(1, Number(config.escalationL3Days) || DEFAULT_BSC_CONFIG.escalationL3Days)),
    escalationL4Days: Math.min(180, Math.max(1, Number(config.escalationL4Days) || DEFAULT_BSC_CONFIG.escalationL4Days)),
    blockedEscalationDays: Math.min(30, Math.max(1, Number(config.blockedEscalationDays) || DEFAULT_BSC_CONFIG.blockedEscalationDays)),
    followUpComplianceTarget: Math.min(100, Math.max(50, Number(config.followUpComplianceTarget) || DEFAULT_BSC_CONFIG.followUpComplianceTarget)),
    dailyDigestTime: config.dailyDigestTime || '09:00',
    dailyDigestTimezone: config.dailyDigestTimezone || 'Asia/Dhaka',
    channels: {
      inApp: Boolean(config.channels.inApp),
      email: Boolean(config.channels.email),
      whatsapp: Boolean(config.channels.whatsapp),
      sms: Boolean(config.channels.sms),
    },
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, {
        ownerId,
        ...payload,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `bscGovernanceConfig/${ownerId}`);
  }
}
