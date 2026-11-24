import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileText,
  Layers,
  Lock,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  BSC_PERSPECTIVES,
  BscPerspective,
  ProjectCharter,
} from '../../types/bsc';
import {
  computeCharterBscProgress,
  computeMilestoneBscProgress,
  computePortfolioBscKpis,
  computeTaskRag,
  getBscDaysOverdue,
  getRagBadgeClasses,
  parseDateSafe,
} from '../../lib/bscMetrics';
import {
  approveProjectCharter,
  closeCharterMilestone,
  closeProjectCharter,
  confirmKraCompletion,
  createBscKraDoc,
  createProjectCharterDoc,
  generateTasksFromCharter,
  updateProjectCharterDoc,
} from '../../lib/bscService';
import { BscGovernanceBar } from '../../components/bsc/BscGovernanceBar';

interface BscPortfolioChartersModuleProps {
  onCreateTask: (charterId?: string) => void;
}

export const BscPortfolioChartersModule: React.FC<BscPortfolioChartersModuleProps> = ({
  onCreateTask,
}) => {
  const {
    user,
    profile,
    bscKras,
    projectCharters,
    bscTasks,
    bscFollowUps,
    bscConfig,
    bscSimulatedDate,
    bscCapabilities,
    setActiveBscTaskId,
    notify,
  } = useApp();

  const refDate = parseDateSafe(bscSimulatedDate) || new Date();
  const actorName = profile?.displayName || user?.displayName || 'BSC Admin';

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

  const [inspectCharterId, setInspectCharterId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Edit scope modal state inside Charter Inspector
  const [editingScope, setEditingScope] = useState(false);
  const [scopeDraft, setScopeDraft] = useState('');
  const [deliverablesDraft, setDeliverablesDraft] = useState('');
  const [closureNoteDraft, setClosureNoteDraft] = useState('');

  // Quick Add Charter / KRA modal
  const [showNewKra, setShowNewKra] = useState(false);
  const [kraForm, setKraForm] = useState({
    refCode: '',
    perspective: 'Financial' as BscPerspective,
    soCode: 'SO-1.1',
    soTitle: '',
    title: '',
    unit: '%',
    dataOwner: '',
    targetValue: '100%',
    currentValue: '0%',
  });

  const [showNewCharter, setShowNewCharter] = useState(false);
  const [charterForm, setCharterForm] = useState({
    charterCode: '',
    projectCode: '',
    title: '',
    perspective: 'Internal Business Processes' as BscPerspective,
    soCode: 'SO-3.1',
    businessNeed: '',
    scope: '',
    objectivesGoals: '',
    deliverables: '',
    projectLead: 'Rajib Hossain',
    projectManager: 'Md. Ashiful Alam',
    projectHead: 'Humayon Mostaque',
    projectSponsor: 'Md. Rashedul Hasan',
    startDate: bscSimulatedDate,
    targetDate: '2027-06-30',
  });

  const inspectedCharter = useMemo(
    () => projectCharters.find((c) => c.id === inspectCharterId) || null,
    [projectCharters, inspectCharterId]
  );

  const handleGenerateTasks = async (charter: ProjectCharter) => {
    if (!user) return;
    setBusy(true);
    try {
      const res = await generateTasksFromCharter(user.uid, charter, bscTasks, actorName);
      if (res.createdCount === 0) {
        notify(
          'info',
          `No new tasks generated for ${charter.charterCode}`,
          `All ${res.skippedCount} charter milestone activities already have tasks.`
        );
      } else {
        notify(
          'success',
          `Generated ${res.createdCount} Draft task(s)`,
          `Created from ${charter.charterCode} milestones (${res.skippedCount} skipped as existing).`
        );
      }
    } catch (err) {
      notify('error', 'Task generation blocked', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveCharter = async (charter: ProjectCharter) => {
    setBusy(true);
    try {
      await approveProjectCharter(charter, 'Approved', actorName);
      notify('success', `${charter.charterCode} Approved`, 'Task creation and generation are now enabled.');
    } catch (err) {
      notify('error', 'Approval failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveScopeRevision = async () => {
    if (!inspectedCharter) return;
    setBusy(true);
    try {
      const linked = bscTasks.filter((t) => t.charterId === inspectedCharter.id);
      const res = await updateProjectCharterDoc(
        inspectedCharter,
        { scope: scopeDraft, deliverables: deliverablesDraft },
        linked,
        actorName
      );
      setEditingScope(false);
      notify(
        'success',
        `Charter ${inspectedCharter.charterCode} updated`,
        res.flaggedTaskCount > 0
          ? `${res.flaggedTaskCount} linked task(s) flagged "Charter Changed – Review".`
          : 'Scope & deliverables updated.'
      );
    } catch (err) {
      notify('error', 'Charter update failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseMilestone = async (charter: ProjectCharter, milestoneId: string) => {
    setBusy(true);
    try {
      const chTasks = bscTasks.filter((t) => t.charterId === charter.id);
      await closeCharterMilestone(charter, milestoneId, chTasks);
      notify('success', 'Milestone closed', 'All milestone tasks verified Completed/Cancelled.');
    } catch (err) {
      notify('error', 'Milestone closure blocked', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseCharter = async (charter: ProjectCharter) => {
    setBusy(true);
    try {
      const chTasks = bscTasks.filter((t) => t.charterId === charter.id);
      await closeProjectCharter(charter, closureNoteDraft, chTasks, actorName);
      setClosureNoteDraft('');
      notify('success', `${charter.charterCode} Closed to Deploy`);
    } catch (err) {
      notify('error', 'Charter closure blocked', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmKra = async (kraId: string, refCode: string, targetVal?: string) => {
    setBusy(true);
    try {
      await confirmKraCompletion(kraId, targetVal || '100%', actorName, true);
      notify('success', `KRA ${refCode} confirmed Completed`, `Verified by ${actorName}.`);
    } catch (err) {
      notify('error', 'KRA confirmation failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateKra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await createBscKraDoc(user.uid, {
        ...kraForm,
        completionStatus: false,
      });
      setShowNewKra(false);
      notify('success', `KRA ${kraForm.refCode} added`);
    } catch (err) {
      notify('error', 'Failed to add KRA', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCharter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await createProjectCharterDoc(user.uid, {
        ...charterForm,
        kraIds: [],
        status: 'Draft',
        opportunity: 'Improves BSC strategic execution governance.',
        risksAssumptions: 'Requires formal approval before task generation.',
        teamSignOff: `Lead: ${charterForm.projectLead} · PM: ${charterForm.projectManager} · Head: ${charterForm.projectHead}`,
        milestones: [
          {
            id: `ms_${Date.now()}`,
            milestoneNumber: 1,
            title: 'Baseline & Scope Alignment',
            dayRangeBucket: '30 Days',
            plannedStart: charterForm.startDate,
            plannedEnd: charterForm.targetDate,
            status: 'Open',
            activities: [
              {
                id: `act_${Date.now()}`,
                title: `Complete Baseline Assessment for ${charterForm.title}`,
                description: 'Initial baseline deliverable from Project Charter.',
                deliverableEvidence: 'Signed Baseline Diagnostic Report (.pdf)',
                phase: 'Baseline',
                responsibleName: charterForm.projectManager,
                accountableName: charterForm.projectLead,
                priority: 'High',
                weight: 20,
                plannedStart: charterForm.startDate,
                plannedEnd: charterForm.targetDate,
              },
            ],
          },
        ],
      });
      setShowNewCharter(false);
      notify('success', `Charter ${charterForm.charterCode} created in Draft`);
    } catch (err) {
      notify('error', 'Failed to create charter', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <BscGovernanceBar
        title="BSC Portfolio Dashboard & Project Charters"
        subtitle="Live roll-up across Perspectives → SOs → KRAs → Project Charters → Governed Tasks (zero hard-coded counts)"
        onCreateTask={() => onCreateTask()}
        extraActions={
          bscCapabilities.canCreateAndAssignTasks ? (
            <>
              <button
                type="button"
                onClick={() => setShowNewKra(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" /> Add KRA
              </button>
              <button
                type="button"
                onClick={() => setShowNewCharter(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" /> Add Charter
              </button>
            </>
          ) : null
        }
      />

      {/* Live Portfolio KPI Strip (§5) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500">Live BSC Structure</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#172B4D] dark:text-white tabular-nums">
            {kpis.totalPerspectives}P · {kpis.totalSos}SO · {kpis.totalKras}KRA
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {kpis.totalCharters} Charters · {kpis.totalTasks} Active Tasks
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500">On-Time Completion %</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#188038] dark:text-emerald-400 tabular-nums">
            {kpis.onTimeCompletionPct}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {kpis.completedTasks} of {kpis.totalTasks} completed
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500">Follow-Up Compliance %</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              kpis.followUpCompliancePct >= bscConfig.followUpComplianceTarget
                ? 'text-[#188038] dark:text-emerald-400'
                : 'text-[#D93025] dark:text-red-400'
            }`}
          >
            {kpis.followUpCompliancePct}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Target ≥ {bscConfig.followUpComplianceTarget}%
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500">Overdue Tasks</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              kpis.overdueCount > 0 ? 'text-[#D93025] dark:text-red-400' : 'text-[#172B4D] dark:text-white'
            }`}
          >
            {kpis.overdueCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {kpis.overduePctOfOpen}% of {kpis.openTasks} open
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500">Approval Turnaround</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#172B4D] dark:text-white tabular-nums">
            {kpis.avgApprovalTurnaroundDays}d
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Submitted → Approved avg</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500">Open Escalations</div>
          <div className="mt-1 font-mono text-sm font-bold text-[#172B4D] dark:text-white flex items-center gap-2 tabular-nums">
            <span className="text-amber-600">L1:{kpis.escalationsByLevel[1]}</span>
            <span className="text-amber-700">L2:{kpis.escalationsByLevel[2]}</span>
            <span className="text-[#D93025]">L3:{kpis.escalationsByLevel[3]}</span>
            <span className="text-[#D93025] font-extrabold">L4:{kpis.escalationsByLevel[4]}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">As of {bscSimulatedDate}</div>
        </div>
      </div>

      {/* KRA Completion Suggestion Banner (Acceptance Criterion #4) */}
      {kpis.krasReadyForCompletionSuggestion.length > 0 && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#188038] dark:text-emerald-400">
            <Sparkles className="w-4 h-4" />
            KRA Completion Ready for PM Confirmation ({kpis.krasReadyForCompletionSuggestion.length})
          </div>
          <div className="space-y-1.5">
            {kpis.krasReadyForCompletionSuggestion.map((kra) => (
              <div
                key={kra.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-emerald-200/70 dark:border-emerald-900/50"
              >
                <div>
                  <span className="font-mono font-bold text-[#1A73E8]">KRA {kra.refCode}</span>{' '}
                  <span className="font-semibold text-[#172B4D] dark:text-white">{kra.title}</span>
                  <span className="text-slate-500 ml-2">All linked tasks Completed</span>
                </div>
                {bscCapabilities.canCreateAndAssignTasks && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleConfirmKra(kra.id, kra.refCode, kra.targetValue)}
                    className="px-3 py-1 rounded-lg bg-[#188038] text-white font-semibold"
                  >
                    Confirm KRA Completed
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State Prompt to Load Toggleable TG-BSC05 Seed */}
      {projectCharters.length === 0 && (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
          <Layers className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-sm font-bold text-[#172B4D] dark:text-white">
            No Turag BSC Project Charters Loaded Yet
          </h2>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            Click <strong>Load TG-BSC05 Seed</strong> above to test the complete Turag BSC workflow
            (Approved charter TG-BSC05 with 10 mixed-state tasks across 15d–365d milestones + Draft
            charter TG-BSC01 + 5-Perspective KRAs), or add a new live KRA and Charter directly.
          </p>
        </div>
      )}

      {/* Project Charters Grouped by the 5 BSC Perspectives */}
      <div className="space-y-4">
        {BSC_PERSPECTIVES.map((perspective) => {
          const pCharters = projectCharters.filter((c) => c.perspective === perspective);
          const pKras = bscKras.filter((k) => k.perspective === perspective);
          if (pCharters.length === 0 && pKras.length === 0) return null;

          return (
            <section
              key={perspective}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-display font-bold uppercase tracking-wider text-[#172B4D] dark:text-white">
                    {perspective}
                  </h2>
                  <span className="font-mono text-[11px] text-slate-500">
                    {pKras.length} KRA(s) · {pCharters.length} Charter(s)
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {pKras.filter((k) => k.completionStatus).length}/{pKras.length} KRAs Completed
                </div>
              </div>

              {pCharters.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">
                  No project charters linked to {perspective} yet ({pKras.length} unlinked KRA(s) listed in Gap List below).
                </div>
              ) : (
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {pCharters.map((ch) => {
                    const chTasks = bscTasks.filter((t) => t.charterId === ch.id);
                    const pct = computeCharterBscProgress(ch.id, bscTasks);
                    const overdue = chTasks.filter((t) => getBscDaysOverdue(t, refDate) > 0).length;
                    const redCount = chTasks.filter(
                      (t) => computeTaskRag(t, bscTasks, refDate) === 'Red'
                    ).length;
                    const charterRag =
                      ch.status === 'Closed'
                        ? 'Blue'
                        : redCount > 0
                          ? 'Red'
                          : overdue > 0
                            ? 'Amber'
                            : chTasks.length > 0
                              ? 'Green'
                              : 'Grey';
                    const nextMs = ch.milestones.find((m) => m.status === 'Open');
                    const isApproved = ch.status === 'Approved' || ch.status === 'Signed-off';

                    return (
                      <div
                        key={ch.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F7F9FC]/60 dark:bg-slate-950/60 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="font-mono font-bold text-[#1A73E8] dark:text-blue-400">
                                {ch.charterCode}
                              </span>
                              <span className="font-mono text-slate-400">({ch.projectCode})</span>
                              <span
                                className={`px-1.5 py-0.5 rounded font-semibold ${
                                  isApproved
                                    ? 'bg-[#188038]/12 text-[#188038]'
                                    : ch.status === 'Closed'
                                      ? 'bg-blue-500/15 text-[#1A73E8]'
                                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {ch.status}
                              </span>
                              <span className="font-mono text-slate-400">Rev {ch.charterRevision}</span>
                            </div>
                            <h3 className="text-sm font-bold text-[#172B4D] dark:text-white mt-1">
                              {ch.title}
                            </h3>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 ${getRagBadgeClasses(
                              charterRag
                            )}`}
                          >
                            {charterRag}
                          </span>
                        </div>

                        {/* Weighted Progress Bar */}
                        <div>
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-slate-500">Weighted Completion</span>
                            <span className="font-mono font-bold text-[#172B4D] dark:text-white tabular-nums">
                              {pct}% ({chTasks.filter((t) => t.status === 'Completed').length}/{chTasks.length} tasks)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-[#1A73E8] rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400 block">Project Lead (A)</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {ch.projectLead}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Overdue Tasks</span>
                            <span
                              className={`font-mono font-bold ${
                                overdue > 0 ? 'text-[#D93025]' : 'text-[#188038]'
                              }`}
                            >
                              {overdue}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Next Milestone</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {nextMs ? `${nextMs.dayRangeBucket} (${nextMs.plannedEnd})` : 'All Closed'}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectCharterId(ch.id);
                              setEditingScope(false);
                              setScopeDraft(ch.scope);
                              setDeliverablesDraft(ch.deliverables);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-[#172B4D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#1A73E8]" />
                            8-Section Charter
                          </button>

                          {bscCapabilities.canCreateAndAssignTasks && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleGenerateTasks(ch)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
                                isApproved
                                  ? 'bg-[#172B4D] dark:bg-[#1A73E8] text-white hover:opacity-90'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {!isApproved && <Lock className="w-3 h-3" />}
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              Generate Tasks from Charter
                            </button>
                          )}

                          {isApproved && bscCapabilities.canCreateAndAssignTasks && (
                            <button
                              type="button"
                              onClick={() => onCreateTask(ch.id)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#1A73E8] hover:bg-blue-50 dark:hover:bg-blue-950/30"
                            >
                              + Add Task
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* KRA Gap List — Unlinked KRAs with No Active Tasks (§5 & Screen 7) */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h2 className="text-xs font-display font-bold uppercase tracking-wider text-[#172B4D] dark:text-white">
              KRA Coverage Gap List — KRAs With No Active Task ({kpis.krasWithNoActiveTask.length})
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">Calculated live from master KRAs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F9FC] dark:bg-slate-950 text-[11px] uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5">KRA Ref</th>
                <th className="px-4 py-2.5">Perspective</th>
                <th className="px-4 py-2.5">SO</th>
                <th className="px-4 py-2.5">KRA Description</th>
                <th className="px-4 py-2.5">Data Owner</th>
                <th className="px-4 py-2.5 text-right">Current / Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {kpis.krasWithNoActiveTask.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    All KRAs have active tasks or are completed.
                  </td>
                </tr>
              ) : (
                kpis.krasWithNoActiveTask.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono font-bold text-[#1A73E8]">{k.refCode}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{k.perspective}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{k.soCode}</td>
                    <td className="px-4 py-2.5 font-medium text-[#172B4D] dark:text-white">{k.title}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{k.dataOwner}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {k.currentValue || '—'} / {k.targetValue || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 8-Section Project Charter Inspector Modal */}
      {inspectedCharter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-[#1A73E8]">{inspectedCharter.charterCode}</span>
                  <span className="text-slate-400">|</span>
                  <span className="font-semibold">{inspectedCharter.perspective}</span>
                  <span className="text-slate-400">|</span>
                  <span className="font-mono">Status: {inspectedCharter.status}</span>
                  <span className="font-mono text-slate-400">Rev {inspectedCharter.charterRevision}</span>
                </div>
                <h2 className="text-base font-display font-bold text-[#172B4D] dark:text-white mt-1">
                  {inspectedCharter.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInspectCharterId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Approval / Scope Revision Action Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-600 dark:text-slate-300">
                  {inspectedCharter.status === 'Draft' || inspectedCharter.status === 'Pending Approval'
                    ? 'Charter is unapproved — task creation & generation are blocked until Approved.'
                    : `Charter is ${inspectedCharter.status}. Editing scope/deliverables flags linked tasks "Charter Changed – Review".`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(inspectedCharter.status === 'Draft' ||
                    inspectedCharter.status === 'Pending Approval') &&
                    bscCapabilities.canApproveL3L4AndClosure && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleApproveCharter(inspectedCharter)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#188038] text-white font-semibold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve Charter (Unlock Tasks)
                      </button>
                    )}

                  {inspectedCharter.status !== 'Closed' && bscCapabilities.canCreateAndAssignTasks && (
                    <button
                      type="button"
                      onClick={() => setEditingScope((v) => !v)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {editingScope ? 'Cancel Scope Edit' : 'Revise Scope / Deliverables'}
                    </button>
                  )}
                </div>
              </div>

              {editingScope && (
                <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2.5">
                  <div className="font-bold text-amber-800 dark:text-amber-300">
                    Revise Approved Charter Scope (Auto-Flags Linked Tasks "Charter Changed – Review")
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">2. Scope</label>
                    <textarea
                      rows={2}
                      value={scopeDraft}
                      onChange={(e) => setScopeDraft(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">5. Deliverables</label>
                    <textarea
                      rows={2}
                      value={deliverablesDraft}
                      onChange={(e) => setDeliverablesDraft(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSaveScopeRevision}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-600 text-white font-semibold"
                  >
                    Save Revision &amp; Flag Tasks
                  </button>
                </div>
              )}

              {/* The 8 Standard Charter Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ['1. Business Need', inspectedCharter.businessNeed],
                  ['2. Scope', inspectedCharter.scope],
                  ['3. Objectives & Goals', inspectedCharter.objectivesGoals],
                  ['4. Opportunity', inspectedCharter.opportunity],
                  ['5. Deliverables', inspectedCharter.deliverables],
                  ['7. Risks & Assumptions', inspectedCharter.risksAssumptions],
                ].map(([heading, content]) => (
                  <div
                    key={heading}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {heading}
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-200 leading-relaxed">
                      {content || '—'}
                    </p>
                  </div>
                ))}
              </div>

              {/* Section 6: Milestones & Closure Gates */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  6. Charter Milestones &amp; Day-Range Tracker ({inspectedCharter.milestones.length})
                </div>
                <div className="space-y-2">
                  {inspectedCharter.milestones.map((ms) => {
                    const msTasks = bscTasks.filter(
                      (t) => t.charterId === inspectedCharter.id && t.milestoneId === ms.id
                    );
                    const msPct = computeMilestoneBscProgress(ms.id, bscTasks);
                    return (
                      <div
                        key={ms.id}
                        className="p-3 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-mono font-bold text-[#1A73E8]">
                              M{String(ms.milestoneNumber).padStart(2, '0')} · {ms.dayRangeBucket}
                            </span>{' '}
                            <span className="font-bold text-[#172B4D] dark:text-white">{ms.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-slate-500">
                              {ms.plannedStart} → {ms.plannedEnd} · <strong>{msPct}%</strong>
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                                ms.status === 'Closed'
                                  ? 'bg-[#188038]/12 text-[#188038]'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {ms.status}
                            </span>
                            {ms.status === 'Open' && bscCapabilities.canApproveSubmissions && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleCloseMilestone(inspectedCharter, ms.id)}
                                className="px-2 py-0.5 rounded bg-[#172B4D] dark:bg-[#1A73E8] text-white text-[11px] font-semibold"
                              >
                                Close Milestone
                              </button>
                            )}
                          </div>
                        </div>

                        {msTasks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msTasks.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setInspectCharterId(null);
                                  setActiveBscTaskId(t.id);
                                }}
                                className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-[#1A73E8] text-[11px] font-mono"
                              >
                                {t.taskCode} · {t.status} ({t.percentComplete}%)
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 8: Team & Sign-off + Close to Deploy */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  8. Governance Team &amp; Sign-Off
                </div>
                <p className="text-slate-700 dark:text-slate-200">{inspectedCharter.teamSignOff}</p>
                {inspectedCharter.closureNote && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-[#188038] dark:text-emerald-300">
                    <strong>Close-to-Deploy Handover Note:</strong> {inspectedCharter.closureNote}
                  </div>
                )}

                {inspectedCharter.status !== 'Closed' && bscCapabilities.canApproveL3L4AndClosure && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={closureNoteDraft}
                      onChange={(e) => setClosureNoteDraft(e.target.value)}
                      placeholder="Close-to-Deploy BAU handover note (requires all tasks Completed/Cancelled)..."
                      className="flex-1 min-w-[240px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleCloseCharter(inspectedCharter)}
                      className="px-3 py-1.5 rounded-lg bg-[#188038] text-white font-semibold"
                    >
                      Close to Deploy
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add KRA Modal */}
      {showNewKra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleCreateKra}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Add Master BSC KRA</h3>
              <button type="button" onClick={() => setShowNewKra(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                required
                placeholder="Ref Code (e.g. 1.2.3)"
                value={kraForm.refCode}
                onChange={(e) => setKraForm({ ...kraForm, refCode: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
              <select
                value={kraForm.perspective}
                onChange={(e) => setKraForm({ ...kraForm, perspective: e.target.value as BscPerspective })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {BSC_PERSPECTIVES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                required
                placeholder="SO Code (e.g. SO-1.2)"
                value={kraForm.soCode}
                onChange={(e) => setKraForm({ ...kraForm, soCode: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
              <input
                required
                placeholder="Data Owner"
                value={kraForm.dataOwner}
                onChange={(e) => setKraForm({ ...kraForm, dataOwner: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <input
              required
              placeholder="Strategic Objective Title"
              value={kraForm.soTitle}
              onChange={(e) => setKraForm({ ...kraForm, soTitle: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              required
              placeholder="KRA Title"
              value={kraForm.title}
              onChange={(e) => setKraForm({ ...kraForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="Unit (%)"
                value={kraForm.unit}
                onChange={(e) => setKraForm({ ...kraForm, unit: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                placeholder="Target"
                value={kraForm.targetValue}
                onChange={(e) => setKraForm({ ...kraForm, targetValue: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                placeholder="Current"
                value={kraForm.currentValue}
                onChange={(e) => setKraForm({ ...kraForm, currentValue: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowNewKra(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
              <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-[#1A73E8] text-white font-semibold">Save KRA</button>
            </div>
          </form>
        </div>
      )}

      {/* Add Charter Modal */}
      {showNewCharter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleCreateCharter}
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Create Draft Project Charter</h3>
              <button type="button" onClick={() => setShowNewCharter(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                required
                placeholder="Charter Code (TG-BSC08)"
                value={charterForm.charterCode}
                onChange={(e) => setCharterForm({ ...charterForm, charterCode: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
              <input
                required
                placeholder="Project Code (P08)"
                value={charterForm.projectCode}
                onChange={(e) => setCharterForm({ ...charterForm, projectCode: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
              <select
                value={charterForm.perspective}
                onChange={(e) => setCharterForm({ ...charterForm, perspective: e.target.value as BscPerspective })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {BSC_PERSPECTIVES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <input
              required
              placeholder="Charter / Project Title"
              value={charterForm.title}
              onChange={(e) => setCharterForm({ ...charterForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <textarea
              rows={2}
              placeholder="1. Business Need"
              value={charterForm.businessNeed}
              onChange={(e) => setCharterForm({ ...charterForm, businessNeed: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <textarea
              rows={2}
              placeholder="2. Scope & Deliverables"
              value={charterForm.scope}
              onChange={(e) => setCharterForm({ ...charterForm, scope: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                type="date"
                value={charterForm.startDate}
                onChange={(e) => setCharterForm({ ...charterForm, startDate: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
              <input
                required
                type="date"
                value={charterForm.targetDate}
                onChange={(e) => setCharterForm({ ...charterForm, targetDate: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowNewCharter(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
              <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-[#1A73E8] text-white font-semibold">Create Draft Charter</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
