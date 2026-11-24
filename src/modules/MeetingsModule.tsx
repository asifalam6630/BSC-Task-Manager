import React, { useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  Calendar,
  Clock,
  MapPin,
  Plus,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ActionPoint, Meeting, MeetingCategory } from '../types';
import { createTaskDoc, updateMeetingDoc } from '../lib/firestoreService';

interface MeetingsModuleProps {
  onCreateMeeting: () => void;
  onEditMeeting: (m: Meeting) => void;
}

const CATEGORIES: MeetingCategory[] = [
  'BOD Meeting',
  'Steering Committee Meeting',
  'Project Review Meeting',
  'Departmental Meeting',
  'Progress Review Meeting',
  'Follow-up Meeting',
];

export const MeetingsModule: React.FC<MeetingsModuleProps> = ({
  onCreateMeeting,
  onEditMeeting,
}) => {
  const { user, projects, meetings, tasks, globalSearch, notify } = useApp();
  const [projectFilter, setProjectFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');

  const projectMap = useMemo(() => {
    const m = new Map<string, (typeof projects)[0]>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (projectFilter !== 'all' && m.projectId !== projectFilter) return false;
      if (catFilter !== 'all' && m.category !== catFilter) return false;
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        if (
          !m.title.toLowerCase().includes(q) &&
          !m.meetingCode.toLowerCase().includes(q) &&
          !m.projectCode.toLowerCase().includes(q) &&
          !m.chairperson.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [meetings, projectFilter, catFilter, globalSearch]);

  const handleConvertAction = async (meeting: Meeting, ap: ActionPoint) => {
    if (!user) return;
    const proj = projectMap.get(meeting.projectId);
    if (!proj) return;
    try {
      const nextCode = `T${String(tasks.length + 1).padStart(3, '0')}`;
      const newTaskId = await createTaskDoc(user.uid, {
        taskCode: nextCode,
        projectId: proj.id,
        projectCode: proj.projectCode,
        name: ap.description,
        description: `Action point from ${meeting.meetingCode}: ${meeting.title}`,
        responsible: ap.owner,
        accountable: meeting.chairperson,
        department: proj.department,
        plannedStart: meeting.date,
        plannedEnd: ap.deadline >= meeting.date ? ap.deadline : meeting.date,
        estimatedDays: 5,
        weight: 10,
        priority: 'High',
        status: ap.status === 'Completed' ? 'Completed' : 'Not Started',
        progress: ap.status === 'Completed' ? 100 : 0,
        syncStatus: 'not_synced',
        isDemo: false,
      });

      const updatedAps = (meeting.actionPoints || []).map((item) =>
        item.id === ap.id ? { ...item, convertedTaskId: newTaskId } : item
      );
      await updateMeetingDoc(meeting.id, { actionPoints: updatedAps });
      notify('success', 'Action point converted', `Created task ${nextCode} in ${proj.projectCode}.`);
    } catch (err) {
      notify('error', 'Conversion failed', err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#172B4D] dark:text-white">
            Meeting Management
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            BOD, Steering Committee &amp; Project Reviews with minutes, action tracking, and 1-click task conversion.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateMeeting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#9334E6] hover:bg-[#7B28C4] text-white text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Schedule Meeting
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.projectCode} — {p.name}
            </option>
          ))}
        </select>

        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Meetings List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredMeetings.length === 0 ? (
          <div className="lg:col-span-2 p-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
            No meetings match your filter criteria.
          </div>
        ) : (
          filteredMeetings.map((m) => {
            const proj = projectMap.get(m.projectId);
            const aps = m.actionPoints || [];
            return (
              <div
                key={m.id}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-bold text-[#9334E6] dark:text-purple-400">
                          {m.meetingCode}
                        </span>
                        <span>·</span>
                        <span>{m.category}</span>
                        <span>·</span>
                        <span className="font-mono font-semibold text-[#172B4D] dark:text-slate-200">
                          {m.projectCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEditMeeting(m)}
                        className="mt-1 text-left font-display text-base font-bold text-[#172B4D] dark:text-white hover:text-[#1A73E8] transition-colors"
                      >
                        {m.title}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditMeeting(m)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                    >
                      Open
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-[#9334E6]" />
                      {m.date}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {m.startTime}–{m.endTime}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {m.venue}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      Chair: {m.chairperson}
                    </span>
                  </div>

                  {proj && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Project: <strong className="text-[#172B4D] dark:text-slate-300">{proj.name}</strong>
                    </p>
                  )}

                  {m.agenda && (
                    <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line line-clamp-3">
                      {m.agenda}
                    </p>
                  )}
                </div>

                {/* Action Points Strip */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#172B4D] dark:text-slate-200">
                      Action Points ({aps.length})
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {m.syncStatus === 'synced' ? 'Google Cal Synced' : 'Local Calendar'}
                    </span>
                  </div>
                  {aps.length === 0 ? (
                    <p className="text-xs text-slate-400">No action points recorded.</p>
                  ) : (
                    aps.map((ap) => (
                      <div
                        key={ap.id}
                        className="p-2.5 rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-[#172B4D] dark:text-slate-200 truncate">
                            {ap.description}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {ap.owner} · Due {ap.deadline} · {ap.status}
                          </p>
                        </div>
                        {ap.convertedTaskId ? (
                          <span className="text-[11px] font-semibold text-[#188038] dark:text-emerald-400 shrink-0">
                            Task Created
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleConvertAction(m, ap)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1A73E8]/10 text-[#1A73E8] dark:text-blue-400 hover:bg-[#1A73E8]/20 text-[11px] font-semibold shrink-0"
                          >
                            <ArrowRightCircle className="w-3 h-3" />
                            To Task
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
