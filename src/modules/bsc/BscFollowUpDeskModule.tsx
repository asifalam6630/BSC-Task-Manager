import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock,
  HelpCircle,
  Mail,
  PhoneCall,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BscTask } from '../../types/bsc';
import {
  computeNextFollowUpDate,
  computePortfolioBscKpis,
  computeTaskRag,
  evaluateRemindersAndEscalations,
  getRagBadgeClasses,
  isAcceptanceOverdue,
  isFollowUpDueToday,
  isFollowUpMissed,
  parseDateSafe,
} from '../../lib/bscMetrics';
import { decideDateChangeRequest, logTaskFollowUp } from '../../lib/bscService';
import { BscGovernanceBar } from '../../components/bsc/BscGovernanceBar';

interface BscFollowUpDeskModuleProps {
  onCreateTask: () => void;
}

export const BscFollowUpDeskModule: React.FC<BscFollowUpDeskModuleProps> = ({ onCreateTask }) => {
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
    setActiveBscTaskId,
    notify,
  } = useApp();

  const refDate = parseDateSafe(bscSimulatedDate) || new Date();
  const actorName = profile?.displayName || user?.displayName || 'BSC PM';

  const [callTask, setCallTask] = useState<BscTask | null>(null);
  const [callNote, setCallNote] = useState('');
  const [callNextAction, setCallNextAction] = useState('');
  const [busy, setBusy] = useState(false);

  const kpis = useMemo(
    () =>
      computePortfolioBscKpis(
        bscKras,
        projectCharters,
        bscTasks,
        bscFollowUps,
        bscConfig,
        refDate
      ),
    [bscKras, projectCharters, bscTasks, bscFollowUps, bscConfig, refDate]
  );

  const dueToday = useMemo(
    () => bscTasks.filter((t) => isFollowUpDueToday(t, refDate)),
    [bscTasks, refDate]
  );

  const missedFollowUps = useMemo(
    () => bscTasks.filter((t) => isFollowUpMissed(t, refDate)),
    [bscTasks, refDate]
  );

  const queryOrUnaccepted = useMemo(
    () =>
      bscTasks.filter(
        (t) => t.status === 'Query Raised' || isAcceptanceOverdue(t, refDate)
      ),
    [bscTasks, refDate]
  );

  const pendingApprovals = useMemo(
    () => bscTasks.filter((t) => t.status === 'Submitted for Review'),
    [bscTasks]
  );

  const pendingDateChanges = useMemo(
    () => dateChangeRequests.filter((d) => d.decision === 'Pending'),
    [dateChangeRequests]
  );

  const activeAlerts = useMemo(
    () => evaluateRemindersAndEscalations(bscTasks, projectCharters, bscConfig, refDate),
    [bscTasks, projectCharters, bscConfig, refDate]
  );

  // Group daily digest by recipient
  const digestByRecipient = useMemo(() => {
    const map = new Map<string, typeof activeAlerts>();
    activeAlerts.forEach((al) => {
      al.notify.forEach((person) => {
        const list = map.get(person) || [];
        list.push(al);
        map.set(person, list);
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [activeAlerts]);

  const handleLogPmCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callTask) return;
    setBusy(true);
    try {
      await logTaskFollowUp(callTask, {
        progressNote: `[PM Call Logged] ${callNote.trim()}`,
        percentAfter: callTask.percentComplete,
        nextAction: callNextAction,
        nextFollowUpDate: computeNextFollowUpDate(bscSimulatedDate, callTask.followUpFrequency),
        type: 'PM Follow-up',
        actorName,
        todayStr: bscSimulatedDate,
      });
      setCallTask(null);
      setCallNote('');
      setCallNextAction('');
      notify('success', `PM follow-up logged for ${callTask.taskCode}`);
    } catch (err) {
      notify('error', 'Follow-up log failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleDecideDcr = async (
    reqId: string,
    stage: 'A' | 'ED',
    outcome: 'Approved' | 'Rejected'
  ) => {
    const req = pendingDateChanges.find((d) => d.id === reqId);
    if (!req) return;
    const task = bscTasks.find((t) => t.id === req.taskId);
    const charter = projectCharters.find((c) => c.id === req.charterId);
    setBusy(true);
    try {
      const res = await decideDateChangeRequest(
        req,
        task,
        charter,
        stage,
        outcome,
        `${outcome} from Follow-up Desk (${bscActingRole})`,
        actorName,
        bscSimulatedDate
      );
      notify(
        outcome === 'Approved' ? 'success' : 'info',
        `Date-change Stage ${stage}: ${outcome}`,
        res.fullyApproved
          ? `${req.taskCode} due date updated to ${req.proposedEnd}.`
          : undefined
      );
    } catch (err) {
      notify('error', 'Decision failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const renderTaskQueue = (
    title: string,
    icon: React.ReactNode,
    list: BscTask[],
    emptyMsg: string
  ) => (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-4 py-2.5 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-[#172B4D] dark:text-white">
          {icon}
          <span>{title}</span>
          <span className="font-mono text-slate-500">({list.length})</span>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="p-5 text-xs text-slate-400 text-center">{emptyMsg}</div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((t) => {
            const rag = computeTaskRag(t, bscTasks, refDate);
            return (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setActiveBscTaskId(t.id)}
                      className="font-mono font-bold text-[#1A73E8] hover:underline"
                    >
                      {t.taskCode}
                    </button>
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${getRagBadgeClasses(rag)}`}>
                      {rag}
                    </span>
                    <span className="text-slate-500">{t.status}</span>
                  </div>
                  <div className="font-semibold text-[#172B4D] dark:text-white truncate mt-0.5">
                    {t.title}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    R: {t.responsibleName} · Next Follow-Up:{' '}
                    <span className="font-mono">{t.nextFollowUpDate}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {bscCapabilities.canLogPmFollowUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setCallTask(t);
                        setCallNote('');
                        setCallNextAction('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#172B4D] dark:bg-[#1A73E8] text-white text-[11px] font-semibold"
                    >
                      <PhoneCall className="w-3 h-3" />
                      Call Logged
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveBscTaskId(t.id)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold"
                  >
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <BscGovernanceBar
        title="Follow-up Desk — PM & Coordinator Command"
        subtitle={`Live queues & ${bscConfig.dailyDigestTime} ${bscConfig.dailyDigestTimezone} digest preview · Follow-up Compliance: ${kpis.followUpCompliancePct}% (Target ≥ ${bscConfig.followUpComplianceTarget}%)`}
        onCreateTask={onCreateTask}
      />

      {/* Queue Summary KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Due Today', val: dueToday.length, tone: 'text-[#1A73E8]' },
          { label: 'Missed Follow-ups', val: missedFollowUps.length, tone: missedFollowUps.length > 0 ? 'text-[#D93025]' : 'text-[#188038]' },
          { label: 'Query / Unaccepted >2d', val: queryOrUnaccepted.length, tone: 'text-amber-600' },
          { label: 'Pending Approvals', val: pendingApprovals.length, tone: 'text-[#188038]' },
          { label: 'Date-Change Requests', val: pendingDateChanges.length, tone: 'text-purple-600 dark:text-purple-400' },
        ].map((item) => (
          <div
            key={item.label}
            className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <div className="text-[11px] text-slate-500">{item.label}</div>
            <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${item.tone}`}>
              {item.val}
            </div>
          </div>
        ))}
      </div>

      {/* 4 Operational Task Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderTaskQueue(
          'Missed Follow-ups ("Follow-up Missed" Flag)',
          <AlertTriangle className="w-4 h-4 text-[#D93025]" />,
          missedFollowUps,
          'Zero missed follow-ups on this simulated date.'
        )}
        {renderTaskQueue(
          `Follow-ups Due Today (${bscSimulatedDate})`,
          <Clock className="w-4 h-4 text-[#1A73E8]" />,
          dueToday,
          'No follow-ups scheduled for today.'
        )}
        {renderTaskQueue(
          'Query Raised & Unaccepted Assignments (>2 Working Days)',
          <HelpCircle className="w-4 h-4 text-amber-600" />,
          queryOrUnaccepted,
          'All assigned tasks accepted with zero open queries.'
        )}
        {renderTaskQueue(
          'Pending Approvals (Submitted for Review)',
          <CheckCircle2 className="w-4 h-4 text-[#188038]" />,
          pendingApprovals,
          'No deliverables awaiting Accountable (A) approval.'
        )}
      </div>

      {/* Queue 5: Pending Governed Date-Change Requests */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs font-bold text-[#172B4D] dark:text-white">
          <CalendarClock className="w-4 h-4 text-[#1A73E8]" />
          <span>Pending Date-Change Requests ({pendingDateChanges.length})</span>
        </div>
        {pendingDateChanges.length === 0 ? (
          <div className="p-5 text-xs text-slate-400 text-center">No pending date-change requests.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pendingDateChanges.map((dcr) => (
              <div key={dcr.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveBscTaskId(dcr.taskId)}
                      className="font-mono font-bold text-[#1A73E8] hover:underline"
                    >
                      {dcr.taskCode}
                    </button>
                    <span className="font-mono font-bold text-[#172B4D] dark:text-white">
                      {dcr.oldEnd} → {dcr.proposedEnd}
                    </span>
                    {dcr.impactOnMilestone && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-[11px]">
                        Impacts Milestone End (Needs A + ED)
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{dcr.reason}</p>
                  <div className="text-[11px] text-slate-500">
                    Requested by {dcr.requestedBy} · Stage A ({dcr.approverA}):{' '}
                    <strong>{dcr.decisionA}</strong> · Stage ED ({dcr.approverEd || 'N/A'}):{' '}
                    <strong>{dcr.decisionEd}</strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {dcr.decisionA === 'Pending' && bscCapabilities.canApproveSubmissions && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDecideDcr(dcr.id, 'A', 'Approved')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#188038] text-white font-semibold"
                      >
                        Approve (A)
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDecideDcr(dcr.id, 'A', 'Rejected')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#D93025] text-white font-semibold"
                      >
                        Reject (A)
                      </button>
                    </>
                  )}
                  {dcr.impactOnMilestone &&
                    dcr.decisionEd === 'Pending' &&
                    bscCapabilities.canApproveL3L4AndClosure && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDecideDcr(dcr.id, 'ED', 'Approved')}
                          className="px-2.5 py-1.5 rounded-lg bg-[#1A73E8] text-white font-semibold"
                        >
                          Approve (ED)
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDecideDcr(dcr.id, 'ED', 'Rejected')}
                          className="px-2.5 py-1.5 rounded-lg border border-[#D93025] text-[#D93025] font-semibold"
                        >
                          Reject (ED)
                        </button>
                      </>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Daily Digest Preview (09:00 Asia/Dhaka — §6) */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-[#172B4D] dark:text-white">
            <BellRing className="w-4 h-4 text-[#1A73E8]" />
            <span>
              Daily Digest Preview — {bscConfig.dailyDigestTime} {bscConfig.dailyDigestTimezone} ({activeAlerts.length} active triggers)
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Active Channels:{' '}
              {[
                bscConfig.channels.inApp && 'In-App',
                bscConfig.channels.email && 'Email',
                bscConfig.channels.whatsapp && 'WhatsApp Hook',
                bscConfig.channels.sms && 'SMS Hook',
              ]
                .filter(Boolean)
                .join(' · ') || 'None'}
            </span>
          </div>
        </div>

        {digestByRecipient.length === 0 ? (
          <div className="p-5 text-xs text-slate-400 text-center">
            No reminders or escalations triggered for {bscSimulatedDate}. Advance the Simulated Date above to test §6 triggers.
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {digestByRecipient.map(([recipient, alerts]) => (
              <div
                key={recipient}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F7F9FC]/60 dark:bg-slate-950/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#172B4D] dark:text-white">{recipient}</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {alerts.length} alert(s)
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {alerts.map((al, i) => (
                    <li
                      key={`${al.taskId}_${i}`}
                      className="flex items-start justify-between gap-2 text-[11px] bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/70 dark:border-slate-800"
                    >
                      <button
                        type="button"
                        onClick={() => setActiveBscTaskId(al.taskId)}
                        className="text-left hover:underline"
                      >
                        <span className="font-mono font-bold text-[#1A73E8]">{al.taskCode}</span>{' '}
                        <span className="text-slate-700 dark:text-slate-200">{al.trigger}</span>
                      </button>
                      <span
                        className={`shrink-0 font-semibold ${
                          al.severity === 'critical'
                            ? 'text-[#D93025]'
                            : al.severity === 'warning'
                              ? 'text-amber-600'
                              : 'text-[#1A73E8]'
                        }`}
                      >
                        {al.action}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick PM Call Logged Modal */}
      {callTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleLogPmCall}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono font-bold text-[#1A73E8]">{callTask.taskCode}</span>
                <h3 className="text-sm font-bold text-[#172B4D] dark:text-white">
                  Log PM Follow-Up Call / Note
                </h3>
              </div>
              <button type="button" onClick={() => setCallTask(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <textarea
              required
              rows={3}
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              placeholder="Summary of call with task owner (R)..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              value={callNextAction}
              onChange={(e) => setCallNextAction(e.target.value)}
              placeholder="Agreed next action & commitment date..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCallTask(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 rounded-lg bg-[#1A73E8] text-white font-semibold"
              >
                Save PM Call Log
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
