/**
 * Phase 0 TDD Specification: Dirty Dozen Adversarial Security Test Suite
 * Verifies every invariant in security_spec.md against firestore.rules.
 */
export interface DirtyDozenCase {
  id: string;
  title: string;
  path: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
  reason: string;
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 'DD-01',
    title: 'Unverified Admin Email Spoof',
    path: '/users/victimUid',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    reason: 'email_verified == false must reject bootstrapped admin privilege',
  },
  {
    id: 'DD-02',
    title: 'Cross-Tenant OwnerId Spoofing on BSC Task',
    path: '/bscTasks/task_spoof',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'other_user_uid', charterId: 'charter_1', taskCode: 'TG-BSC05-M01-T001' },
    reason: 'incoming().ownerId must strictly equal request.auth.uid',
  },
  {
    id: 'DD-03',
    title: 'Task Creation Under Unapproved Draft Charter',
    path: '/bscTasks/task_draft_charter',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { charterId: 'charter_draft_01', status: 'Draft' },
    reason: 'charterBelongsToCallerAndApproved requires parent charter status in Approved/Signed-off',
  },
  {
    id: 'DD-04',
    title: 'Baseline Date Tampering After Lock',
    path: '/bscTasks/task_locked',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { baselineEnd: '2027-12-31', baselineLocked: false },
    reason: 'Immutable baseline invariant blocks any mutation once baselineLocked == true',
  },
  {
    id: 'DD-05',
    title: 'Editing Append-Only FollowUp Entry',
    path: '/bscFollowUps/fu_001',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { progressNote: 'Rewritten history' },
    reason: 'bscFollowUps strictly enforces allow update: if false',
  },
  {
    id: 'DD-06',
    title: 'Deleting Live FollowUp Audit Record',
    path: '/bscFollowUps/fu_live_001',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
    reason: 'Live follow-up logs (isDemo == false) cannot be deleted',
  },
  {
    id: 'DD-07',
    title: 'Shadow Field Injection on DateChangeRequest',
    path: '/dateChangeRequests/dcr_001',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { isApprovedOverride: true },
    reason: 'Strict keys().hasOnly() rejects undeclared ghost fields',
  },
  {
    id: 'DD-08',
    title: 'Proposed Date Mutation During Approval',
    path: '/dateChangeRequests/dcr_001',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { proposedEnd: '2028-01-01', decision: 'Approved' },
    reason: 'oldEnd and proposedEnd are immutable after creation',
  },
  {
    id: 'DD-09',
    title: 'State Shortcutting Directly to Completed Without Evidence',
    path: '/bscTasks/task_active',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'Completed', percentComplete: 100, attachments: [] },
    reason: 'Requires existing().status == Submitted for Review and attachments.size() >= 1',
  },
  {
    id: 'DD-10',
    title: 'Oversized Document ID Poisoning',
    path: `/bscTasks/${'x'.repeat(200)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'isValidId enforces length <= 128 and strict alphanumeric/underscore/hyphen regex',
  },
  {
    id: 'DD-11',
    title: 'Self-Assigned Super Admin Role on Signup',
    path: '/users/attacker_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { role: 'Super Admin' },
    reason: 'Non-bootstrapped users can only self-register as Team Member',
  },
  {
    id: 'DD-12',
    title: 'Unfiltered Collection Scraping List Query',
    path: '/bscTasks',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    reason: 'allow list requires resource.data.ownerId == request.auth.uid',
  },
];
