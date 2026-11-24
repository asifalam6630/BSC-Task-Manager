import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Plus, Trash2, Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DEPARTMENTS, Employee, UserRole } from '../types';
import {
  createEmployeeDoc,
  deleteEmployeeDoc,
  updateEmployeeDoc,
} from '../lib/firestoreService';
import { computeEmployeeWorkloads } from '../lib/metrics';

const ROLES: UserRole[] = [
  'Super Admin',
  'MD / Executive',
  'ED / Project Sponsor',
  'Project Manager',
  'Department Head',
  'Team Member',
  'Viewer',
];

export const TeamModule: React.FC = () => {
  const { user, employees, tasks, globalSearch, confirm, notify } = useApp();
  const [deptFilter, setDeptFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const [employeeCode, setEmployeeCode] = useState('');
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [email, setEmail] = useState('');
  const [reportingManager, setReportingManager] = useState('');
  const [systemRole, setSystemRole] = useState<UserRole>('Team Member');

  const workloads = useMemo(
    () => computeEmployeeWorkloads(employees, tasks),
    [employees, tasks]
  );

  const filteredWorkloads = useMemo(() => {
    return workloads.filter((w) => {
      if (deptFilter !== 'all' && w.employee.department !== deptFilter) return false;
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        if (
          !w.employee.name.toLowerCase().includes(q) &&
          !w.employee.designation.toLowerCase().includes(q) &&
          !w.employee.department.toLowerCase().includes(q) &&
          !w.employee.employeeCode.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [workloads, deptFilter, globalSearch]);

  const deptChartData = useMemo(() => {
    const map = new Map<string, { dept: string; Completed: number; Pending: number; Overdue: number }>();
    workloads.forEach((w) => {
      const key = w.employee.department;
      const cur = map.get(key) || {
        dept: key.length > 16 ? `${key.slice(0, 15)}…` : key,
        Completed: 0,
        Pending: 0,
        Overdue: 0,
      };
      cur.Completed += w.completedTasks;
      cur.Pending += Math.max(0, w.pendingTasks - w.overdueTasks);
      cur.Overdue += w.overdueTasks;
      map.set(key, cur);
    });
    return Array.from(map.values());
  }, [workloads]);

  const openCreate = () => {
    setEditing(null);
    setEmployeeCode(`EMP-${String(employees.length + 1).padStart(3, '0')}`);
    setName('');
    setDesignation('');
    setDepartment(DEPARTMENTS[0]);
    setEmail('');
    setReportingManager('');
    setSystemRole('Team Member');
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setEmployeeCode(emp.employeeCode);
    setName(emp.name);
    setDesignation(emp.designation);
    setDepartment(emp.department);
    setEmail(emp.email);
    setReportingManager(emp.reportingManager);
    setSystemRole(emp.systemRole);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || !email.trim()) return;
    try {
      const payload = {
        employeeCode: employeeCode.trim(),
        name: name.trim(),
        designation: designation.trim() || 'Specialist',
        department,
        email: email.trim(),
        reportingManager: reportingManager.trim(),
        systemRole,
      };
      if (editing) {
        await updateEmployeeDoc(editing.id, payload);
        notify('success', 'Employee updated', payload.name);
      } else {
        await createEmployeeDoc(user.uid, { ...payload, isDemo: false });
        notify('success', 'Employee added', payload.name);
      }
      setModalOpen(false);
    } catch (err) {
      notify('error', 'Failed to save employee', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDelete = async (emp: Employee) => {
    const ok = await confirm({
      title: `Remove ${emp.name}?`,
      description: 'Remove this employee from the centralized directory?',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    await deleteEmployeeDoc(emp.id);
    notify('success', 'Employee removed');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            Team &amp; Department Directory
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {employees.length} team members · Individual workload, overdue escalations &amp; departmental capacity distribution.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Team Member
        </button>
      </div>

      {/* Department Workload Distribution Chart */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-sm font-bold text-[#172B4D] dark:text-white">
              Department-wise Workload Distribution
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Completed, active pending, and overdue assignments across departments
            </p>
          </div>
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
        </div>
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deptChartData} margin={{ top: 5, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.45} />
              <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Completed" stackId="a" fill="#188038" />
              <Bar dataKey="Pending" stackId="a" fill="#1A73E8" />
              <Bar dataKey="Overdue" stackId="a" fill="#D93025" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Employee Workload Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-slate-950/60 text-slate-500">
              <th className="py-3 px-4 font-semibold">Employee</th>
              <th className="py-3 px-3 font-semibold">Department / Role</th>
              <th className="py-3 px-3 font-semibold">Reporting Manager</th>
              <th className="py-3 px-3 font-semibold text-right">Projects</th>
              <th className="py-3 px-3 font-semibold text-right">Pending</th>
              <th className="py-3 px-3 font-semibold text-right">Completed</th>
              <th className="py-3 px-3 font-semibold text-right">Overdue</th>
              <th className="py-3 px-3 font-semibold text-right">Avg Progress</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredWorkloads.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-500">
                  <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  No employees found.
                </td>
              </tr>
            ) : (
              filteredWorkloads.map((w) => (
                <tr
                  key={w.employee.id}
                  onClick={() => openEdit(w.employee)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="py-3 px-4">
                    <p className="font-semibold text-[#172B4D] dark:text-slate-100">
                      {w.employee.name}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {w.employee.employeeCode} · {w.employee.designation}
                    </p>
                  </td>
                  <td className="py-3 px-3">
                    <p className="text-slate-700 dark:text-slate-300">{w.employee.department}</p>
                    <p className="text-[11px] text-slate-500">{w.employee.systemRole}</p>
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                    {w.employee.reportingManager || '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">{w.projectsCount}</td>
                  <td className="py-3 px-3 text-right font-mono text-[#B06000] dark:text-amber-400 font-semibold">
                    {w.pendingTasks}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[#188038] dark:text-emerald-400 font-semibold">
                    {w.completedTasks}
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-mono font-semibold ${
                      w.overdueTasks > 0 ? 'text-[#D93025]' : 'text-slate-400'
                    }`}
                  >
                    {w.overdueTasks}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-semibold">
                    {w.avgProgress}%
                  </td>
                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleDelete(w.employee)}
                      aria-label={`Delete ${w.employee.name}`}
                      className="p-1.5 rounded text-slate-400 hover:text-[#D93025]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Employee Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#172B4D] dark:text-white">
                {editing ? `Edit ${editing.name}` : 'Add Team Member'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1">Employee ID</label>
                  <input
                    required
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-medium mb-1">Full Name *</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Designation</label>
                  <input
                    required
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Reporting Manager</label>
                  <input
                    value={reportingManager}
                    onChange={(e) => setReportingManager(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Access Role</label>
                <select
                  value={systemRole}
                  onChange={(e) => setSystemRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#1A73E8] text-white font-semibold"
                >
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
