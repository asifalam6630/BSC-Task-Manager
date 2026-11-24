import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { format, isValid, parse, parseISO } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  DEPARTMENTS,
  Priority,
  PROJECT_COLORS,
  TaskStatus,
} from '../types';
import {
  createProjectDoc,
  createRaciEntryDoc,
  createTaskDoc,
  updateTaskDoc,
} from '../lib/firestoreService';
import { downloadExcelImportTemplate } from '../lib/exportUtils';

interface MappedRow {
  rowIndex: number;
  projectCode: string;
  projectName: string;
  department: string;
  taskCode: string;
  taskName: string;
  responsible: string;
  accountable: string;
  consulted: string;
  informed: string;
  startDate: string;
  endDate: string;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  weight: number;
  errors: string[];
  isDuplicate: boolean;
  existingTaskId?: string;
}

type FieldKey =
  | 'projectCode'
  | 'projectName'
  | 'department'
  | 'taskCode'
  | 'taskName'
  | 'responsible'
  | 'accountable'
  | 'consulted'
  | 'informed'
  | 'startDate'
  | 'endDate'
  | 'priority'
  | 'status'
  | 'progress'
  | 'weight';

const FIELD_LABELS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'projectCode', label: 'Project ID', required: true },
  { key: 'projectName', label: 'Project Name', required: true },
  { key: 'department', label: 'Department' },
  { key: 'taskCode', label: 'Task ID', required: true },
  { key: 'taskName', label: 'Task Name', required: true },
  { key: 'responsible', label: 'Responsible (R)', required: true },
  { key: 'accountable', label: 'Accountable (A)' },
  { key: 'consulted', label: 'Consulted (C)' },
  { key: 'informed', label: 'Informed (I)' },
  { key: 'startDate', label: 'Start Date', required: true },
  { key: 'endDate', label: 'End Date', required: true },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'progress', label: 'Progress %' },
  { key: 'weight', label: 'Weight' },
];

function normalizeExcelDate(val: unknown): string {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(
        parsed.d
      ).padStart(2, '0')}`;
    }
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return isValid(parseISO(str)) ? str : '';
  }
  const formats = ['dd-MMM-yyyy', 'd-MMM-yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy/MM/dd'];
  for (const fmt of formats) {
    const d = parse(str, fmt, new Date());
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }
  const native = new Date(str);
  if (isValid(native)) return format(native, 'yyyy-MM-dd');
  return '';
}

function normalizeStatus(val: unknown): TaskStatus {
  const s = String(val || '').trim().toLowerCase();
  if (s.includes('complete')) return 'Completed';
  if (s.includes('progress')) return 'In Progress';
  if (s.includes('approval')) return 'Pending Approval';
  if (s.includes('review')) return 'Under Review';
  if (s.includes('delay')) return 'Delayed';
  if (s.includes('hold')) return 'On Hold';
  return 'Not Started';
}

function normalizePriority(val: unknown): Priority {
  const s = String(val || '').trim().toLowerCase();
  if (s.includes('crit')) return 'Critical';
  if (s.includes('high')) return 'High';
  if (s.includes('low')) return 'Low';
  return 'Medium';
}

function normalizeProgress(val: unknown): number {
  const raw = String(val ?? '0').replace('%', '').trim();
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  if (n > 0 && n <= 1 && String(val).includes('.')) return Math.round(n * 100);
  return Math.min(100, Math.max(0, Math.round(n)));
}

function autoMapHeaders(headers: string[]): Record<FieldKey, string> {
  const find = (patterns: string[]) =>
    headers.find((h) => patterns.some((p) => h.toLowerCase().includes(p))) || '';
  return {
    projectCode: find(['project id', 'proj id', 'project code', 'p_id']),
    projectName: find(['project name', 'project title', 'project']),
    department: find(['department', 'dept']),
    taskCode: find(['task id', 'task code', 't_id']),
    taskName: find(['task name', 'activity', 'task', 'deliverable']),
    responsible: find(['responsible', 'owner', 'assigned']),
    accountable: find(['accountable', 'sponsor', 'approver']),
    consulted: find(['consulted']),
    informed: find(['informed']),
    startDate: find(['start date', 'planned start', 'start']),
    endDate: find(['end date', 'planned end', 'due date', 'deadline', 'end']),
    priority: find(['priority']),
    status: find(['status']),
    progress: find(['progress', 'completion', '%']),
    weight: find(['weight']),
  };
}

export const ExcelImportModule: React.FC = () => {
  const { user, projects, tasks, confirm, notify } = useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    projectCode: '',
    projectName: '',
    department: '',
    taskCode: '',
    taskName: '',
    responsible: '',
    accountable: '',
    consulted: '',
    informed: '',
    startDate: '',
    endDate: '',
    priority: '',
    status: '',
    progress: '',
    weight: '',
  });
  const [overrides, setOverrides] = useState<Record<number, Partial<MappedRow>>>({});
  const [generateRaci, setGenerateRaci] = useState(true);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    imported: number;
    duplicates: number;
    invalid: number;
    failed: number;
  } | null>(null);

  const loadSheet = (wb: XLSX.WorkBook, sName: string) => {
    const ws = wb.Sheets[sName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const cols = json.length > 0 ? Object.keys(json[0]) : [];
    setSheetName(sName);
    setHeaders(cols);
    setRawRows(json);
    setMapping(autoMapHeaders(cols));
    setOverrides({});
    setSummary(null);
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      setFileName(file.name);
      setWorkbook(wb);
      if (wb.SheetNames.length > 0) {
        loadSheet(wb, wb.SheetNames[0]);
      }
      notify('info', 'Workbook loaded', `Detected ${wb.SheetNames.length} sheet(s) in ${file.name}.`);
    } catch (err) {
      notify('error', 'Could not read Excel file', err instanceof Error ? err.message : 'Invalid file');
    }
  };

  const parsedRows = useMemo<MappedRow[]>(() => {
    const existingTaskKeyMap = new Map<string, string>();
    tasks.forEach((t) => {
      existingTaskKeyMap.set(`${t.projectCode.toUpperCase()}::${t.taskCode.toUpperCase()}`, t.id);
    });

    return rawRows.map((raw, idx) => {
      const ov = overrides[idx] || {};
      const projectCode = (ov.projectCode ?? String(raw[mapping.projectCode] ?? '').trim()).toUpperCase();
      const projectName = ov.projectName ?? String(raw[mapping.projectName] ?? '').trim();
      const department =
        ov.department ?? (String(raw[mapping.department] ?? '').trim() || DEPARTMENTS[0]);
      const taskCode = (ov.taskCode ?? String(raw[mapping.taskCode] ?? '').trim()).toUpperCase();
      const taskName = ov.taskName ?? String(raw[mapping.taskName] ?? '').trim();
      const responsible = ov.responsible ?? String(raw[mapping.responsible] ?? '').trim();
      const accountable = ov.accountable ?? String(raw[mapping.accountable] ?? '').trim();
      const consulted = ov.consulted ?? String(raw[mapping.consulted] ?? '').trim();
      const informed = ov.informed ?? String(raw[mapping.informed] ?? '').trim();
      const startDate = ov.startDate ?? normalizeExcelDate(raw[mapping.startDate]);
      const endDate = ov.endDate ?? normalizeExcelDate(raw[mapping.endDate]);
      const priority = ov.priority ?? normalizePriority(raw[mapping.priority]);
      const status = ov.status ?? normalizeStatus(raw[mapping.status]);
      const progress = ov.progress ?? normalizeProgress(raw[mapping.progress]);
      const weight = ov.weight ?? (Number(raw[mapping.weight]) || 10);

      const errors: string[] = [];
      if (!projectCode) errors.push('Missing Project ID');
      if (!projectName) errors.push('Missing Project Name');
      if (!taskCode) errors.push('Missing Task ID');
      if (!taskName) errors.push('Missing Task Name');
      if (!responsible) errors.push('Missing Responsible');
      if (!startDate) errors.push('Invalid Start Date');
      if (!endDate) errors.push('Invalid End Date');
      if (startDate && endDate && endDate < startDate) errors.push('End < Start');

      const key = `${projectCode}::${taskCode}`;
      const existingTaskId = existingTaskKeyMap.get(key);

      return {
        rowIndex: idx,
        projectCode,
        projectName,
        department,
        taskCode,
        taskName,
        responsible,
        accountable,
        consulted,
        informed,
        startDate,
        endDate,
        priority,
        status,
        progress,
        weight,
        errors,
        isDuplicate: Boolean(existingTaskId),
        existingTaskId,
      };
    });
  }, [rawRows, mapping, overrides, tasks]);

  const stats = useMemo(() => {
    const valid = parsedRows.filter((r) => r.errors.length === 0);
    const duplicates = valid.filter((r) => r.isDuplicate);
    const invalid = parsedRows.filter((r) => r.errors.length > 0);
    return { total: parsedRows.length, valid: valid.length, duplicates: duplicates.length, invalid: invalid.length };
  }, [parsedRows]);

  const handleRunImport = async () => {
    if (!user) return;
    if (stats.valid === 0) {
      notify('error', 'No valid rows', 'Fix validation errors before importing.');
      return;
    }

    let overwriteDuplicates = false;
    if (stats.duplicates > 0) {
      overwriteDuplicates = await confirm({
        title: `${stats.duplicates} duplicate task(s) detected`,
        description:
          'Some uploaded rows match existing Project ID + Task ID records in your database. Choose "Overwrite Duplicates" to update them, or "Cancel" to skip duplicates and import only new records.',
        items: parsedRows
          .filter((r) => r.isDuplicate)
          .map((r) => `${r.projectCode} · ${r.taskCode}: ${r.taskName}`),
        confirmLabel: 'Overwrite Duplicates',
        cancelLabel: 'Skip Duplicates',
        tone: 'warning',
      });
    }

    setImporting(true);
    let imported = 0;
    let skippedDup = 0;
    let failed = 0;

    try {
      // Map existing projects by projectCode
      const projectByCode = new Map<string, string>();
      projects.forEach((p) => projectByCode.set(p.projectCode.toUpperCase(), p.id));

      for (const row of parsedRows) {
        if (row.errors.length > 0) continue;
        if (row.isDuplicate && !overwriteDuplicates) {
          skippedDup++;
          continue;
        }

        try {
          let projId = projectByCode.get(row.projectCode);
          if (!projId) {
            projId = await createProjectDoc(user.uid, {
              projectCode: row.projectCode,
              name: row.projectName,
              category: 'Imported Project Plan',
              strategicObjective: `Imported from ${fileName}`,
              description: '',
              projectOwner: row.accountable || row.responsible,
              projectChampion: row.accountable || '',
              department: row.department,
              startDate: row.startDate,
              targetDate: row.endDate,
              priority: row.priority,
              status: 'In Progress',
              color: PROJECT_COLORS[projectByCode.size % PROJECT_COLORS.length],
              milestones: [],
              documents: [],
              isDemo: false,
            });
            projectByCode.set(row.projectCode, projId);
          }

          if (row.isDuplicate && row.existingTaskId && overwriteDuplicates) {
            await updateTaskDoc(row.existingTaskId, {
              name: row.taskName,
              responsible: row.responsible,
              accountable: row.accountable,
              department: row.department,
              plannedStart: row.startDate,
              plannedEnd: row.endDate,
              priority: row.priority,
              status: row.status,
              progress: row.progress,
              weight: row.weight,
            });
          } else {
            await createTaskDoc(user.uid, {
              taskCode: row.taskCode,
              projectId: projId,
              projectCode: row.projectCode,
              name: row.taskName,
              description: `Imported from ${fileName}`,
              responsible: row.responsible,
              accountable: row.accountable,
              consulted: row.consulted ? row.consulted.split(',').map((s) => s.trim()).filter(Boolean) : [],
              informed: row.informed ? row.informed.split(',').map((s) => s.trim()).filter(Boolean) : [],
              department: row.department,
              plannedStart: row.startDate,
              plannedEnd: row.endDate,
              estimatedDays: 7,
              weight: row.weight,
              priority: row.priority,
              status: row.status,
              progress: row.progress,
              syncStatus: 'not_synced',
              isDemo: false,
            });

            if (generateRaci && (row.responsible || row.accountable)) {
              const roles: Record<string, 'R' | 'A' | 'C' | 'I'> = {};
              if (row.responsible) roles[row.responsible] = 'R';
              if (row.accountable) roles[row.accountable] = 'A';
              await createRaciEntryDoc(user.uid, {
                projectId: projId,
                projectCode: row.projectCode,
                activity: row.taskName,
                department: row.department,
                roles,
                isDemo: false,
              });
            }
          }
          imported++;
        } catch {
          failed++;
        }
      }

      setSummary({
        total: stats.total,
        imported,
        duplicates: skippedDup,
        invalid: stats.invalid,
        failed,
      });
      notify(
        'success',
        'Excel import finished',
        `${imported} task(s) imported into Firestore, Calendar, Gantt, and RACI.`
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            Excel Import Center
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Upload XLSX, XLS, or CSV project plans to auto-generate projects, tasks, calendar events, timelines, and RACI assignments.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadExcelImportTemplate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5 text-[#188038]" />
          Download Excel Template
        </button>
      </div>

      {/* Upload Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className="p-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#1A73E8] transition-colors cursor-pointer text-center"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Upload className="w-8 h-8 text-[#1A73E8] mx-auto mb-2.5" />
        <p className="text-sm font-semibold text-[#172B4D] dark:text-slate-100">
          {fileName ? `Loaded: ${fileName}` : 'Drop an Excel (.xlsx, .xls) or CSV file here, or click to browse'}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Supports multi-project schedules, automatic date parsing, duplicate detection, and inline error repair.
        </p>
      </div>

      {/* Import Summary Report */}
      {summary && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-[#188038]/40 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[#188038] dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Import Summary</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            {[
              { label: 'Total Records', val: summary.total, color: 'text-[#172B4D] dark:text-white' },
              { label: 'Successfully Imported', val: summary.imported, color: 'text-[#188038]' },
              { label: 'Duplicate Skipped', val: summary.duplicates, color: 'text-[#B06000]' },
              { label: 'Invalid Records', val: summary.invalid, color: 'text-[#D93025]' },
              { label: 'Failed Records', val: summary.failed, color: 'text-[#D93025]' },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">{s.label}</p>
                <p className={`mt-1 font-mono text-xl font-bold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Column Mapping & Preview */}
      {workbook && (
        <div className="space-y-5">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#188038]" />
                <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
                  1. Sheet &amp; Column Mapping
                </h2>
              </div>
              {workbook.SheetNames.length > 1 && (
                <select
                  value={sheetName}
                  onChange={(e) => loadSheet(workbook, e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
                >
                  {workbook.SheetNames.map((sn) => (
                    <option key={sn} value={sn}>
                      Sheet: {sn}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {FIELD_LABELS.map((f) => (
                <div key={f.key}>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {f.label} {f.required ? '*' : ''}
                  </label>
                  <select
                    value={mapping[f.key]}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F7F9FC] dark:bg-slate-950"
                  >
                    <option value="">-- Unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview & Inline Error Correction Table */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
                  2. Validation Preview &amp; Inline Error Repair
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total: {stats.total} · Valid: {stats.valid} · Duplicates: {stats.duplicates} · Invalid: {stats.invalid}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generateRaci}
                    onChange={(e) => setGenerateRaci(e.target.checked)}
                    className="accent-[#1A73E8]"
                  />
                  Auto-generate RACI entries
                </label>
                <button
                  type="button"
                  disabled={importing || stats.valid === 0}
                  onClick={handleRunImport}
                  className="px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                >
                  {importing ? 'Importing...' : `Import ${stats.valid} Valid Record(s)`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 text-slate-500 sticky top-0">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Project ID</th>
                    <th className="py-2.5 px-3">Task ID</th>
                    <th className="py-2.5 px-3">Task Name</th>
                    <th className="py-2.5 px-3">Responsible</th>
                    <th className="py-2.5 px-3">Start Date</th>
                    <th className="py-2.5 px-3">End Date</th>
                    <th className="py-2.5 px-3">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {parsedRows.map((r) => (
                    <tr
                      key={r.rowIndex}
                      className={
                        r.errors.length > 0
                          ? 'bg-[#D93025]/5 dark:bg-red-950/20'
                          : r.isDuplicate
                          ? 'bg-[#F9AB00]/10 dark:bg-amber-950/20'
                          : ''
                      }
                    >
                      <td className="py-2 px-3 font-mono text-slate-400">{r.rowIndex + 1}</td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={r.projectCode}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [r.rowIndex]: { ...prev[r.rowIndex], projectCode: e.target.value },
                            }))
                          }
                          className="w-20 px-2 py-1 font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={r.taskCode}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [r.rowIndex]: { ...prev[r.rowIndex], taskCode: e.target.value },
                            }))
                          }
                          className="w-20 px-2 py-1 font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={r.taskName}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [r.rowIndex]: { ...prev[r.rowIndex], taskName: e.target.value },
                            }))
                          }
                          className="w-48 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={r.responsible}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [r.rowIndex]: { ...prev[r.rowIndex], responsible: e.target.value },
                            }))
                          }
                          className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="date"
                          value={r.startDate}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [r.rowIndex]: { ...prev[r.rowIndex], startDate: e.target.value },
                            }))
                          }
                          className="px-2 py-1 font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="date"
                          value={r.endDate}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [r.rowIndex]: { ...prev[r.rowIndex], endDate: e.target.value },
                            }))
                          }
                          className="px-2 py-1 font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </td>
                      <td className="py-2 px-3">
                        {r.errors.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[#D93025] font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {r.errors.join(', ')}
                          </span>
                        ) : r.isDuplicate ? (
                          <span className="text-[#B06000] dark:text-amber-400 font-semibold">
                            Duplicate (Requires confirmation)
                          </span>
                        ) : (
                          <span className="text-[#188038] dark:text-emerald-400 font-semibold">
                            Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
