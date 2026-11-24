import React, { useEffect, useMemo, useState } from 'react';
import { Save, ShieldAlert, Sliders } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  computeEscalation,
  getRagBadgeClasses,
  isBscTaskOpen,
  parseDateSafe,
} from '../../lib/bscMetrics';
import { saveBscGovernanceConfig } from '../../lib/bscService';
import { BscGovernanceBar } from '../../components/bsc/BscGovernanceBar';

interface BscEscalationRegisterModuleProps {
  onCreateTask: () => void;
}

export const BscEscalationRegisterModule: React.FC<BscEscalationRegisterModuleProps> = ({
  onCreateTask,
}) => {
  const {
    user,
    projectCharters,
    bscTasks,
    bscConfig,
    bscSimulatedDate,
    bscCapabilities,
    setActiveBscTaskId,
    notify,
  } = useApp();

  const refDate = parseDateSafe(bscSimulatedDate) || new Date();
  const [levelFilter, setLevelFilter] = useState<'ALL' | 1 | 2 | 3 | 4>('ALL');
  const [configForm, setConfigForm] = useState(bscConfig);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    setConfigForm(bscConfig);
  }, [bscConfig]);

  const charterMap = useMemo(
    () => new Map(projectCharters.map((c) => [c.id, c])),
    [projectCharters]
  );

  const escalations = useMemo(() => {
    return bscTasks
      .filter((t) => isBscTaskOpen(t) && t.status !== 'Draft')
      .map((task) => {
        const charter = charterMap.get(task.charterId);
        const esc = computeEscalation(task, charter, bscTasks, bscConfig, refDate);
        return { task, charter, esc };
      })
      .filter((item) => item.esc.level > 0)
      .sort((a, b) => b.esc.level - a.esc.level || b.esc.ageDays - a.esc.ageDays);
  }, [bscTasks, charterMap, bscConfig, refDate]);

  const visibleEscalations = useMemo(
    () =>
      levelFilter === 'ALL'
        ? escalations
        : escalations.filter((e) => e.esc.level === levelFilter),
    [escalations, levelFilter]
  );

  const counts = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
    escalations.forEach((e) => {
      if (e.esc.level >= 1 && e.esc.level <= 4) {
        c[e.esc.level as 1 | 2 | 3 | 4] += 1;
      }
    });
    return c;
  }, [escalations]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingConfig(true);
    try {
      await saveBscGovernanceConfig(user.uid, configForm);
      notify(
        'success',
        'Escalation & Reminder rules saved',
        'Updated thresholds are now active across all BSC screens.'
      );
    } catch (err) {
      notify('error', 'Failed to save rules', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-5">
      <BscGovernanceBar
        title="Escalation Register & Governance Ladder (L1 – L4)"
        subtitle="Automated overdue, blocked, milestone-slip, and Critical-Red escalations with Admin-configurable thresholds"
        onCreateTask={onCreateTask}
      />

      {/* Level Filter Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { id: 'ALL' as const, label: 'All Open Escalations', count: escalations.length, desc: 'Active triggers' },
          { id: 1 as const, label: `Level 1 (+${bscConfig.escalationL1Days}d)`, count: counts[1], desc: 'Notify R & A' },
          { id: 2 as const, label: `Level 2 (+${bscConfig.escalationL2Days}d)`, count: counts[2], desc: 'Notify A & PM (L3)' },
          { id: 3 as const, label: `Level 3 (+${bscConfig.escalationL3Days}d / Blocked)`, count: counts[3], desc: 'Notify PM, Coord & ED (L4)' },
          { id: 4 as const, label: `Level 4 (+${bscConfig.escalationL4Days}d / MS Slip)`, count: counts[4], desc: 'Notify ED (L4) & MD (L5)' },
        ].map((card) => {
          const active = levelFilter === card.id;
          return (
            <button
              key={String(card.id)}
              type="button"
              onClick={() => setLevelFilter(card.id)}
              className={`p-3.5 rounded-xl border text-left transition-colors ${
                active
                  ? 'border-[#1A73E8] bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
              }`}
            >
              <div className="text-[11px] font-semibold text-slate-500">{card.label}</div>
              <div
                className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                  card.id === 3 || card.id === 4 ? 'text-[#D93025]' : 'text-[#172B4D] dark:text-white'
                }`}
              >
                {card.count}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{card.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Escalations Register Table */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-bold text-[#172B4D] dark:text-white">
            <ShieldAlert className="w-4 h-4 text-[#D93025]" />
            <span>Open Escalation Register ({visibleEscalations.length})</span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">Evaluated as of {bscSimulatedDate}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Level</th>
                <th className="px-4 py-2.5">Task &amp; Charter</th>
                <th className="px-4 py-2.5">RAG</th>
                <th className="px-4 py-2.5">Age</th>
                <th className="px-4 py-2.5">Trigger Reason</th>
                <th className="px-4 py-2.5">Owner (R) / Accountable (A)</th>
                <th className="px-4 py-2.5">Escalated To (Ladder)</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleEscalations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No open escalations at this level for {bscSimulatedDate}. Advance the Simulated Date above (+3d / +7d / +15d) to test L1–L4 escalations live.
                  </td>
                </tr>
              ) : (
                visibleEscalations.map(({ task, esc }) => (
                  <tr
                    key={task.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                          esc.level >= 3
                            ? 'bg-[#D93025]/12 text-[#D93025]'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        L{esc.level}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setActiveBscTaskId(task.id)}
                        className="font-mono font-bold text-[#1A73E8] hover:underline block"
                      >
                        {task.taskCode}
                      </button>
                      <span className="font-medium text-[#172B4D] dark:text-white">{task.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${getRagBadgeClasses(esc.rag)}`}>
                        {esc.rag}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[#D93025] tabular-nums">
                      {esc.ageDays}d
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[240px]">
                      {esc.triggers.join(' · ')}
                    </td>
                    <td className="px-4 py-3 text-[11px]">
                      <div className="font-semibold text-[#172B4D] dark:text-white">
                        R: {task.responsibleName}
                      </div>
                      <div className="text-slate-500">A: {task.accountableName}</div>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600 dark:text-slate-300">
                      {esc.notifyPeople.join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveBscTaskId(task.id)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold hover:border-[#1A73E8]"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Admin Escalation & Reminder Threshold Configuration (§6) */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 bg-[#F7F9FC] dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-bold text-[#172B4D] dark:text-white">
            <Sliders className="w-4 h-4 text-[#1A73E8]" />
            <span>Admin Escalation Thresholds, Digest Schedule &amp; Notification Channels (§6)</span>
          </div>
          {!bscCapabilities.canConfigureAdmin && (
            <span className="text-[11px] text-amber-600 font-medium">
              Switch Acting Role to Admin to modify rules
            </span>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="p-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { key: 'reminderDaysBeforeDue', label: 'Pre-Due Reminder (d)' },
              { key: 'escalationL1Days', label: 'L1 Overdue (d)' },
              { key: 'escalationL2Days', label: 'L2 Overdue (d)' },
              { key: 'escalationL3Days', label: 'L3 Overdue (d)' },
              { key: 'escalationL4Days', label: 'L4 Overdue (d)' },
              { key: 'blockedEscalationDays', label: 'Blocked > (d)' },
              { key: 'followUpComplianceTarget', label: 'Compliance Target (%)' },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-[11px] text-slate-500 mb-1">{field.label}</label>
                <input
                  type="number"
                  disabled={!bscCapabilities.canConfigureAdmin}
                  value={configForm[field.key as keyof typeof configForm] as number}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      [field.key]: Number(e.target.value),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 font-mono disabled:opacity-60"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Daily Digest:</span>
                <input
                  type="time"
                  disabled={!bscCapabilities.canConfigureAdmin}
                  value={configForm.dailyDigestTime}
                  onChange={(e) => setConfigForm({ ...configForm, dailyDigestTime: e.target.value })}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 font-mono"
                />
                <span className="font-mono text-slate-500">{configForm.dailyDigestTimezone}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {(['inApp', 'email', 'whatsapp', 'sms'] as const).map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!bscCapabilities.canConfigureAdmin}
                      checked={configForm.channels[ch]}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          channels: { ...configForm.channels, [ch]: e.target.checked },
                        })
                      }
                    />
                    <span className="font-medium">
                      {ch === 'inApp'
                        ? 'In-App'
                        : ch === 'email'
                          ? 'Email'
                          : ch === 'whatsapp'
                            ? 'WhatsApp Hook'
                            : 'SMS Hook'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {bscCapabilities.canConfigureAdmin && (
              <button
                type="submit"
                disabled={savingConfig}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingConfig ? 'Saving…' : 'Save Governance Config'}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
};
