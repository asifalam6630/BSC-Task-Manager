import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, MessageSquarePlus, ShieldAlert, UserCheck, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BscTask } from '../../types/bsc';
import {
  computeNextFollowUpDate,
  computeTaskRag,
  getBscDaysOverdue,
  getBscDaysUntilDue,
  getRagBadgeClasses,
  isBscTaskOpen,
  isFollowUpMissed,
  parseDateSafe,
} from '../../lib/bscMetrics';
import { logTaskFollowUp } from '../../lib/bscService';
import { BscGovernanceBar } from '../../components/bsc/BscGovernanceBar';

interface BscMyTasksModuleProps {
  onCreateTask: () => void;
}

export const BscMyTasksModule: React.FC<BscMyTasksModuleProps> = ({ onCreateTask }) => {
  const {
    profile,
    user,
    bscTasks,
    employees,
    bscSimulatedDate,
    bscCapabilities,
    setActiveBscTaskId,
    notify,
  } = useApp();

  const refDate = parseDateSafe(bscSimulatedDate) || new Date();
  const actorName = profile?.displayName || user?.displayName || 'BSC User';

  const peopleOptions = useMemo(() => {
    const names = new Set<string>();
    bscTasks.forEach((t) => {
      if (t.responsibleName) names.add(t.responsibleName);
      if (t.accountableName) names.add(t.accountableName);
    });
    employees.forEach((e) => names.add(e.name));
    return Array.from(names).sort();
  }, [bscTasks, employees]);

  const [selectedPerson, setSelectedPerson] = useState<string>('ALL');
  const [quickLogTask, setQuickLogTask] = useState<BscTask | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [quickPct, setQuickPct] = useState(50);
  const [quickBlockers, setQuickBlockers] = useState('');
  const [saving, setSaving] = useState(false);

  const openTasks = useMemo(
    () => bscTasks.filter((t) => isBscTaskOpen(t) && t.status !== 'Draft'),
    [bscTasks]
  );

  const myResponsibleTasks = useMemo(
    () =>
      selectedPerson === 'ALL'
        ? openTasks
        : openTasks.filter((t) => t.responsibleName === selectedPerson),
    [openTasks, selectedPerson]
  );

  const overdueTasks = useMemo(
    () => myResponsibleTasks.filter((t) => getBscDaysOverdue(t, refDate) > 0),
    [myResponsibleTasks, refDate]
  );

  const dueThisWeek = useMemo(
    () =>
      myResponsibleTasks.filter((t) => {
        const d = getBscDaysUntilDue(t, refDate);
        return d >= 0 && d <= 7;
      }),
    [myResponsibleTasks, refDate]
  );

  const awaitingApproval = useMemo(
    () =>
      bscTasks.filter(
        (t) =>
          t.status === 'Submitted for Review' &&
          (selectedPerson === 'ALL' || t.accountableName === selectedPerson)
      ),
    [bscTasks, selectedPerson]
  );

  const upcomingTasks = useMemo(
    () => myResponsibleTasks.filter((t) => getBscDaysUntilDue(t, refDate) > 7),
    [myResponsibleTasks, refDate]
  );

  const handleQuickLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickLogTask) return;
    setSaving(true);
    try {
      await logTaskFollowUp(quickLogTask, {
        progressNote: quickNote,
        percentAfter: quickPct,
        issuesBlockers: quickBlockers,
        nextFollowUpDate: computeNextFollowUpDate(bscSimulatedDate, quickLogTask.followUpFrequency),
        type: 'Owner Update',
        actorName: selectedPerson === 'ALL' ? actorName : selectedPerson,
        todayStr: bscSimulatedDate,
      });
      setQuickLogTask(null);
      setQuickNote('');
      setQuickBlockers('');
      notify('success', `Follow-up logged for ${quickLogTask.taskCode}`);
    } catch (err) {
      notify('error', 'Update failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const renderGroup = (
    title: string,
    icon: React.ReactNode,
    items: BscTask[],
    emptyText: string,
    highlightRed = false
  ) => (
    <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xs font-display font-bold uppercase tracking-wider text-[#172B4D] dark:text-white">
            {title}
          </h2>
          <span
            className={`font-mono text-xs font-bold ${
              highlightRed && items.length > 0 ? 'text-[#D93025]' : 'text-slate-500'
            }`}
          >
            ({items.length})
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-xs text-slate-400 text-center">{emptyText}</div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((t) => {
            const rag = computeTaskRag(t, bscTasks, refDate);
            const overdue = getBscDaysOverdue(t, refDate);
            const fuMissed = isFollowUpMissed(t, refDate);
            return (
              <div
                key={t.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
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
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                      {t.status}
                    </span>
                    {overdue > 0 && (
                      <span className="font-mono font-bold text-[#D93025]">+{overdue}d overdue</span>
                    )}
                    {fuMissed && (
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        Follow-up Missed
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveBscTaskId(t.id)}
                    className="text-left text-xs font-semibold text-[#172B4D] dark:text-white hover:text-[#1A73E8] block"
                  >
                    {t.title}
                  </button>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-3">
                    <span>R: {t.responsibleName}</span>
                    <span>A: {t.accountableName}</span>
                    <span className="font-mono">Due: {t.plannedEnd}</span>
                    <span className="font-mono">Progress: {t.percentComplete}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {bscCapabilities.canExecuteTask && t.status !== 'Submitted for Review' && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickLogTask(t);
                        setQuickPct(t.percentComplete);
                        setQuickNote('');
                        setQuickBlockers('');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold hover:bg-[#1557B0]"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      Log Update
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveBscTaskId(t.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {t.status === 'Submitted for Review' ? 'Review / Approve' : 'Open Detail'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      <BscGovernanceBar
        title="My Tasks — Execution & Approval Queue"
        subtitle="Grouped by Overdue, Due This Week, Awaiting My Approval (A), and Upcoming with one-click follow-up logging"
        onCreateTask={onCreateTask}
        extraActions={
          <select
            aria-label="Filter My Tasks by person"
            value={selectedPerson}
            onChange={(e) => setSelectedPerson(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#172B4D] dark:text-slate-100"
          >
            <option value="ALL">All Governance Owners (Full Queue)</option>
            {peopleOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        }
      />

      <div className="space-y-4">
        {renderGroup(
          'Overdue Tasks',
          <ShieldAlert className="w-4 h-4 text-[#D93025]" />,
          overdueTasks,
          'No overdue tasks for this selection.',
          true
        )}
        {renderGroup(
          'Awaiting My Approval (Accountable A)',
          <UserCheck className="w-4 h-4 text-[#188038]" />,
          awaitingApproval,
          'No submitted tasks awaiting approval.'
        )}
        {renderGroup(
          'Due This Week (Next 7 Days)',
          <Clock className="w-4 h-4 text-amber-600" />,
          dueThisWeek,
          'No tasks due within the next 7 days.'
        )}
        {renderGroup(
          'Upcoming Active Tasks',
          <CheckCircle2 className="w-4 h-4 text-[#1A73E8]" />,
          upcomingTasks,
          'No additional upcoming tasks.'
        )}
      </div>

      {/* One-Click Log Update Modal */}
      {quickLogTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleQuickLogSubmit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono font-bold text-[#1A73E8]">{quickLogTask.taskCode}</span>
                <h3 className="text-sm font-bold text-[#172B4D] dark:text-white mt-0.5">
                  Log Progress Update
                </h3>
              </div>
              <button type="button" onClick={() => setQuickLogTask(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Updated Completion % (steps of 10)
              </label>
              <select
                value={quickPct}
                onChange={(e) => setQuickPct(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 font-mono"
              >
                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Progress Update Note *
              </label>
              <textarea
                required
                rows={3}
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                placeholder="What was completed since last update?"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Issues / Blockers (optional)
              </label>
              <input
                type="text"
                value={quickBlockers}
                onChange={(e) => setQuickBlockers(e.target.value)}
                placeholder="Any roadblocks needing PM or ED support?"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickLogTask(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-[#1A73E8] text-white font-semibold disabled:opacity-50"
              >
                {saving ? 'Logging…' : 'Append Update'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
