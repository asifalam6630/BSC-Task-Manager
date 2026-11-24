import React, { useMemo, useState } from 'react';
import { Filter, Lock, Paperclip } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  BSC_BOARD_COLUMNS,
  BSC_PHASES,
  BscPhase,
  BscTask,
  BscTaskStatus,
  RagStatus,
} from '../../types/bsc';
import {
  computeTaskRag,
  getBscDaysOverdue,
  getRagBadgeClasses,
  isWorkflowTransitionAllowed,
  parseDateSafe,
} from '../../lib/bscMetrics';
import { assignBscTask, transitionBscTaskStatus } from '../../lib/bscService';
import { BscGovernanceBar } from '../../components/bsc/BscGovernanceBar';

interface BscTaskBoardModuleProps {
  onCreateTask: () => void;
}

const CORE_COLUMNS: BscTaskStatus[] = [
  'Draft',
  'Assigned',
  'Query Raised',
  'Accepted',
  'In Progress',
  'Blocked',
  'Submitted for Review',
  'Returned',
  'Completed',
];

export const BscTaskBoardModule: React.FC<BscTaskBoardModuleProps> = ({ onCreateTask }) => {
  const {
    profile,
    user,
    bscKras,
    projectCharters,
    bscTasks,
    bscSimulatedDate,
    setActiveBscTaskId,
    notify,
  } = useApp();

  const refDate = parseDateSafe(bscSimulatedDate) || new Date();
  const actorName = profile?.displayName || user?.displayName || 'BSC PM';

  const [charterFilter, setCharterFilter] = useState('ALL');
  const [phaseFilter, setPhaseFilter] = useState<BscPhase | 'ALL'>('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');
  const [kraFilter, setKraFilter] = useState('ALL');
  const [ragFilter, setRagFilter] = useState<RagStatus | 'ALL'>('ALL');
  const [showAllCols, setShowAllCols] = useState(false);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BscTaskStatus | null>(null);

  const owners = useMemo(
    () => Array.from(new Set(bscTasks.map((t) => t.responsibleName))).sort(),
    [bscTasks]
  );

  const filteredTasks = useMemo(() => {
    return bscTasks.filter((t) => {
      if (charterFilter !== 'ALL' && t.charterId !== charterFilter) return false;
      if (phaseFilter !== 'ALL' && t.phase !== phaseFilter) return false;
      if (ownerFilter !== 'ALL' && t.responsibleName !== ownerFilter) return false;
      if (kraFilter !== 'ALL' && !(t.kraIds || []).includes(kraFilter)) return false;
      if (ragFilter !== 'ALL' && computeTaskRag(t, bscTasks, refDate) !== ragFilter) return false;
      return true;
    });
  }, [bscTasks, charterFilter, phaseFilter, ownerFilter, kraFilter, ragFilter, refDate]);

  const visibleColumns = showAllCols ? BSC_BOARD_COLUMNS : CORE_COLUMNS;

  const handleDropOnColumn = async (targetCol: BscTaskStatus) => {
    setDragOverCol(null);
    if (!draggedTaskId) return;
    const task = bscTasks.find((t) => t.id === draggedTaskId);
    setDraggedTaskId(null);
    if (!task || task.status === targetCol) return;

    if (!isWorkflowTransitionAllowed(task.status, targetCol)) {
      notify(
        'error',
        'Workflow Gate Blocked Drag',
        `Illegal move: "${task.status}" → "${targetCol}" is not allowed. Open Task Detail to follow governed steps.`
      );
      return;
    }

    // Special case: Draft -> Assigned locks baseline
    if (task.status === 'Draft' && targetCol === 'Assigned') {
      const charter = projectCharters.find((c) => c.id === task.charterId);
      try {
        await assignBscTask(task, charter, actorName, bscSimulatedDate);
        notify('success', `${task.taskCode} Assigned`, 'Baseline dates permanently locked.');
      } catch (err) {
        notify('error', 'Cannot Assign', err instanceof Error ? err.message : 'Unknown error');
      }
      return;
    }

    // States needing mandatory reason/comment open the Detail Drawer so the user enters it cleanly
    const reasonStates: BscTaskStatus[] = [
      'Returned',
      'Query Raised',
      'Blocked',
      'On Hold',
      'Cancelled',
    ];
    if (reasonStates.includes(targetCol)) {
      setActiveBscTaskId(task.id);
      notify(
        'info',
        `Reason required for "${targetCol}"`,
        `Opened ${task.taskCode} so you can record the mandatory reason/comment.`
      );
      return;
    }

    try {
      await transitionBscTaskStatus(task, {
        targetStatus: targetCol,
        actorName,
        todayStr: bscSimulatedDate,
        allTasks: bscTasks,
      });
      notify('success', `${task.taskCode} → ${targetCol}`);
    } catch (err) {
      notify('error', 'Transition Blocked', err instanceof Error ? err.message : 'Unknown error');
      setActiveBscTaskId(task.id);
    }
  };

  return (
    <div className="space-y-4">
      <BscGovernanceBar
        title="Project Task Board (Workflow-Gated Kanban)"
        subtitle="Drag-and-drop enforces §4.1 transitions, baseline locks, predecessor checks, and evidence gates"
        onCreateTask={onCreateTask}
      />

      {/* Multi-Facet Filter Bar */}
      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
        <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <select
          value={charterFilter}
          onChange={(e) => setCharterFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="ALL">All Charters</option>
          {projectCharters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.charterCode} — {c.title.slice(0, 32)}
            </option>
          ))}
        </select>

        <select
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value as BscPhase | 'ALL')}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="ALL">All 7 Phases</option>
          {BSC_PHASES.map((ph) => (
            <option key={ph} value={ph}>
              {ph}
            </option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="ALL">All Owners (R)</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={kraFilter}
          onChange={(e) => setKraFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="ALL">All KRAs</option>
          {bscKras.map((k) => (
            <option key={k.id} value={k.id}>
              KRA {k.refCode} — {k.title.slice(0, 28)}
            </option>
          ))}
        </select>

        <select
          value={ragFilter}
          onChange={(e) => setRagFilter(e.target.value as RagStatus | 'ALL')}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          <option value="ALL">All RAG</option>
          <option value="Red">Red</option>
          <option value="Amber">Amber</option>
          <option value="Green">Green</option>
          <option value="Blue">Blue (Done)</option>
          <option value="Grey">Grey (Draft)</option>
        </select>

        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showAllCols}
            onChange={(e) => setShowAllCols(e.target.checked)}
          />
          Show On Hold &amp; Cancelled
        </label>
      </div>

      {/* Horizontal Scrollable Kanban Columns */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {visibleColumns.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col);
          const isOver = dragOverCol === col;
          return (
            <div
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverCol !== col) setDragOverCol(col);
              }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDropOnColumn(col)}
              className={`w-[272px] shrink-0 rounded-xl border flex flex-col max-h-[68vh] transition-colors ${
                isOver
                  ? 'border-[#1A73E8] bg-blue-50/40 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950'
              }`}
            >
              <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-[#172B4D] dark:text-white">{col}</span>
                <span className="font-mono text-[11px] font-bold text-slate-500">{colTasks.length}</span>
              </div>

              <div className="p-2.5 space-y-2.5 overflow-y-auto flex-1">
                {colTasks.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-slate-400">No tasks</div>
                ) : (
                  colTasks.map((t: BscTask) => {
                    const rag = computeTaskRag(t, bscTasks, refDate);
                    const overdue = getBscDaysOverdue(t, refDate);
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => setDraggedTaskId(t.id)}
                        onClick={() => setActiveBscTaskId(t.id)}
                        className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#1A73E8] cursor-pointer space-y-2 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1.5 text-[11px]">
                          <span className="font-mono font-bold text-[#1A73E8]">{t.taskCode}</span>
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${getRagBadgeClasses(rag)}`}>
                            {rag}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-[#172B4D] dark:text-white leading-snug line-clamp-2">
                          {t.title}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate max-w-[140px]">R: {t.responsibleName}</span>
                          <span className="font-mono font-semibold text-[#172B4D] dark:text-slate-200">
                            {t.percentComplete}%
                          </span>
                        </div>

                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-[#1A73E8] rounded-full"
                            style={{ width: `${t.percentComplete}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span className="flex items-center gap-1">
                            {t.baselineLocked && <Lock className="w-2.5 h-2.5" />}
                            {t.plannedEnd}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {(t.attachments || []).length > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[#188038]">
                                <Paperclip className="w-2.5 h-2.5" />
                                {t.attachments.length}
                              </span>
                            )}
                            {overdue > 0 && (
                              <span className="text-[#D93025] font-bold">+{overdue}d</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
