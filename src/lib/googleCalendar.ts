import { addDays, format, parseISO } from 'date-fns';
import { Meeting, Project, Task } from '../types';
import { BscTask, ProjectCharter, ReviewMeeting } from '../types/bsc';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  updated?: string;
  extendedProperties?: {
    private?: {
      taskMasterId?: string;
      taskMasterType?: 'task' | 'bscTask' | 'meeting' | 'reviewMeeting';
      projectCode?: string;
    };
  };
}

export interface CalendarSyncResult {
  syncedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
  eventMap: Record<string, { googleEventId: string; lastSyncedAt: string }>;
}

async function calendarFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new Error('GOOGLE_TOKEN_EXPIRED');
  }

  if (!res.ok) {
    const errText = await res.text();
    let msg = `Google Calendar API error (${res.status})`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) msg = parsed.error.message;
    } catch {
      // ignore json parse failure
    }
    throw new Error(msg);
  }

  if (res.status === 204) {
    return {} as T;
  }
  return res.json();
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  timeMinIso?: string,
  timeMaxIso?: string
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  if (timeMinIso) params.set('timeMin', timeMinIso);
  if (timeMaxIso) params.set('timeMax', timeMaxIso);

  const data = await calendarFetch<{ items?: GoogleCalendarEvent[] }>(
    `${CALENDAR_API_BASE}?${params.toString()}`,
    accessToken
  );
  return data.items || [];
}

function getExclusiveEndDate(endDate: string): string {
  try {
    return format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd');
  } catch {
    return endDate;
  }
}

async function findExistingEventByExtendedId(
  accessToken: string,
  localId: string
): Promise<string | undefined> {
  const query = new URLSearchParams({
    privateExtendedProperty: `taskMasterId=${localId}`,
    maxResults: '1',
  });
  const found = await calendarFetch<{ items?: GoogleCalendarEvent[] }>(
    `${CALENDAR_API_BASE}?${query.toString()}`,
    accessToken
  );
  if (found.items && found.items.length > 0 && found.items[0].status !== 'cancelled') {
    return found.items[0].id;
  }
  return undefined;
}

async function upsertEventPayload(
  accessToken: string,
  localId: string,
  existingGoogleEventId: string | undefined,
  payload: Record<string, unknown>
): Promise<{ googleEventId: string; updated: boolean }> {
  let targetId = existingGoogleEventId;
  if (!targetId) {
    targetId = await findExistingEventByExtendedId(accessToken, localId);
  }

  if (targetId) {
    try {
      const updated = await calendarFetch<GoogleCalendarEvent>(
        `${CALENDAR_API_BASE}/${encodeURIComponent(targetId)}`,
        accessToken,
        { method: 'PATCH', body: JSON.stringify(payload) }
      );
      return { googleEventId: updated.id, updated: true };
    } catch {
      // Fallback to creating a fresh event if remote event was removed
    }
  }

  const created = await calendarFetch<GoogleCalendarEvent>(CALENDAR_API_BASE, accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { googleEventId: created.id, updated: false };
}

function buildTaskPayload(task: Task, project?: Project) {
  return {
    summary: `[${task.projectCode}] ${task.taskCode}: ${task.name}`,
    description: [
      `Project: ${project ? `${project.projectCode} — ${project.name}` : task.projectCode}`,
      `Status: ${task.status} (${task.progress}% complete)`,
      `Priority: ${task.priority}`,
      `Responsible: ${task.responsible}`,
      task.accountable ? `Accountable: ${task.accountable}` : '',
      `Department: ${task.department}`,
      task.description ? `\nDetails:\n${task.description}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    start: { date: task.plannedStart },
    end: { date: getExclusiveEndDate(task.plannedEnd) },
    extendedProperties: {
      private: {
        taskMasterId: task.id,
        taskMasterType: 'task',
        projectCode: task.projectCode,
      },
    },
  };
}

function buildBscTaskPayload(task: BscTask, charter?: ProjectCharter) {
  return {
    summary: `[${task.charterCode}] ${task.taskCode}: ${task.title}`,
    description: [
      `BSC Charter: ${charter ? `${charter.charterCode} (${charter.projectCode}) — ${charter.title}` : task.charterCode}`,
      charter ? `Perspective: ${charter.perspective} · SO: ${charter.soCode}` : '',
      `Phase: ${task.phase} · Day-Range: ${task.dayRangeBucket}`,
      `Status: ${task.status} (${task.percentComplete}% complete)`,
      `Priority: ${task.priority}`,
      `Responsible (R): ${task.responsibleName}`,
      `Accountable (A): ${task.accountableName}`,
      `Baseline: ${task.baselineStart} → ${task.baselineEnd} (${task.baselineLocked ? 'Locked' : 'Draft'})`,
      `Next Follow-up: ${task.nextFollowUpDate} (${task.followUpFrequency})`,
      `Deliverable Evidence: ${task.deliverableEvidence}`,
      task.description ? `\nDetails:\n${task.description}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    start: { date: task.plannedStart },
    end: { date: getExclusiveEndDate(task.plannedEnd) },
    extendedProperties: {
      private: {
        taskMasterId: task.id,
        taskMasterType: 'bscTask',
        projectCode: charter?.projectCode || task.charterCode,
      },
    },
  };
}

function buildMeetingPayload(meeting: Meeting, project?: Project) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    summary: `[Meeting · ${meeting.projectCode}] ${meeting.title}`,
    location: meeting.venue || undefined,
    description: [
      `Meeting ID: ${meeting.meetingCode}`,
      `Category: ${meeting.category}`,
      `Project: ${project ? `${project.projectCode} — ${project.name}` : meeting.projectCode}`,
      `Chairperson: ${meeting.chairperson}`,
      meeting.participants?.length ? `Participants: ${meeting.participants.join(', ')}` : '',
      meeting.agenda ? `\nAgenda:\n${meeting.agenda}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    start: {
      dateTime: `${meeting.date}T${meeting.startTime}:00`,
      timeZone: tz,
    },
    end: {
      dateTime: `${meeting.date}T${meeting.endTime}:00`,
      timeZone: tz,
    },
    extendedProperties: {
      private: {
        taskMasterId: meeting.id,
        taskMasterType: 'meeting',
        projectCode: meeting.projectCode,
      },
    },
  };
}

function buildReviewMeetingPayload(meeting: ReviewMeeting, charter?: ProjectCharter) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const startTime = meeting.startTime || '10:00';
  const endTime = meeting.endTime || '11:30';
  return {
    summary: `[${meeting.type}] ${meeting.title}`,
    location: meeting.venue || 'Executive Boardroom / Google Meet',
    description: [
      meeting.meetingCode ? `Meeting ID: ${meeting.meetingCode}` : '',
      `Category: ${meeting.type}`,
      charter ? `Charter: ${charter.charterCode} (${charter.projectCode}) — ${charter.title}` : '',
      meeting.perspective ? `Perspective: ${meeting.perspective}` : '',
      meeting.chairperson ? `Chairperson: ${meeting.chairperson}` : '',
      meeting.attendees?.length ? `Participants: ${meeting.attendees.join(', ')}` : '',
      meeting.agenda ? `\nAgenda:\n${meeting.agenda}` : '',
      meeting.decisions ? `\nDecisions:\n${meeting.decisions}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    start: {
      dateTime: `${meeting.date}T${startTime}:00`,
      timeZone: tz,
    },
    end: {
      dateTime: `${meeting.date}T${endTime}:00`,
      timeZone: tz,
    },
    extendedProperties: {
      private: {
        taskMasterId: meeting.id,
        taskMasterType: 'reviewMeeting',
        projectCode: charter?.projectCode || meeting.meetingCode || 'BSC',
      },
    },
  };
}

export async function upsertTaskToGoogleCalendar(
  accessToken: string,
  task: Task,
  project?: Project
): Promise<{ googleEventId: string; updated: boolean }> {
  return upsertEventPayload(accessToken, task.id, task.googleEventId, buildTaskPayload(task, project));
}

export async function upsertBscTaskToGoogleCalendar(
  accessToken: string,
  task: BscTask,
  charter?: ProjectCharter
): Promise<{ googleEventId: string; updated: boolean }> {
  return upsertEventPayload(accessToken, task.id, task.googleEventId, buildBscTaskPayload(task, charter));
}

export async function upsertMeetingToGoogleCalendar(
  accessToken: string,
  meeting: Meeting,
  project?: Project
): Promise<{ googleEventId: string; updated: boolean }> {
  return upsertEventPayload(
    accessToken,
    meeting.id,
    meeting.googleEventId,
    buildMeetingPayload(meeting, project)
  );
}

export async function upsertReviewMeetingToGoogleCalendar(
  accessToken: string,
  meeting: ReviewMeeting,
  charter?: ProjectCharter
): Promise<{ googleEventId: string; updated: boolean }> {
  return upsertEventPayload(
    accessToken,
    meeting.id,
    meeting.googleEventId,
    buildReviewMeetingPayload(meeting, charter)
  );
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  googleEventId: string
): Promise<void> {
  await calendarFetch<void>(
    `${CALENDAR_API_BASE}/${encodeURIComponent(googleEventId)}`,
    accessToken,
    { method: 'DELETE' }
  );
}
