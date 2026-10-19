import { db, type JobStatus } from '../db';
import { callBridge, type CalendarEvent, type EmailSummary } from '../google/bridge';
import { syncJobsFromGmail } from '../google/jobsSync';

/**
 * Everything Jarvis can do besides talking. Each tool is declared once here and
 * the model decides when to call it. New abilities (for example smart home
 * control) are added by appending another entry to TOOLS.
 */
export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<unknown>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
});
const str = (description: string) => ({ type: 'string', description });

const JOB_STATUSES: JobStatus[] = ['sent', 'replied', 'interview', 'offer', 'rejected', 'no_reply'];

export const TOOLS: Tool[] = [
  // Tasks
  {
    name: 'add_task',
    description: 'Add a task or reminder to the user\'s task list.',
    parameters: obj(
      {
        title: str('Short task title'),
        due: str('Optional due date or date-time in ISO 8601 local time, e.g. 2026-10-20 or 2026-10-20T18:00'),
        notes: str('Optional extra details'),
      },
      ['title'],
    ),
    async run(a) {
      const id = await db.tasks.add({
        title: String(a.title),
        due: a.due ? String(a.due) : undefined,
        notes: a.notes ? String(a.notes) : undefined,
        done: 0,
        createdAt: Date.now(),
      });
      return { id, added: a.title };
    },
  },
  {
    name: 'list_tasks',
    description: 'List the user\'s tasks. By default only open tasks.',
    parameters: obj({ include_done: { type: 'boolean', description: 'Also include completed tasks' } }),
    async run(a) {
      const all = await db.tasks.orderBy('createdAt').toArray();
      return all.filter((t) => a.include_done || !t.done);
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done, by id. Call list_tasks first if you do not know the id.',
    parameters: obj({ id: { type: 'integer' } }, ['id']),
    async run(a) {
      const n = await db.tasks.update(Number(a.id), { done: 1, completedAt: Date.now() });
      return n ? { completed: a.id } : { error: 'No task with that id' };
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task by id.',
    parameters: obj({ id: { type: 'integer' } }, ['id']),
    async run(a) {
      await db.tasks.delete(Number(a.id));
      return { deleted: a.id };
    },
  },

  // Long-term memory
  {
    name: 'remember',
    description:
      'Save a lasting fact about the user (preferences, goals, people, job search details) so you remember it in future conversations. Use it whenever the user shares something worth remembering or asks you to remember.',
    parameters: obj({ fact: str('The fact, written as a short sentence') }, ['fact']),
    async run(a) {
      const id = await db.memories.add({ fact: String(a.fact), createdAt: Date.now() });
      return { id, remembered: a.fact };
    },
  },
  {
    name: 'forget',
    description: 'Delete a remembered fact by id.',
    parameters: obj({ id: { type: 'integer' } }, ['id']),
    async run(a) {
      await db.memories.delete(Number(a.id));
      return { forgotten: a.id };
    },
  },

  // Job applications
  {
    name: 'list_job_applications',
    description: 'List the user\'s job applications with status, dates and interview times.',
    async run() {
      return db.jobs.toArray();
    },
  },
  {
    name: 'add_job_application',
    description: 'Record a job application the user sent.',
    parameters: obj(
      {
        company: str('Company name'),
        role: str('Job title'),
        sent_at: str('Date the CV was sent, ISO 8601. Defaults to today.'),
        note: str('Optional note'),
      },
      ['company', 'role'],
    ),
    async run(a) {
      const today = new Date().toISOString().slice(0, 10);
      const id = await db.jobs.add({
        company: String(a.company),
        role: String(a.role),
        status: 'sent',
        sentAt: a.sent_at ? String(a.sent_at) : today,
        lastUpdate: today,
        note: a.note ? String(a.note) : undefined,
        source: 'manual',
      });
      return { id };
    },
  },
  {
    name: 'update_job_application',
    description: 'Change the status, interview time or note of a job application, by id.',
    parameters: obj(
      {
        id: { type: 'integer' },
        status: { type: 'string', enum: JOB_STATUSES },
        interview_at: str('Interview date-time, ISO 8601 local time'),
        note: str('Note to store'),
      },
      ['id'],
    ),
    async run(a) {
      const patch: Record<string, unknown> = { lastUpdate: new Date().toISOString().slice(0, 10) };
      if (a.status) patch.status = a.status;
      if (a.interview_at) patch.interviewAt = a.interview_at;
      if (a.note) patch.note = a.note;
      const n = await db.jobs.update(Number(a.id), patch);
      return n ? { updated: a.id } : { error: 'No application with that id' };
    },
  },
  {
    name: 'refresh_job_applications_from_gmail',
    description: 'Fetch the latest application statuses that the Gmail scanner found. Needs Google connected.',
    async run() {
      return { synced: await syncJobsFromGmail() };
    },
  },

  // Google Calendar and Gmail, through the Apps Script bridge
  {
    name: 'get_calendar_events',
    description: 'Get the user\'s Google Calendar events in a date range. Use for planning the day.',
    parameters: obj(
      { from: str('Start, ISO 8601. Defaults to now.'), to: str('End, ISO 8601. Defaults to end of today.') },
    ),
    async run(a) {
      return callBridge<CalendarEvent[]>('calendar.list', { from: a.from, to: a.to });
    },
  },
  {
    name: 'create_calendar_event',
    description:
      'Create a Google Calendar event. Always confirm the title and time with the user before calling this.',
    parameters: obj(
      {
        title: str('Event title'),
        start: str('Start, ISO 8601 local time'),
        end: str('End, ISO 8601 local time. Defaults to one hour after start.'),
        description: str('Optional description'),
        remind_minutes_before: { type: 'integer', description: 'Popup reminder, minutes before start' },
      },
      ['title', 'start'],
    ),
    async run(a) {
      return callBridge('calendar.create', a);
    },
  },
  {
    name: 'search_email',
    description:
      'Search the user\'s Gmail with Gmail search syntax (e.g. "from:hr@acme.com newer_than:7d"). Returns subject, sender, date and a short snippet. Read only.',
    parameters: obj({ query: str('Gmail search query'), max: { type: 'integer', description: 'Max results, default 10' } }, ['query']),
    async run(a) {
      return callBridge<EmailSummary[]>('gmail.search', { query: a.query, max: a.max ?? 10 });
    },
  },
];

export function findTool(name: string) {
  return TOOLS.find((t) => t.name === name);
}
