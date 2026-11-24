# Security Specification — Task Master & Turag BSC Task Follow-up Module

## Phase 0 Data Invariants

1. **Identity Isolation**: Every workspace record (`projects`, `tasks`, `meetings`, `raciEntries`, `employees`, `notifications`, `bscKras`, `projectCharters`, `bscTasks`, `bscFollowUps`, `dateChangeRequests`, `reviewMeetings`, `bscGovernanceConfig`) requires `ownerId == request.auth.uid` on create and `resource.data.ownerId == request.auth.uid` on `list`.
2. **Approved Charter Master Gate**: A `bscTask` document can ONLY be created when its parent `projectCharters/{charterId}` exists, belongs to the caller, and has `status in ['Approved', 'Signed-off']`.
3. **Immutable Locked Baselines**: Once a `bscTask` transitions from `Draft` to `Assigned` (`baselineLocked == true`), `baselineStart` and `baselineEnd` can NEVER be overwritten by any update (including Admin overrides).
4. **Append-Only Follow-Up Log**: Documents in `/bscFollowUps/{followUpId}` forbid all updates (`allow update: if false;`) and forbid deletion of any non-demo record (`existing().isDemo == true` only for demo seed toggle-off).
5. **Terminal Task State Protection**: Once a `bscTask` reaches `Completed` or `Cancelled`, non-admin edits are blocked (only Charter revision flagging or Admin override is permitted).
6. **Date-Change Immutability**: Once a `dateChangeRequests/{requestId}` reaches `Approved` or `Rejected`, non-admin callers cannot mutate its decision, and `oldEnd`/`proposedEnd` are immutable after creation.
7. **PII Isolation**: `/users/{userId}` and `/employees/{employeeId}` reject reads from non-owners/non-admins.
8. **Zero DB Lookups in List Queries**: No `allow list` rule executes `get()` or `exists()`.

## Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)

1. Unverified email admin spoof (`email == 'asifalamipe@gmail.com'`, `email_verified: false`).
2. Cross-tenant `ownerId` spoofing on `bscTasks` creation.
3. Creating a `bscTask` linked to an unapproved (`Draft` or `Pending Approval`) `projectCharter`.
4. Overwriting `baselineEnd` on a `bscTask` where `baselineLocked == true`.
5. Editing an existing append-only `bscFollowUps` entry.
6. Deleting a live (`isDemo: false`) `bscFollowUps` entry.
7. Shadow field injection (`isApprovedOverride: true`) on `dateChangeRequests` create/update.
8. Mutating `proposedEnd` during a `dateChangeRequests` approval update.
9. Updating a `Completed` `bscTask` as a non-admin owner.
10. Injecting a 200-character junk document ID into `/bscTasks/{taskId}`.
11. Self-assigning `role: 'Super Admin'` on `/users/{uid}` creation by a non-bootstrapped account.
12. Querying `/bscTasks` without an `ownerId == request.auth.uid` filter.
