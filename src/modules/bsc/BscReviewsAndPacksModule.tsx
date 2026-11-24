import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ReviewMeetingType } from '../../types/bsc';
import { parseDateSafe } from '../../lib/bscMetrics';
import {
  buildMonthlyReviewPack,
  buildQuarterlyBoardPack,
  exportMonthlyPackToExcel,
  exportMonthlyPackToPdf,
  exportQuarterlyPackToExcel,
  exportQuarterlyPackToPdf,
} from '../../lib/bscExportUtils';
import { createReviewMeetingWithTasks, deleteReviewMeetingDoc } from '../../lib/bscService';
import { BscGovernanceBar } from '../../components/bsc/BscGovernanceBar';

interface BscReviewsAndPacksModuleProps {
  onCreateTask: () => void;
}

const MEETING_TYPES: ReviewMeetingType[] = [
  'Monthly Project Review',
  'Quarterly BSC Review',
  'Half-Year BP Review',
  'Yearly Review',
];

export const BscReviewsAndPacksModule: React.FC<BscReviewsAndPacksModuleProps> = ({
  onCreateTask,
}) => {
  const {
    user,
    profile,
    bscKras,
    projectCharters,
    bscTasks,
    bscFollowUps,
    dateChangeRequests,
    reviewMeetings,
    employees,
    bscConfig,
    bscSimulatedDate,
    bscCapabilities,
    setActiveBscTaskId,
    notify,
  } = useApp();

  const refDate = parseDateSafe(bscSimulatedDate) || new Date();
  const actorName = profile?.displayName || user?.displayName || 'BSC PM';

  const [activeTab, setActiveTab] = useState<'packs' | 'meetings'>('packs');
  const [selectedCharterId, setSelectedCharterId] = useState<string>(
    projectCharters[0]?.id || ''
  );

  // Review Meeting Creation State
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [mType, setMType] = useState<ReviewMeetingType>('Monthly Project Review');
  const [mTitle, setMTitle] = useState('');
  const [mDate, setMDate] = useState(bscSimulatedDate);
  const [mAttendees, setMAttendees] = useState(
    'Md. Rashedul Hasan, Humayon Mostaque, Md. Ashiful Alam, Shaymol Sarker'
  );
  const [mMinutes, setMMinutes] = useState('');
  const [mDecisions, setMDecisions] = useState('');
  const [actionDrafts, setActionDrafts] = useState<
    {
      charterId: string;
      kraId: string;
      issue: string;
      action: string;
      owner: string;
      dueDate: string;
    }[]
  >([]);
  const [saving, setSaving] = useState(false);

  const activeCharter = useMemo(
    () =>
      projectCharters.find((c) => c.id === selectedCharterId) || projectCharters[0] || null,
    [projectCharters, selectedCharterId]
  );

  const approvedCharters = useMemo(
    () => projectCharters.filter((c) => c.status === 'Approved' || c.status === 'Signed-off'),
    [projectCharters]
  );

  const monthlyPack = useMemo(
    () =>
      activeCharter
        ? buildMonthlyReviewPack(
            activeCharter,
            bscTasks,
            bscFollowUps,
            dateChangeRequests,
            reviewMeetings,
            refDate
          )
        : null,
    [activeCharter, bscTasks, bscFollowUps, dateChangeRequests, reviewMeetings, refDate]
  );

  const quarterlyPack = useMemo(
    () =>
      buildQuarterlyBoardPack(
        bscKras,
        projectCharters,
        bscTasks,
        bscFollowUps,
        bscConfig,
        refDate
      ),
    [bscKras, projectCharters, bscTasks, bscFollowUps, bscConfig, refDate]
  );

  const addActionRow = () => {
    const defaultCh = approvedCharters[0];
    setActionDrafts((prev) => [
      ...prev,
      {
        charterId: defaultCh?.id || '',
        kraId: defaultCh?.kraIds?.[0] || '',
        issue: '',
        action: '',
        owner: employees[0]?.name || defaultCh?.projectLead || '',
        dueDate: bscSimulatedDate,
      },
    ]);
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const validActions = actionDrafts.filter((a) => a.action.trim());
      const res = await createReviewMeetingWithTasks(
        user.uid,
        {
          type: mType,
          title: mTitle,
          date: mDate,
          attendees: mAttendees
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          minutes: mMinutes,
          decisions: mDecisions,
          actionItems: validActions,
        },
        projectCharters,
        bscTasks,
        actorName
      );
      setShowMeetingForm(false);
      setMTitle('');
      setMMinutes('');
      setMDecisions('');
      setActionDrafts([]);
      notify(
        'success',
        'Review Meeting recorded',
        res.tasksCreated > 0
          ? `Auto-converted ${res.tasksCreated} action item(s) into governed BSC tasks.`
          : 'Meeting minutes & decisions archived.'
      );
    } catch (err) {
      notify('error', 'Failed to record meeting', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <BscGovernanceBar
        title="Monthly & Quarterly Review Packs + Review Meetings"
        subtitle="One-click PDF & Excel Board/Project Packs + Review Meetings that auto-convert Action Items into governed tasks"
        onCreateTask={onCreateTask}
      />

      {/* Tab Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'packs', label: 'Screen 8 · Monthly & Quarterly Review Packs' },
          { id: 'meetings', label: `Screen 9 · Review Meetings & Action Items (${reviewMeetings.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#1A73E8] text-[#1A73E8] dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'packs' && (
        <div className="space-y-5">
          {/* Monthly Project Review Pack */}
          <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="w-4 h-4 text-[#1A73E8]" />
                <span className="text-xs font-bold text-[#172B4D] dark:text-white">
                  Monthly Project Review Pack
                </span>
                <select
                  value={activeCharter?.id || ''}
                  onChange={(e) => setSelectedCharterId(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                >
                  {projectCharters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.charterCode} — {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {monthlyPack && bscCapabilities.canGeneratePacks && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportMonthlyPackToPdf(monthlyPack)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172B4D] dark:bg-[#1A73E8] text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => exportMonthlyPackToExcel(monthlyPack)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#188038] dark:text-emerald-400"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Export Excel
                  </button>
                </div>
              )}
            </div>

            {!monthlyPack ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Load TG-BSC05 Seed or create a Project Charter to generate a Monthly Review Pack.
              </div>
            ) : (
              <div className="p-4 space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                  {[
                    ['Weighted %', `${monthlyPack.charterProgressPct}%`],
                    ['Completed (30d)', String(monthlyPack.completedLastMonth.length)],
                    ['Due Next (30d)', String(monthlyPack.dueNextMonth.length)],
                    ['Overdue / Slipped', String(monthlyPack.overdueOrSlipped.length)],
                    ['Blockers', String(monthlyPack.blockers.length)],
                    ['Decisions Needed', String(monthlyPack.decisionsNeeded.length)],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="p-2.5 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                    >
                      <div className="text-[10px] text-slate-500">{k}</div>
                      <div className="font-mono text-base font-bold text-[#172B4D] dark:text-white mt-0.5 tabular-nums">
                        {v}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Overdue & Slipped */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-bold text-[#D93025] uppercase text-[11px] tracking-wider">
                      Overdue &amp; Slipped Tasks With Reasons ({monthlyPack.overdueOrSlipped.length})
                    </div>
                    {monthlyPack.overdueOrSlipped.length === 0 ? (
                      <p className="text-slate-400">No overdue or slipped tasks.</p>
                    ) : (
                      monthlyPack.overdueOrSlipped.map((o) => (
                        <div
                          key={o.task.id}
                          className="p-2.5 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800"
                        >
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setActiveBscTaskId(o.task.id)}
                              className="font-mono font-bold text-[#1A73E8] hover:underline"
                            >
                              {o.task.taskCode}
                            </button>
                            <span className="font-mono text-[11px] text-[#D93025] font-bold">
                              Overdue {o.daysOverdue}d · Slip {o.slippageDays >= 0 ? `+${o.slippageDays}d` : `${o.slippageDays}d`}
                            </span>
                          </div>
                          <div className="font-semibold mt-0.5">{o.task.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Reason: {o.reason}</div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Decisions Needed & Blockers */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-bold text-[#172B4D] dark:text-white uppercase text-[11px] tracking-wider">
                      Decisions Needed &amp; Blockers ({monthlyPack.decisionsNeeded.length})
                    </div>
                    {monthlyPack.decisionsNeeded.length === 0 ? (
                      <p className="text-slate-400">No executive decisions pending.</p>
                    ) : (
                      <ul className="space-y-1.5 list-decimal list-inside text-slate-700 dark:text-slate-200">
                        {monthlyPack.decisionsNeeded.map((d, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {d}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Completed Last Month */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-bold text-[#188038] uppercase text-[11px] tracking-wider">
                      Completed Last 30 Days ({monthlyPack.completedLastMonth.length})
                    </div>
                    {monthlyPack.completedLastMonth.length === 0 ? (
                      <p className="text-slate-400">No completions in the last 30 days.</p>
                    ) : (
                      monthlyPack.completedLastMonth.map((t) => (
                        <div key={t.id} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <button
                            type="button"
                            onClick={() => setActiveBscTaskId(t.id)}
                            className="text-left hover:underline"
                          >
                            <span className="font-mono font-bold text-[#1A73E8] mr-1.5">{t.taskCode}</span>
                            <span>{t.title}</span>
                          </button>
                          <span className="font-mono text-[11px] text-slate-500">{t.actualEnd || t.plannedEnd}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Due Next Month */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-bold text-[#1A73E8] uppercase text-[11px] tracking-wider">
                      Due Next 30 Days ({monthlyPack.dueNextMonth.length})
                    </div>
                    {monthlyPack.dueNextMonth.length === 0 ? (
                      <p className="text-slate-400">No tasks due in the next 30 days.</p>
                    ) : (
                      monthlyPack.dueNextMonth.map((t) => (
                        <div key={t.id} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <button
                            type="button"
                            onClick={() => setActiveBscTaskId(t.id)}
                            className="text-left hover:underline"
                          >
                            <span className="font-mono font-bold text-[#1A73E8] mr-1.5">{t.taskCode}</span>
                            <span>{t.title}</span>
                          </button>
                          <span className="font-mono text-[11px] text-slate-500">
                            {t.plannedEnd} ({t.percentComplete}%)
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Quarterly Board Pack — 5 Perspectives Roll-up */}
          <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#172B4D] dark:text-white">
                Quarterly Board Review Pack — Rolled Up Across All 5 BSC Perspectives
              </div>
              {bscCapabilities.canGeneratePacks && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportQuarterlyPackToPdf(quarterlyPack)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172B4D] dark:bg-[#1A73E8] text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Board Pack PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => exportQuarterlyPackToExcel(quarterlyPack)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#188038] dark:text-emerald-400"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Board Pack Excel
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5">BSC Perspective</th>
                    <th className="px-4 py-2.5 text-right">SOs</th>
                    <th className="px-4 py-2.5 text-right">KRAs</th>
                    <th className="px-4 py-2.5 text-right">KRAs Done</th>
                    <th className="px-4 py-2.5 text-right">Charters</th>
                    <th className="px-4 py-2.5 text-right">Avg %</th>
                    <th className="px-4 py-2.5 text-right">Open Tasks</th>
                    <th className="px-4 py-2.5 text-right">Overdue</th>
                    <th className="px-4 py-2.5 text-right">Red</th>
                    <th className="px-4 py-2.5 text-right">L3/L4 Esc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                  {quarterlyPack.perspectiveRows.map((row) => (
                    <tr key={row.perspective} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-sans font-semibold text-[#172B4D] dark:text-white">
                        {row.perspective}
                      </td>
                      <td className="px-4 py-2.5 text-right">{row.soCount}</td>
                      <td className="px-4 py-2.5 text-right">{row.kraCount}</td>
                      <td className="px-4 py-2.5 text-right text-[#188038] font-bold">{row.krasCompleted}</td>
                      <td className="px-4 py-2.5 text-right">{row.chartersCount}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-[#1A73E8]">{row.avgProgressPct}%</td>
                      <td className="px-4 py-2.5 text-right">{row.openTasks}</td>
                      <td className={`px-4 py-2.5 text-right ${row.overdueTasks > 0 ? 'text-[#D93025] font-bold' : ''}`}>
                        {row.overdueTasks}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${row.redTasks > 0 ? 'text-[#D93025] font-bold' : ''}`}>
                        {row.redTasks}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${row.escalationsL3L4 > 0 ? 'text-[#D93025] font-bold' : ''}`}>
                        {row.escalationsL3L4}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'meetings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Every Action Item recorded under an Approved Charter is automatically converted into an active governed BSC Task.
            </p>
            {bscCapabilities.canCreateAndAssignTasks && (
              <button
                type="button"
                onClick={() => {
                  setShowMeetingForm(true);
                  setMDate(bscSimulatedDate);
                  if (actionDrafts.length === 0 && approvedCharters[0]) {
                    setActionDrafts([
                      {
                        charterId: approvedCharters[0].id,
                        kraId: approvedCharters[0].kraIds?.[0] || '',
                        issue: '',
                        action: '',
                        owner: employees[0]?.name || approvedCharters[0].projectLead,
                        dueDate: bscSimulatedDate,
                      },
                    ]);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Record Review Meeting
              </button>
            )}
          </div>

          {reviewMeetings.length === 0 ? (
            <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
              No BSC Review Meetings recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {reviewMeetings.map((rm) => (
                <div
                  key={rm.id}
                  className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-[#1A73E8]/12 text-[#1A73E8] font-semibold">
                          {rm.type}
                        </span>
                        <span className="font-mono text-slate-500">{rm.date}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#172B4D] dark:text-white mt-1">
                        {rm.title}
                      </h3>
                    </div>
                    {bscCapabilities.canCreateAndAssignTasks && (
                      <button
                        type="button"
                        onClick={() => deleteReviewMeetingDoc(rm.id)}
                        className="p-1.5 rounded text-slate-400 hover:text-[#D93025]"
                        aria-label="Delete review meeting"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500">
                    <strong>Attendees:</strong> {(rm.attendees || []).join(', ') || '—'}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Minutes</div>
                      <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-200">
                        {rm.minutes || '—'}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Decisions</div>
                      <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-200">
                        {rm.decisions || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Action Items ({(rm.actionItems || []).length})
                    </div>
                    {(rm.actionItems || []).length === 0 ? (
                      <p className="text-slate-400">No action items recorded.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-lg">
                        {rm.actionItems.map((ai) => (
                          <div key={ai.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-[#172B4D] dark:text-white">
                                {ai.action}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Issue: {ai.issue || '—'} · Owner: {ai.owner} · Due:{' '}
                                <span className="font-mono">{ai.dueDate}</span>
                              </div>
                            </div>
                            {ai.convertedTaskId ? (
                              <button
                                type="button"
                                onClick={() => setActiveBscTaskId(ai.convertedTaskId!)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#188038]/12 text-[#188038] font-mono font-bold text-[11px] hover:underline"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                {ai.convertedTaskCode || 'Open Linked Task'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-amber-600 font-semibold">
                                Open (No Approved Charter)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Record Review Meeting Modal */}
      {showMeetingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleCreateMeeting}
            className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-[#1A73E8]" />
                <h3 className="text-sm font-bold text-[#172B4D] dark:text-white">
                  Record BSC Review Meeting &amp; Auto-Create Action Tasks
                </h3>
              </div>
              <button type="button" onClick={() => setShowMeetingForm(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Review Cadence</label>
                  <select
                    value={mType}
                    onChange={(e) => setMType(e.target.value as ReviewMeetingType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
                  >
                    {MEETING_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Meeting Title *</label>
                  <input
                    required
                    value={mTitle}
                    onChange={(e) => setMTitle(e.target.value)}
                    placeholder="e.g., December First-Week Monthly BSC Review"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Meeting Date *</label>
                  <input
                    required
                    type="date"
                    value={mDate}
                    onChange={(e) => setMDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Attendees (comma-separated)
                  </label>
                  <input
                    value={mAttendees}
                    onChange={(e) => setMAttendees(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Meeting Minutes</label>
                  <textarea
                    rows={3}
                    value={mMinutes}
                    onChange={(e) => setMMinutes(e.target.value)}
                    placeholder="Key review findings, KRA variance discussion..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Executive Decisions</label>
                  <textarea
                    rows={3}
                    value={mDecisions}
                    onChange={(e) => setMDecisions(e.target.value)}
                    placeholder="Formal MD / ED / Board decisions..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              {/* Dynamic Action Items -> Auto-Convert to Governed BscTasks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#172B4D] dark:text-white">
                    Action Items (Auto-Converted to Governed BSC Tasks on Save)
                  </span>
                  <button
                    type="button"
                    onClick={addActionRow}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-[#1A73E8]"
                  >
                    <Plus className="w-3 h-3" /> Add Action Item
                  </button>
                </div>

                {actionDrafts.map((row, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={row.charterId}
                        onChange={(e) => {
                          const next = [...actionDrafts];
                          next[idx].charterId = e.target.value;
                          setActionDrafts(next);
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        {approvedCharters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.charterCode} ({c.projectCode})
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Owner (R)"
                        value={row.owner}
                        onChange={(e) => {
                          const next = [...actionDrafts];
                          next[idx].owner = e.target.value;
                          setActionDrafts(next);
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => {
                          const next = [...actionDrafts];
                          next[idx].dueDate = e.target.value;
                          setActionDrafts(next);
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        placeholder="Issue / Variance identified..."
                        value={row.issue}
                        onChange={(e) => {
                          const next = [...actionDrafts];
                          next[idx].issue = e.target.value;
                          setActionDrafts(next);
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <div className="flex gap-1.5">
                        <input
                          required
                          placeholder="Action Item Title (becomes BSC Task) *"
                          value={row.action}
                          onChange={(e) => {
                            const next = [...actionDrafts];
                            next[idx].action = e.target.value;
                            setActionDrafts(next);
                          }}
                          className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setActionDrafts((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1.5 text-slate-400 hover:text-[#D93025]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMeetingForm(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#1A73E8] text-white text-xs font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving & Converting…' : 'Save Meeting & Auto-Create Tasks'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
