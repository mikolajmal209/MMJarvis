import Dexie, { type EntityTable } from 'dexie';

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  model?: string;
}

export interface Task {
  id?: number;
  title: string;
  due?: string; // ISO date or date-time, local time
  notes?: string;
  done: 0 | 1;
  createdAt: number;
  completedAt?: number;
}

export interface Memory {
  id?: number;
  fact: string;
  createdAt: number;
}

export type JobStatus = 'sent' | 'replied' | 'interview' | 'offer' | 'rejected' | 'no_reply';

export interface Job {
  id?: number;
  company: string;
  role: string;
  status: JobStatus;
  sentAt?: string; // ISO date
  lastUpdate?: string; // ISO date
  interviewAt?: string; // ISO date-time
  note?: string;
  source?: 'manual' | 'gmail';
  externalId?: string; // row id in the Google Sheet when synced from Gmail
}

export const db = new Dexie('jarvis') as Dexie & {
  messages: EntityTable<ChatMessage, 'id'>;
  tasks: EntityTable<Task, 'id'>;
  memories: EntityTable<Memory, 'id'>;
  jobs: EntityTable<Job, 'id'>;
};

db.version(1).stores({
  messages: '++id, createdAt',
  tasks: '++id, done, due, createdAt',
  memories: '++id, createdAt',
  jobs: '++id, status, company, externalId',
});

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  sent: 'Sent',
  replied: 'Replied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  no_reply: 'No reply',
};
