import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  GitBranch,
  History,
  Lock,
  Paperclip,
  RotateCcw,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BscTaskStatus, FollowUpType } from '../../types/bsc';
import {
  computeEscalation,
  computeExpectedPercent,
  computeNextFollowUpDate,
  computeScheduleGap,
  computeSlippageDays,
  computeTaskRag,
  getBscDaysOverdue,
  getRagBadgeClasses,
  isFollowUpMissed,
  parseDateSafe,
} from '../../lib/bscMetrics';
import {
  addTaskAttachment,
  adminOverrideTaskDate,
  assignBscTask,
  clearCharterChangedFlag,
  decideDateChangeRequest,
  logTaskFollowUp,
  submitDateChangeRequest,
  transitionBscTaskStatus,
} from '../../lib/bscService';

export const BscTaskDetailDrawer: React.FC = () => {
  const {
    profile,
    user,
    bscKras,
    projectCharters,
    bscTasks,
    bscFollowUps,
    dateChangeRequests,
    bscConfig,
    bscSimulatedDate,
    bscActingRole,
    bscCapabilities,
    activeBscTaskId,
    setActiveBscTaskId,
    notify,
  } = useApp();

  const task = useMemo(
    () => bscTasks.find((t) => t.id === activeBscTaskId) || null,
    [bscTasks, activeBscTaskId]
  );

  const charter = useMemo(
    () => (task ? projectCharters.find((c) => c.id === task.charterId) : undefined),
    [projectCharters, task]
  );

  const milestone = useMemo(
    () => charter?.milestones.find((m) => m.id === task?.milestoneId),
    [charter, task]
  );

  const taskFollowUps = useMemo(
    () => bscFollowUps.filter((f) => f.taskId === activeBscTaskId),
    [bscFollowUps, activeBscTaskId]
  );

  const taskDateChanges = useMemo(
    () => dateChangeRequests.filter((d) => d.taskId === activeBscTaskId),
    [dateChangeRequests, activeBscTaskId]
  );

  const actorName = profile?.displayName || user?.displayName || 'BSC User';
  const refDate = parseDateSafe(bscSimulatedDate) || new Date();

  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'followups' | 'datechanges'>('overview');

  // Attachment input
  const [attachmentInput, setAttachmentInput] = useState('');

  // Workflow action modal / inline panel
  const [pendingAction, setPendingAction] = useState<{
    target: BscTaskStatus;
    label: string;
    needsReason: boolean;
    needsEvidence?: boolean;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [overridePredecessors, setOverridePredecessors] = useState(false);

  // Inline Follow-Up form
  const [fuNote, setFuNote] = useState('');
  const [fuPercent, setFuPercent] = useState<number>(0);
  const [fuBlockers, setFuBlockers] = useState('');
  const [fuSupport, setFuSupport] = useState('');
  const [fuNextAction, setFuNextAction] = useState('');
  const [fuNextDate, setFuNextDate] = useState('');
  const [fuType, setFuType] = useState<FollowUpType>('Owner Update');
  const [fuAttachment, setFuAttachment] = useState('');

  // Date-change request form
  const [dcrProposedEnd, setDcrProposedEnd] = useState('');
  const [dcrReason, setDcrReason] = useState('');

  // Admin direct date override form
  const [showAdminDateEdit, setShowAdminDateEdit] = useState(false);
  const [adminNewEnd, setAdminNewEnd] = useState('');
  const [adminOverrideReason, setAdminOverrideReason] = useState('');

  if (!task) return null;

  const rag = computeTaskRag(task, bscTasks, refDate);
  const esc = computeEscalation(task, charter, bscTasks, bscConfig, refDate);
  const daysOverdue = getBscDaysOverdue(task, refDate);
  const slippage = computeSlippageDays(task);
  const expectedPct = computeExpectedPercent(task, refDate);
  const scheduleGap = computeScheduleGap(task, refDate);
  const fuMissed = isFollowUpMissed(task, refDate);

  const linkedKras = bscKras.filter((k) => (task.kraIds || []).includes(k.id));
  const predecessors = (task.predecessorIds || [])
    .map((pid) => bscTasks.find((t) => t.id === pid))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const incompletePredecessors = predecessors.filter((p) => p.status !== 'Completed');

  const dcrImpactsMilestone = Boolean(
    milestone && dcrProposedEnd && dcrProposedEnd > milestone.plannedEnd
  );

  const handleAssign = async () => {
    setBusy(true);
    try {
      await assignBscTask(task, charter, actorName, bscSimulatedDate);
      notify('success', `Assigned ${task.taskCode}`, 'Baseline dates are now permanently locked.');
    } catch (err) {
      notify('error', 'Cannot assign task', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleTransitionConfirm = async () => {
    if (!pendingAction) return;
    setBusy(true);
    try {
      await transitionBscTaskStatus(task, {
        targetStatus: pendingAction.target,
        actorName,
        todayStr: bscSimulatedDate,
        reasonOrComment: actionReason,
        allTasks: bscTasks,
        adminOverridePredecessors: overridePredecessors && bscCapabilities.canOverrideDates,
      });
      notify('success', `${task.taskCode} → ${pendingAction.target}`);
      setPendingAction(null);
      setActionReason('');
      setOverridePredecessors(false);
    } catch (err) {
      notify('error', 'Transition blocked', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickTransition = async (target: BscTaskStatus) => {
    setBusy(true);
    try {
      await transitionBscTaskStatus(task, {
        targetStatus: target,
        actorName,
        todayStr: bscSimulatedDate,
        allTasks: bscTasks,
      });
      notify('success', `${task.taskCode} → ${target}`);
    } catch (err) {
      notify('error', 'Transition blocked', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleAddAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachmentInput.trim()) return;
    setBusy(true);
    try {
      await addTaskAttachment(task, attachmentInput, actorName);
      setAttachmentInput('');
      notify('success', 'Deliverable evidence attached');
    } catch (err) {
      notify('error', 'Attachment failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleLogFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await logTaskFollowUp(task, {
        progressNote: fuNote,
        percentAfter: fuPercent,
        issuesBlockers: fuBlockers,
        supportNeededFrom: fuSupport,
        nextAction: fuNextAction,
        nextFollowUpDate:
          fuNextDate || computeNextFollowUpDate(bscSimulatedDate, task.followUpFrequency),
        newAttachments: fuAttachment.trim() ? [fuAttachment.trim()] : [],
        type: fuType,
        actorName,
        todayStr: bscSimulatedDate,
      });
      setFuNote('');
      setFuBlockers('');
      setFuSupport('');
      setFuNextAction('');
      setFuNextDate('');
      setFuAttachment('');
      notify('success', 'Follow-up logged (append-only)', 'Task progress & follow-up compliance updated.');
    } catch (err) {
      notify('error', 'Follow-up failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitDateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await submitDateChangeRequest(task, charter, dcrProposedEnd, dcrReason, actorName);
      setDcrProposedEnd('');
      setDcrReason('');
      notify(
        'success',
        'Date-change request submitted',
        dcrImpactsMilestone
          ? 'Requires approval from Accountable (A) AND Project Head (ED).'
          : 'Requires approval from Accountable (A).'
      );
    } catch (err) {
      notify('error', 'Date-change request failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleDecideDcr = async (
    reqId: string,
    stage: 'A' | 'ED',
    outcome: 'Approved' | 'Rejected'
  ) => {
    const req = taskDateChanges.find((d) => d.id === reqId);
    if (!req) return;
    setBusy(true);
    try {
      const res = await decideDateChangeRequest(
        req,
        task,
        charter,
        stage,
        outcome,
        `${outcome} via Task Detail Drawer (${bscActingRole})`,
        actorName,
        bscSimulatedDate
      );
      notify(
        outcome === 'Approved' ? 'success' : 'info',
        `Stage ${stage}: ${outcome}`,
        res.fullyApproved
          ? `Planned End revised to ${req.proposedEnd} (Baseline ${task.baselineEnd} remains locked).`
          : undefined
      );
    } catch (err) {
      notify('error', 'Decision failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleAdminDateOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminOverrideTaskDate(
        task,
        charter,
        adminNewEnd,
        adminOverrideReason,
        actorName,
        bscSimulatedDate
      );
      setShowAdminDateEdit(false);
      setAdminNewEnd('');
      setAdminOverrideReason('');
      notify('success', 'Admin date override logged', 'Locked baseline preserved in audit trail.');
    } catch (err) {
      notify('error', 'Override failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const isTerminal = task.status === 'Completed' || task.status === 'Cancelled';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[1px]">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 h-full flex flex-col border-l border-slate-200 dark:border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-bold text-[#1A73E8] dark:text-blue-400">
                {task.taskCode}
              </span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {task.charterCode} · M{String(task.milestoneNumber).padStart(2, '0')}
              </span>
              <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${getRagBadgeClasses(rag)}`}>
                RAG: {rag}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                {task.status}
              </span>
              {esc.level > 0 && (
                <span className="px-2 py-0.5 rounded bg-[#D93025]/12 text-[#D93025] dark:bg-red-500/20 dark:text-red-400 font-mono font-bold text-[11px]">
                  ESC L{esc.level}
                </span>
              )}
            </div>
            <h2 className="text-base font-display font-bold text-[#172B4D] dark:text-white mt-1.5 leading-snug">
              {task.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setActiveBscTaskId(null)}
            aria-label="Close task detail"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts strip */}
        {(task.charterChangedFlag || fuMissed || daysOverdue > 0) && (
          <div className="px-5 py-2.5 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200/70 dark:border-amber-900/50 space-y-1.5 text-xs">
            {task.charterChangedFlag && (
              <div className="flex items-center justify-between gap-2 text-amber-800 dark:text-amber-300">
                <span className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Charter Changed – Review: Parent charter scope/milestones were revised.
                </span>
                <button
                  type="button"
                  onClick={() => clearCharterChangedFlag(task.id, actorName)}
                  className="px-2 py-0.5 rounded bg-amber-600 text-white font-semibold text-[11px]"
                >
                  Acknowledge
                </button>
              </div>
            )}
            {fuMissed && (
              <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Follow-up Missed (was due {task.nextFollowUpDate}). Log a follow-up update to restore compliance.
              </div>
            )}
            {daysOverdue > 0 && (
              <div className="flex items-center gap-1.5 text-[#D93025] dark:text-red-400 font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                Overdue by {daysOverdue} day(s) as of {bscSimulatedDate}. {esc.triggers.join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* Governed Workflow Action Bar (§4.1 & §4.2) */}
        {!isTerminal && (
          <div className="px-5 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 shrink-0">
            {task.status === 'Draft' && bscCapabilities.canCreateAndAssignTasks && (
              <button
                type="button"
                disabled={busy}
                onClick={handleAssign}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold hover:bg-[#1557B0] disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                Assign &amp; Lock Baseline
              </button>
            )}

            {task.status === 'Assigned' && bscCapabilities.canExecuteTask && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickTransition('Accepted')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#188038] text-white text-xs font-semibold hover:opacity-90"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Accept Task
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setPendingAction({ target: 'Query Raised', label: 'Raise Query to PM/A', needsReason: true })
                  }
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/40"
                >
                  Raise Query
                </button>
              </>
            )}

            {task.status === 'Query Raised' && bscCapabilities.canCreateAndAssignTasks && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleQuickTransition('Accepted')}
                className="px-3 py-1.5 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold"
              >
                Resolve Query → Accepted
              </button>
            )}

            {(task.status === 'Accepted' || task.status === 'Returned' || task.status === 'On Hold' || task.status === 'Blocked') &&
              bscCapabilities.canExecuteTask && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (incompletePredecessors.length > 0) {
                      setPendingAction({
                        target: 'In Progress',
                        label: 'Start Work (Predecessors Incomplete)',
                        needsReason: true,
                      });
                    } else {
                      handleQuickTransition('In Progress');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold hover:bg-[#1557B0]"
                >
                  {task.status === 'Returned' ? 'Resume Rework' : 'Start Work (In Progress)'}
                </button>
              )}

            {(task.status === 'In Progress' || task.status === 'Returned') &&
              bscCapabilities.canExecuteTask && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickTransition('Submitted for Review')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#188038] text-white text-xs font-semibold hover:opacity-90"
                >
                  <Send className="w-3.5 h-3.5" />
                  Submit for Review
                </button>
              )}

            {task.status === 'Submitted for Review' && bscCapabilities.canApproveSubmissions && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickTransition('Completed')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#188038] text-white text-xs font-semibold hover:opacity-90"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Approve &amp; Complete (A)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setPendingAction({ target: 'Returned', label: 'Return for Rework (Comment Required)', needsReason: true })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D93025]/40 text-[#D93025] dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Return
                </button>
              </>
            )}

            {task.status !== 'Draft' && task.status !== 'Submitted for Review' && task.status !== 'Blocked' && bscCapabilities.canExecuteTask && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setPendingAction({ target: 'Blocked', label: 'Flag Blocked (Reason Required)', needsReason: true })
                }
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#D93025] hover:bg-red-50 dark:hover:bg-red-950/20"
              >
                Flag Blocked
              </button>
            )}

            {task.status !== 'Draft' && task.status !== 'Submitted for Review' && task.status !== 'On Hold' && bscCapabilities.canCreateAndAssignTasks && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setPendingAction({ target: 'On Hold', label: 'Put On Hold (Reason Required)', needsReason: true })
                }
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Hold
              </button>
            )}

            {bscCapabilities.canCreateAndAssignTasks && task.status !== 'Submitted for Review' && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setPendingAction({ target: 'Cancelled', label: 'Cancel Task (Reason Required)', needsReason: true })
                }
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 hover:text-[#D93025]"
              >
                Cancel Task
              </button>
            )}
          </div>
        )}

        {/* Inline Transition Prompt */}
        {pendingAction && (
          <div className="px-5 py-3 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900/50 space-y-2 text-xs">
            <div className="font-semibold text-[#172B4D] dark:text-white">{pendingAction.label}</div>
            {pendingAction.target === 'In Progress' && incompletePredecessors.length > 0 && (
              <div className="text-amber-700 dark:text-amber-300 space-y-1.5">
                <p>
                  Blocked by incomplete predecessor(s):{' '}
                  <span className="font-mono font-bold">
                    {incompletePredecessors.map((p) => p.taskCode).join(', ')}
                  </span>
                </p>
                {bscCapabilities.canOverrideDates && (
                  <label className="flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={overridePredecessors}
                      onChange={(e) => setOverridePredecessors(e.target.checked)}
                    />
                    Admin Override predecessor gate (requires logged reason below)
                  </label>
                )}
              </div>
            )}
            <textarea
              rows={2}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Enter mandatory reason / review comment..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleTransitionConfirm}
                className="px-3 py-1.5 rounded-lg bg-[#1A73E8] text-white font-semibold"
              >
                Confirm Transition
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  setActionReason('');
                  setOverridePredecessors(false);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="px-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-5 text-xs shrink-0">
          {[
            { id: 'overview', label: 'Details & Evidence' },
            { id: 'followups', label: `Follow-up Log (${taskFollowUps.length})` },
            { id: 'datechanges', label: `Date-Change Requests (${taskDateChanges.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-3 font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#1A73E8] text-[#1A73E8] dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {activeTab === 'overview' && (
            <>
              {/* Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Actual vs Expected</div>
                  <div className="mt-1 font-mono text-base font-bold text-[#172B4D] dark:text-white tabular-nums">
                    {task.percentComplete}%{' '}
                    <span className="text-xs font-normal text-slate-400">/ {expectedPct}%</span>
                  </div>
                  <div className={`text-[11px] font-mono ${scheduleGap > 10 ? 'text-[#D93025]' : 'text-[#188038]'}`}>
                    Gap: {scheduleGap > 0 ? `-${scheduleGap}%` : `+${Math.abs(scheduleGap)}%`}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Day-Range Bucket</div>
                  <div className="mt-1 font-mono text-base font-bold text-[#172B4D] dark:text-white">
                    {task.dayRangeBucket}
                  </div>
                  <div className="text-[11px] text-slate-500">Weight: {task.weight}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Slippage vs Baseline</div>
                  <div
                    className={`mt-1 font-mono text-base font-bold tabular-nums ${
                      slippage > 0 ? 'text-[#D93025]' : 'text-[#188038]'
                    }`}
                  >
                    {slippage > 0 ? `+${slippage}d` : `${slippage}d`}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    {task.baselineLocked ? (
                      <>
                        <Lock className="w-3 h-3 text-slate-400" /> Locked
                      </>
                    ) : (
                      'Draft (Unlocked)'
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Follow-up Cadence</div>
                  <div className="mt-1 font-semibold text-sm text-[#172B4D] dark:text-white">
                    {task.followUpFrequency}
                  </div>
                  <div className={`text-[11px] font-mono ${fuMissed ? 'text-[#D93025] font-bold' : 'text-slate-500'}`}>
                    Next: {task.nextFollowUpDate}
                  </div>
                </div>
              </div>

              {/* Description & Deliverable */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Description &amp; Phase
                  </div>
                  <div className="font-semibold text-[#1A73E8] dark:text-blue-400">
                    Phase: {task.phase} · Priority: {task.priority}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {task.description || 'No additional description recorded.'}
                  </p>
                  {task.statusReason && (
                    <div className="mt-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">Latest Status Note: </span>
                      {task.statusReason}
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    RACI Governance Assignment
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Responsible (R)</span>
                      <span className="font-semibold text-[#172B4D] dark:text-white">
                        {task.responsibleName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Accountable (A)</span>
                      <span className="font-semibold text-[#172B4D] dark:text-white">
                        {task.accountableName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Consulted (C)</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {(task.consultedIds || []).join(', ') || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Informed (I)</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {(task.informedIds || []).join(', ') || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dates Table (Immutable Baseline vs Current Planned vs Actual) */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5" />
                    Schedule Baseline &amp; Actuals
                  </div>
                  {!isTerminal && task.baselineLocked && bscCapabilities.canOverrideDates && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminDateEdit((v) => !v);
                        setAdminNewEnd(task.plannedEnd);
                      }}
                      className="text-[11px] font-semibold text-[#1A73E8] hover:underline"
                    >
                      {showAdminDateEdit ? 'Cancel Admin Override' : 'Admin Override Due Date'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] font-sans text-slate-400 uppercase flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Baseline (Locked)
                    </div>
                    <div className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                      {task.baselineStart} → {task.baselineEnd}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] font-sans text-slate-400 uppercase">Current Planned</div>
                    <div className="mt-1 font-semibold text-[#172B4D] dark:text-white">
                      {task.plannedStart} → {task.plannedEnd}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] font-sans text-slate-400 uppercase">Actual Dates</div>
                    <div className="mt-1 font-semibold text-[#188038] dark:text-emerald-400">
                      {task.actualStart || '—'} → {task.actualEnd || '—'}
                    </div>
                  </div>
                </div>

                {task.baselineLocked && !bscCapabilities.canOverrideDates && (
                  <p className="text-[11px] text-slate-500">
                    Direct due-date editing is disabled once baseline is locked. Use the{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('datechanges')}
                      className="text-[#1A73E8] font-semibold hover:underline"
                    >
                      Date-Change Requests
                    </button>{' '}
                    tab to request an approved extension.
                  </p>
                )}

                {showAdminDateEdit && bscCapabilities.canOverrideDates && (
                  <form
                    onSubmit={handleAdminDateOverride}
                    className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-2"
                  >
                    <div className="font-semibold text-amber-800 dark:text-amber-300">
                      Admin Due-Date Override (Baseline {task.baselineEnd} stays locked)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="date"
                        required
                        value={adminNewEnd}
                        onChange={(e) => setAdminNewEnd(e.target.value)}
                        className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                      <input
                        type="text"
                        required
                        value={adminOverrideReason}
                        onChange={(e) => setAdminOverrideReason(e.target.value)}
                        placeholder="Mandatory audit reason..."
                        className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-3 py-1.5 rounded bg-amber-600 text-white font-semibold"
                    >
                      Apply Logged Override
                    </button>
                  </form>
                )}
              </div>

              {/* Linked KRAs & Predecessor Dependencies */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Linked BSC KRAs ({linkedKras.length})
                  </div>
                  {linkedKras.length === 0 ? (
                    <p className="text-slate-400">No KRAs linked.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {linkedKras.map((k) => (
                        <li
                          key={k.id}
                          className="p-2 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-[#1A73E8] dark:text-blue-400">
                              KRA {k.refCode}
                            </span>
                            <span className="text-[11px] text-slate-500">{k.perspective}</span>
                          </div>
                          <div className="font-medium text-[#172B4D] dark:text-slate-200 mt-0.5">
                            {k.title}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <GitBranch className="w-3.5 h-3.5" /> Predecessor Tasks ({predecessors.length})
                  </div>
                  {predecessors.length === 0 ? (
                    <p className="text-slate-400">No upstream dependencies.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {predecessors.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800"
                        >
                          <button
                            type="button"
                            onClick={() => setActiveBscTaskId(p.id)}
                            className="text-left hover:underline"
                          >
                            <span className="font-mono font-bold text-[#1A73E8]">{p.taskCode}</span>
                            <span className="block text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                              {p.title}
                            </span>
                          </button>
                          <span
                            className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                              p.status === 'Completed'
                                ? 'bg-[#188038]/12 text-[#188038]'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {p.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Deliverable Evidence & Attachments Gate */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  Deliverable / Evidence Gate (Required Before Completion)
                </div>
                <p className="font-medium text-[#172B4D] dark:text-slate-200">
                  Required Evidence: {task.deliverableEvidence}
                </p>
                <div className="space-y-1">
                  {(task.attachments || []).length === 0 ? (
                    <div className="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
                      No evidence attached yet. Attach at least 1 deliverable file/reference before submitting for review.
                    </div>
                  ) : (
                    (task.attachments || []).map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 font-mono text-[11px]"
                      >
                        <FileCheck2 className="w-3.5 h-3.5 text-[#188038] shrink-0" />
                        <span className="truncate">{att}</span>
                      </div>
                    ))
                  )}
                </div>

                {!isTerminal && bscCapabilities.canExecuteTask && (
                  <form onSubmit={handleAddAttachment} className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={attachmentInput}
                      onChange={(e) => setAttachmentInput(e.target.value)}
                      placeholder="Attach deliverable filename or document URL (e.g. Organogram_Signed_v3.pdf)..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={busy || !attachmentInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[#172B4D] dark:bg-[#1A73E8] text-white font-semibold disabled:opacity-50"
                    >
                      Attach Evidence
                    </button>
                  </form>
                )}
              </div>
            </>
          )}

          {activeTab === 'followups' && (
            <div className="space-y-5">
              {/* Inline Log Follow-Up Form */}
              {!isTerminal && (bscCapabilities.canExecuteTask || bscCapabilities.canLogPmFollowUp) && (
                <form
                  onSubmit={handleLogFollowUp}
                  className="p-4 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#172B4D] dark:text-white">
                      Log New Follow-Up Update (Append-Only Audit Record)
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">Date: {bscSimulatedDate}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Update Type</label>
                      <select
                        value={fuType}
                        onChange={(e) => setFuType(e.target.value as FollowUpType)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        <option value="Owner Update">Owner Update</option>
                        <option value="PM Follow-up">PM Follow-up</option>
                        <option value="Review Comment">Review Comment</option>
                        <option value="Escalation">Escalation</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Updated % Complete (steps of 10)
                      </label>
                      <select
                        value={fuPercent || task.percentComplete}
                        onChange={(e) => setFuPercent(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      >
                        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
                          <option key={v} value={v}>
                            {v}%
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Next Follow-Up Date</label>
                      <input
                        type="date"
                        value={
                          fuNextDate ||
                          computeNextFollowUpDate(bscSimulatedDate, task.followUpFrequency)
                        }
                        onChange={(e) => setFuNextDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Progress Note *</label>
                    <textarea
                      required
                      rows={2}
                      value={fuNote}
                      onChange={(e) => setFuNote(e.target.value)}
                      placeholder="Summarize progress completed, verification status, or call follow-up outcome..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={fuBlockers}
                      onChange={(e) => setFuBlockers(e.target.value)}
                      placeholder="Issues / Blockers (optional)"
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="text"
                      value={fuSupport}
                      onChange={(e) => setFuSupport(e.target.value)}
                      placeholder="Support Needed From (person/dept)"
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="text"
                      value={fuNextAction}
                      onChange={(e) => setFuNextAction(e.target.value)}
                      placeholder="Next agreed action"
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="text"
                      value={fuAttachment}
                      onChange={(e) => setFuAttachment(e.target.value)}
                      placeholder="Evidence attachment filename (optional)"
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold disabled:opacity-50"
                  >
                    Append Follow-Up Record
                  </button>
                </form>
              )}

              {/* Append-only FollowUp Timeline */}
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Immutable Follow-Up Audit Trail (Newest First — Never Edited or Deleted)
                </div>

                {taskFollowUps.length === 0 ? (
                  <p className="text-slate-400 py-6 text-center">No follow-up updates logged yet.</p>
                ) : (
                  taskFollowUps.map((fu) => (
                    <div
                      key={fu.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-500">{fu.date}</span>
                          <span className="font-bold text-[#172B4D] dark:text-white">{fu.updatedBy}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            {fu.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-slate-500">
                            {fu.percentBefore}% → <strong className="text-[#1A73E8]">{fu.percentAfter}%</strong>
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-semibold ${
                              fu.onTime
                                ? 'bg-[#188038]/12 text-[#188038]'
                                : 'bg-[#D93025]/12 text-[#D93025]'
                            }`}
                          >
                            {fu.onTime ? 'On Time' : 'Late'}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{fu.progressNote}</p>
                      {(fu.issuesBlockers || fu.supportNeededFrom || fu.nextAction) && (
                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-500">
                          {fu.issuesBlockers && (
                            <div>
                              <strong className="text-[#D93025]">Blocker:</strong> {fu.issuesBlockers}
                            </div>
                          )}
                          {fu.supportNeededFrom && (
                            <div>
                              <strong>Support From:</strong> {fu.supportNeededFrom}
                            </div>
                          )}
                          {fu.nextAction && (
                            <div className="sm:col-span-2">
                              <strong>Next Action:</strong> {fu.nextAction}{' '}
                              {fu.nextFollowUpDate && `(Next Follow-up: ${fu.nextFollowUpDate})`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'datechanges' && (
            <div className="space-y-5">
              {!isTerminal && (
                <form
                  onSubmit={handleSubmitDateChange}
                  className="p-4 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="font-bold text-[#172B4D] dark:text-white">
                    Request Governed Due-Date Revision
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Current Planned End: <strong className="font-mono">{task.plannedEnd}</strong> · Locked Baseline:{' '}
                    <strong className="font-mono">{task.baselineEnd}</strong>
                    {milestone && (
                      <>
                        {' '}
                        · Milestone M{String(milestone.milestoneNumber).padStart(2, '0')} End:{' '}
                        <strong className="font-mono">{milestone.plannedEnd}</strong>
                      </>
                    )}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Proposed New End Date *</label>
                      <input
                        type="date"
                        required
                        value={dcrProposedEnd}
                        onChange={(e) => setDcrProposedEnd(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div className="flex items-end">
                      {dcrImpactsMilestone ? (
                        <div className="w-full px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">
                          Impacts Milestone End → Requires BOTH A ({task.accountableName}) &amp; ED ({charter?.projectHead}) approval
                        </div>
                      ) : (
                        <div className="w-full px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]">
                          Within milestone boundary → Requires Accountable ({task.accountableName}) approval
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea
                    required
                    rows={2}
                    value={dcrReason}
                    onChange={(e) => setDcrReason(e.target.value)}
                    placeholder="Justification for due-date change..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold disabled:opacity-50"
                  >
                    Submit Date-Change Request
                  </button>
                </form>
              )}

              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Date-Change History ({taskDateChanges.length})
                </div>
                {taskDateChanges.length === 0 ? (
                  <p className="text-slate-400 py-6 text-center">No date-change requests for this task.</p>
                ) : (
                  taskDateChanges.map((dcr) => (
                    <div
                      key={dcr.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-mono font-bold text-[#172B4D] dark:text-white">
                          {dcr.oldEnd} → {dcr.proposedEnd}
                        </div>
                        <div className="flex items-center gap-2">
                          {dcr.impactOnMilestone && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-[11px]">
                              Milestone Slip
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                              dcr.decision === 'Approved'
                                ? 'bg-[#188038]/12 text-[#188038]'
                                : dcr.decision === 'Rejected'
                                  ? 'bg-[#D93025]/12 text-[#D93025]'
                                  : 'bg-blue-500/15 text-[#1A73E8]'
                            }`}
                          >
                            {dcr.decision}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{dcr.reason}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                        <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-950">
                          <div>
                            <span className="text-slate-400 block">Stage 1 · Accountable (A)</span>
                            <span className="font-semibold">{dcr.approverA}</span>
                          </div>
                          {dcr.decision === 'Pending' && dcr.decisionA === 'Pending' && bscCapabilities.canApproveSubmissions ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDecideDcr(dcr.id, 'A', 'Approved')}
                                className="px-2 py-1 rounded bg-[#188038] text-white font-semibold"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDecideDcr(dcr.id, 'A', 'Rejected')}
                                className="px-2 py-1 rounded bg-[#D93025] text-white font-semibold"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="font-mono font-bold">{dcr.decisionA}</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-950">
                          <div>
                            <span className="text-slate-400 block">Stage 2 · Project Head (ED)</span>
                            <span className="font-semibold">{dcr.approverEd || 'Not Required'}</span>
                          </div>
                          {dcr.decision === 'Pending' &&
                          dcr.impactOnMilestone &&
                          dcr.decisionEd === 'Pending' &&
                          bscCapabilities.canApproveL3L4AndClosure ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDecideDcr(dcr.id, 'ED', 'Approved')}
                                className="px-2 py-1 rounded bg-[#188038] text-white font-semibold"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDecideDcr(dcr.id, 'ED', 'Rejected')}
                                className="px-2 py-1 rounded bg-[#D93025] text-white font-semibold"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="font-mono font-bold">{dcr.decisionEd}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
