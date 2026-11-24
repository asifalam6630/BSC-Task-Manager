import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DEPARTMENTS, RaciEntry, RaciLetter, RACI_COLUMNS } from '../types';
import {
  createRaciEntryDoc,
  deleteRaciEntryDoc,
  updateRaciEntryDoc,
} from '../lib/firestoreService';
import { validateRaciEntries } from '../lib/metrics';
import {
  buildReportData,
  exportReportToExcel,
  exportReportToPdf,
} from '../lib/exportUtils';

const CYCLE_ORDER: RaciLetter[] = ['', 'R', 'A', 'C', 'I'];

const CELL_STYLES: Record<RaciLetter, string> = {
  R: 'bg-[#1A73E8] text-white font-bold',
  A: 'bg-[#D93025] text-white font-bold',
  C: 'bg-[#F9AB00]/25 text-[#8A4B00] dark:text-amber-300 font-bold',
  I: 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold',
  '': 'bg-transparent text-slate-300 dark:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
};

export const RaciModule: React.FC = () => {
  const { user, projects, tasks, meetings, raciEntries, employees, confirm, notify } = useApp();

  const [projectFilter, setProjectFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [roleView, setRoleView] = useState('all');

  const [newProjectId, setNewProjectId] = useState('');
  const [newActivity, setNewActivity] = useState('');
  const [newDept, setNewDept] = useState(DEPARTMENTS[0]);

  const filteredEntries = useMemo(() => {
    return raciEntries.filter((r) => {
      if (projectFilter !== 'all' && r.projectId !== projectFilter) return false;
      if (deptFilter !== 'all' && r.department !== deptFilter) return false;
      if (roleView !== 'all' && !r.roles?.[roleView]) return false;
      return true;
    });
  }, [raciEntries, projectFilter, deptFilter, roleView]);

  const validationIssues = useMemo(
    () => validateRaciEntries(filteredEntries),
    [filteredEntries]
  );

  const issueByEntryId = useMemo(() => {
    const map = new Map<string, string[]>();
    validationIssues.forEach((iss) => {
      const arr = map.get(iss.entryId) || [];
      arr.push(iss.message);
      map.set(iss.entryId, arr);
    });
    return map;
  }, [validationIssues]);

  const handleCycleCell = async (entry: RaciEntry, col: string) => {
    const current = (entry.roles?.[col] || '') as RaciLetter;
    const next = CYCLE_ORDER[(CYCLE_ORDER.indexOf(current) + 1) % CYCLE_ORDER.length];
    const updatedRoles = { ...(entry.roles || {}), [col]: next };
    try {
      await updateRaciEntryDoc(entry.id, { roles: updatedRoles });
    } catch (err) {
      notify('error', 'Failed to update RACI cell', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleAddRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const proj = projects.find((p) => p.id === (newProjectId || projects[0]?.id));
    if (!proj) {
      notify('error', 'Create a project first', 'A RACI activity must belong to an existing project.');
      return;
    }
    if (!newActivity.trim()) return;

    try {
      await createRaciEntryDoc(user.uid, {
        projectId: proj.id,
        projectCode: proj.projectCode,
        activity: newActivity.trim(),
        department: newDept,
        roles: { MD: 'I', ED: 'A', Finance: 'C', HR: 'I', IE: 'R' },
        isDemo: false,
      });
      setNewActivity('');
      notify('success', 'RACI activity added', `Added under ${proj.projectCode}.`);
    } catch (err) {
      notify('error', 'Failed to add activity', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDeleteRow = async (entry: RaciEntry) => {
    const ok = await confirm({
      title: 'Remove RACI activity?',
      description: `Delete "${entry.activity}" from the responsibility matrix?`,
      confirmLabel: 'Remove Row',
      tone: 'danger',
    });
    if (!ok) return;
    await deleteRaciEntryDoc(entry.id);
    notify('success', 'RACI row deleted');
  };

  const handleExport = (fmt: 'excel' | 'pdf') => {
    const report = buildReportData('raci_matrix', {
      projects,
      tasks,
      meetings,
      raciEntries: filteredEntries,
      employees,
      selectedProjectId: projectFilter === 'all' ? undefined : projectFilter,
    });
    if (fmt === 'excel') exportReportToExcel(report);
    else exportReportToPdf(report);
    notify('success', `Exported RACI Matrix (${fmt.toUpperCase()})`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            RACI &amp; Responsibility Matrix
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Click any matrix cell to cycle R (Responsible) · A (Accountable) · C (Consulted) · I (Informed).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleExport('excel')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#188038]" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#172B4D] dark:bg-[#1A73E8] text-white text-xs font-semibold hover:opacity-90 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Validation Status Strip */}
      {validationIssues.length > 0 ? (
        <div className="p-4 rounded-xl bg-[#D93025]/5 dark:bg-red-950/30 border border-[#D93025]/30 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#D93025] dark:text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Governance Validation: {validationIssues.length} responsibility conflict(s) detected
            </span>
          </div>
          <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5 pl-6 list-disc">
            {validationIssues.slice(0, 5).map((iss, idx) => (
              <li key={idx}>
                <span className="font-mono font-semibold">{iss.projectCode}</span> · {iss.activity} —{' '}
                {iss.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-[#188038]/5 dark:bg-emerald-950/30 border border-[#188038]/30 flex items-center gap-2 text-xs font-medium text-[#188038] dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>All visible RACI activities have exactly one Accountable (A) owner and at least one Responsible (R) owner.</span>
        </div>
      )}

      {/* Filters & Legend */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode} — {p.name}
              </option>
            ))}
          </select>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={roleView}
            onChange={(e) => setRoleView(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
          >
            <option value="all">Role Responsibility View: All</option>
            {RACI_COLUMNS.map((col) => (
              <option key={col} value={col}>
                Assigned to {col}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-medium">
          <span className="inline-flex items-center gap-1">
            <span className="w-5 h-5 rounded inline-flex items-center justify-center bg-[#1A73E8] text-white font-mono font-bold">R</span>
            Responsible
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-5 h-5 rounded inline-flex items-center justify-center bg-[#D93025] text-white font-mono font-bold">A</span>
            Accountable
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-5 h-5 rounded inline-flex items-center justify-center bg-[#F9AB00]/30 text-[#8A4B00] dark:text-amber-300 font-mono font-bold">C</span>
            Consulted
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-5 h-5 rounded inline-flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold">I</span>
            Informed
          </span>
        </div>
      </div>

      {/* Add Activity Form */}
      <form
        onSubmit={handleAddRow}
        className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5"
      >
        <select
          value={newProjectId || projects[0]?.id || ''}
          onChange={(e) => setNewProjectId(e.target.value)}
          className="sm:col-span-3 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.projectCode} — {p.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={newActivity}
          onChange={(e) => setNewActivity(e.target.value)}
          placeholder="Add new RACI governance activity..."
          className="sm:col-span-4 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        />
        <select
          value={newDept}
          onChange={(e) => setNewDept(e.target.value)}
          className="sm:col-span-3 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Row
        </button>
      </form>

      {/* Spreadsheet Matrix Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 text-slate-500">
              <th className="py-3 px-4 font-semibold min-w-[240px]">Project / Activity</th>
              <th className="py-3 px-3 font-semibold min-w-[130px]">Department</th>
              {RACI_COLUMNS.map((col) => (
                <th key={col} className="py-3 px-2 text-center font-semibold min-w-[64px]">
                  {col}
                </th>
              ))}
              <th className="py-3 px-3 text-right font-semibold w-12">Del</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredEntries.map((entry) => {
              const rowIssues = issueByEntryId.get(entry.id);
              return (
                <tr key={entry.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td className="py-2.5 px-4">
                    <div className="flex items-start gap-2">
                      {rowIssues && (
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-[#D93025] mt-0.5 shrink-0"
                          aria-label={rowIssues.join(' ')}
                        />
                      )}
                      <div>
                        <span className="font-mono font-bold text-[#1A73E8] mr-1.5">
                          {entry.projectCode}
                        </span>
                        <span className="font-medium text-[#172B4D] dark:text-slate-100">
                          {entry.activity}
                        </span>
                        {rowIssues && (
                          <p className="text-[11px] text-[#D93025] dark:text-red-400 mt-0.5">
                            {rowIssues[0]}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                    {entry.department}
                  </td>
                  {RACI_COLUMNS.map((col) => {
                    const val = (entry.roles?.[col] || '') as RaciLetter;
                    return (
                      <td key={col} className="py-1.5 px-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleCycleCell(entry, col)}
                          className={`w-9 h-8 rounded-md font-mono text-xs transition-colors ${CELL_STYLES[val]}`}
                          title={`Click to change ${col} role for ${entry.activity}`}
                        >
                          {val || '—'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(entry)}
                      aria-label="Delete RACI row"
                      className="p-1.5 rounded text-slate-400 hover:text-[#D93025]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
