import React, { useEffect, useMemo, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BSC_PHASES, BscPhase, FollowUpFrequency } from '../../types/bsc';
import { Priority } from '../../types';
import { generateNextTaskCode } from '../../lib/bscMetrics';
import { createBscTaskDoc } from '../../lib/bscService';

interface BscCreateTaskModalProps {
  open: boolean;
  defaultCharterId?: string;
  onClose: () => void;
}

export const BscCreateTaskModal: React.FC<BscCreateTaskModalProps> = ({
  open,
  defaultCharterId,
  onClose,
}) => {
  const {
    user,
    profile,
    projectCharters,
    bscKras,
    bscTasks,
    employees,
    bscSimulatedDate,
    notify,
  } = useApp();

  const approvedCharters = useMemo(
    () => projectCharters.filter((c) => c.status === 'Approved' || c.status === 'Signed-off'),
    [projectCharters]
  );

  const [charterId, setCharterId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [phase, setPhase] = useState<BscPhase>('Improvement Drives');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliverableEvidence, setDeliverableEvidence] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [accountableName, setAccountableName] = useState('');
  const [priority, setPriority] = useState<Priority>('High');
  const [plannedStart, setPlannedStart] = useState(bscSimulatedDate);
  const [plannedEnd, setPlannedEnd] = useState(bscSimulatedDate);
  const [weight, setWeight] = useState(10);
  const [followUpFrequency, setFollowUpFrequency] = useState<FollowUpFrequency>('Weekly');
  const [selectedKraIds, setSelectedKraIds] = useState<string[]>([]);
  const [selectedPredIds, setSelectedPredIds] = useState<string[]>([]);
  const [assignImmediately, setAssignImmediately] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCharter = useMemo(
    () => approvedCharters.find((c) => c.id === charterId) || approvedCharters[0],
    [approvedCharters, charterId]
  );

  useEffect(() => {
    if (!open) return;
    const ch =
      approvedCharters.find((c) => c.id === defaultCharterId) || approvedCharters[0];
    if (ch) {
      setCharterId(ch.id);
      const firstMs = ch.milestones[0];
      setMilestoneId(firstMs?.id || '');
      setAccountableName(ch.projectLead);
      setResponsibleName(employees[0]?.name || ch.projectManager);
      setSelectedKraIds(ch.kraIds || []);
      setPlannedStart(firstMs?.plannedStart || bscSimulatedDate);
      setPlannedEnd(firstMs?.plannedEnd || bscSimulatedDate);
    }
    setTitle('');
    setDescription('');
    setDeliverableEvidence('');
    setSelectedPredIds([]);
    setAssignImmediately(false);
  }, [open, defaultCharterId, approvedCharters, employees, bscSimulatedDate]);

  if (!open) return null;

  const selectedMilestone =
    selectedCharter?.milestones.find((m) => m.id === milestoneId) ||
    selectedCharter?.milestones[0];

  const previewCode = selectedCharter
    ? generateNextTaskCode(
        selectedCharter.charterCode,
        selectedMilestone?.milestoneNumber || 1,
        bscTasks
      )
    : 'TG-BSC-M01-T001';

  const charterTasks = bscTasks.filter((t) => t.charterId === selectedCharter?.id);
  const peopleOptions = Array.from(
    new Set([
      ...employees.map((e) => e.name),
      ...(selectedCharter
        ? [
            selectedCharter.projectLead,
            selectedCharter.projectManager,
            selectedCharter.projectHead,
            selectedCharter.projectSponsor,
          ]
        : []),
    ])
  ).filter(Boolean);

  const toggleItem = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCharter || !selectedMilestone) return;
    setSaving(true);
    try {
      const res = await createBscTaskDoc(
        user.uid,
        {
          charter: selectedCharter,
          milestoneId: selectedMilestone.id,
          milestoneNumber: selectedMilestone.milestoneNumber,
          kraIds: selectedKraIds,
          phase,
          title,
          description,
          deliverableEvidence,
          responsibleName,
          accountableName,
          priority,
          plannedStart,
          plannedEnd,
          weight,
          predecessorIds: selectedPredIds,
          followUpFrequency,
          assignImmediately,
        },
        bscTasks,
        profile?.displayName || user.displayName || 'BSC PM'
      );
      notify(
        'success',
        `Created ${res.taskCode}`,
        assignImmediately
          ? 'Task assigned immediately with locked baseline dates.'
          : 'Saved in Draft state. Assign when ready to lock baseline.'
      );
      onClose();
    } catch (err) {
      notify('error', 'Failed to create BSC task', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-display font-bold text-[#172B4D] dark:text-white">
              Create Governed BSC Task
            </h2>
            <p className="text-xs text-slate-500">
              Auto-Code: <span className="font-mono font-bold text-[#1A73E8]">{previewCode}</span> · Approved Charters Only
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {approvedCharters.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">
              No Approved or Signed-off Project Charters exist yet. Approve a charter in Portfolio &amp; Charters first.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Approved Project Charter *
                  </label>
                  <select
                    required
                    value={selectedCharter?.id || ''}
                    onChange={(e) => {
                      const next = approvedCharters.find((c) => c.id === e.target.value);
                      setCharterId(e.target.value);
                      if (next) {
                        setMilestoneId(next.milestones[0]?.id || '');
                        setAccountableName(next.projectLead);
                        setSelectedKraIds(next.kraIds || []);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
                  >
                    {approvedCharters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.charterCode} — {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Charter Milestone *
                  </label>
                  <select
                    required
                    value={selectedMilestone?.id || ''}
                    onChange={(e) => {
                      setMilestoneId(e.target.value);
                      const ms = selectedCharter?.milestones.find((m) => m.id === e.target.value);
                      if (ms) {
                        setPlannedStart(ms.plannedStart);
                        setPlannedEnd(ms.plannedEnd);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
                  >
                    {(selectedCharter?.milestones || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        M{String(m.milestoneNumber).padStart(2, '0')} ({m.dayRangeBucket}) — {m.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Task Title *</label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Actionable deliverable title..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Deliverable / Mandatory Evidence Definition *
                </label>
                <input
                  required
                  type="text"
                  value={deliverableEvidence}
                  onChange={(e) => setDeliverableEvidence(e.target.value)}
                  placeholder="e.g., Signed Organogram PDF + HRIS UAT Sign-off Sheet"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Responsible (R — Task Owner) *
                  </label>
                  <select
                    required
                    value={responsibleName}
                    onChange={(e) => setResponsibleName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {peopleOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Accountable (A — Approver) *
                  </label>
                  <select
                    required
                    value={accountableName}
                    onChange={(e) => setAccountableName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {peopleOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Start Date *</label>
                  <input
                    required
                    type="date"
                    value={plannedStart}
                    onChange={(e) => setPlannedStart(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">End Date *</label>
                  <input
                    required
                    type="date"
                    value={plannedEnd}
                    onChange={(e) => setPlannedEnd(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Phase</label>
                  <select
                    value={phase}
                    onChange={(e) => setPhase(e.target.value as BscPhase)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {BSC_PHASES.map((ph) => (
                      <option key={ph} value={ph}>
                        {ph}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Weight (1–100 for Roll-up %)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Follow-Up Cadence
                  </label>
                  <select
                    value={followUpFrequency}
                    onChange={(e) => setFollowUpFrequency(e.target.value as FollowUpFrequency)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly (Default)</option>
                    <option value="Bi-weekly">Bi-weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              </div>

              {/* Linked KRAs */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Linked BSC KRAs
                </label>
                <div className="max-h-24 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                  {bscKras.map((k) => (
                    <label key={k.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedKraIds.includes(k.id)}
                        onChange={() => toggleItem(selectedKraIds, k.id, setSelectedKraIds)}
                      />
                      <span className="font-mono font-bold text-[#1A73E8]">{k.refCode}</span>
                      <span className="truncate">{k.title}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Predecessors */}
              {charterTasks.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Predecessor Tasks (Optional)
                  </label>
                  <div className="max-h-24 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                    {charterTasks.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPredIds.includes(t.id)}
                          onChange={() => toggleItem(selectedPredIds, t.id, setSelectedPredIds)}
                        />
                        <span className="font-mono font-semibold">{t.taskCode}</span>
                        <span className="truncate">{t.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 p-3 rounded-xl bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignImmediately}
                  onChange={(e) => setAssignImmediately(e.target.checked)}
                />
                <Lock className="w-3.5 h-3.5 text-[#1A73E8]" />
                <span className="font-semibold text-[#172B4D] dark:text-white">
                  Assign immediately &amp; lock baseline dates
                </span>
                <span className="text-slate-400">(unchecked = create as Draft)</span>
              </label>
            </>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || approvedCharters.length === 0}
              className="px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : assignImmediately ? 'Create & Lock Baseline' : 'Create Draft Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
