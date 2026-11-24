import React, { useState } from 'react';
import { addDays, format } from 'date-fns';
import { Calendar, Database, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BscActingRole } from '../../types/bsc';
import { parseDateSafe } from '../../lib/bscMetrics';

const ACTING_ROLES: BscActingRole[] = [
  'Admin',
  'Sponsor (MD) / Board',
  'Project Head (ED)',
  'Project Manager / Coordinator',
  'Project Lead (A)',
  'Task Owner (R)',
  'Consulted / Informed',
];

interface BscGovernanceBarProps {
  title: string;
  subtitle: string;
  onCreateTask?: () => void;
  extraActions?: React.ReactNode;
}

export const BscGovernanceBar: React.FC<BscGovernanceBarProps> = ({
  title,
  subtitle,
  onCreateTask,
  extraActions,
}) => {
  const {
    projectCharters,
    bscTasks,
    bscSimulatedDate,
    setBscSimulatedDate,
    bscActingRole,
    setBscActingRole,
    bscCapabilities,
    seedTuragBsc,
    clearTuragBsc,
    confirm,
  } = useApp();

  const [seeding, setSeeding] = useState(false);

  const hasDemoData =
    projectCharters.some((c) => c.isDemo) || bscTasks.some((t) => t.isDemo);
  const hasApprovedCharter = projectCharters.some(
    (c) => c.status === 'Approved' || c.status === 'Signed-off'
  );

  const shiftSimDate = (deltaDays: number) => {
    const base = parseDateSafe(bscSimulatedDate) || new Date();
    setBscSimulatedDate(format(addDays(base, deltaDays), 'yyyy-MM-dd'));
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedTuragBsc();
    } finally {
      setSeeding(false);
    }
  };

  const handleClearSeed = async () => {
    const ok = await confirm({
      title: 'Clear TG-BSC05 Demo Seed Data?',
      description:
        'This removes only the toggleable TG-BSC05 demo seed records. Any live charters, tasks, or existing Task Master records will remain untouched.',
      confirmLabel: 'Clear Seed Data',
      tone: 'danger',
    });
    if (!ok) return;
    setSeeding(true);
    try {
      await clearTuragBsc();
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#1A73E8] dark:text-blue-400">
            <span>Turag Garments &amp; Hosiery Mills Ltd. · BSC Execution</span>
          </div>
          <h1 className="text-xl font-display font-bold tracking-tight text-[#172B4D] dark:text-white mt-0.5">
            {title}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {extraActions}
          {!hasDemoData ? (
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeed}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#172B4D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5 text-[#1A73E8]" />
              {seeding ? 'Seeding…' : 'Load TG-BSC05 Seed'}
            </button>
          ) : (
            <button
              type="button"
              disabled={seeding}
              onClick={handleClearSeed}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#D93025] hover:border-[#D93025]/40 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {seeding ? 'Clearing…' : 'Clear Seed'}
            </button>
          )}

          {onCreateTask && bscCapabilities.canCreateAndAssignTasks && (
            <button
              type="button"
              onClick={onCreateTask}
              disabled={!hasApprovedCharter}
              title={
                hasApprovedCharter
                  ? 'Create a governed BSC task under an Approved charter'
                  : 'Approve a Project Charter first before creating tasks'
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              New BSC Task
            </button>
          )}
        </div>
      </div>

      {/* Interactive Governance Controls: Simulated Date (§6 test) & Acting Role (§8 test) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-500 dark:text-slate-400 font-medium">Simulated Date:</span>
          <input
            type="date"
            aria-label="Simulated Date for BSC Reminders and Escalations"
            value={bscSimulatedDate}
            onChange={(e) => setBscSimulatedDate(e.target.value)}
            className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 font-mono text-xs text-[#172B4D] dark:text-slate-100"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBscSimulatedDate(format(new Date(), 'yyyy-MM-dd'))}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300"
            >
              Today
            </button>
            {[3, 7, 15].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => shiftSimDate(d)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[11px] text-slate-600 dark:text-slate-300"
              >
                +{d}d
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-[#188038] dark:text-emerald-400 shrink-0" />
          <span className="text-slate-500 dark:text-slate-400 font-medium">Acting Role (§8):</span>
          <select
            aria-label="Acting BSC Governance Role"
            value={bscActingRole}
            onChange={(e) => setBscActingRole(e.target.value as BscActingRole)}
            className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950 text-xs font-semibold text-[#172B4D] dark:text-slate-100"
          >
            {ACTING_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
