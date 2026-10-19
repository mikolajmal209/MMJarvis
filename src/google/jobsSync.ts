import { db, type JobStatus } from '../db';
import { hasGoogleBridge } from '../settings';
import { callBridge, type BridgeJob } from './bridge';

const STATUSES: JobStatus[] = ['sent', 'replied', 'interview', 'offer', 'rejected', 'no_reply'];

/** Pulls applications the Gmail scanner found and merges them into the local list. */
export async function syncJobsFromGmail(): Promise<number> {
  if (!hasGoogleBridge()) return 0;
  const remote = await callBridge<BridgeJob[]>('jobs.list');
  await db.transaction('rw', db.jobs, async () => {
    for (const r of remote) {
      const status = (STATUSES as string[]).includes(r.status) ? (r.status as JobStatus) : 'sent';
      const existing = await db.jobs.where('externalId').equals(r.id).first();
      const fields = {
        company: r.company,
        role: r.role,
        status,
        sentAt: r.sentAt || undefined,
        lastUpdate: r.lastUpdate || undefined,
        interviewAt: r.interviewAt || undefined,
        note: r.note || undefined,
        source: 'gmail' as const,
        externalId: r.id,
      };
      // A status the user changed by hand after the scanner's last update wins.
      if (existing && (existing.lastUpdate ?? '') > (fields.lastUpdate ?? '')) {
        await db.jobs.update(existing.id!, { interviewAt: fields.interviewAt ?? existing.interviewAt });
      } else if (existing) await db.jobs.update(existing.id!, fields);
      else await db.jobs.add(fields);
    }
  });
  localStorage.setItem('jarvis.jobsSyncedAt', String(Date.now()));
  return remote.length;
}

export function lastJobsSync(): number | null {
  const v = localStorage.getItem('jarvis.jobsSyncedAt');
  return v ? Number(v) : null;
}
