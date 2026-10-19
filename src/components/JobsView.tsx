import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, JOB_STATUS_LABEL, type Job, type JobStatus } from '../db';
import { hasGoogleBridge, useSettings } from '../settings';
import { lastJobsSync, syncJobsFromGmail } from '../google/jobsSync';
import { PlusIcon, RefreshIcon, TrashIcon } from './Icons';

const FOLLOW_UP_DAYS = 10;
const ACTIVE: JobStatus[] = ['sent', 'replied', 'interview', 'no_reply'];

function daysSince(iso?: string) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
}

function hint(j: Job): string | null {
  if (j.status === 'interview' && j.interviewAt) {
    const d = new Date(j.interviewAt);
    return `Interview ${d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`;
  }
  const quiet = daysSince(j.lastUpdate ?? j.sentAt);
  if ((j.status === 'sent' || j.status === 'no_reply') && quiet >= FOLLOW_UP_DAYS) {
    return `${quiet} days with no answer. Ask Jarvis to draft a follow-up.`;
  }
  return j.note ?? null;
}

export function JobsView() {
  const settings = useSettings();
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const connected = hasGoogleBridge(settings);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      await syncJobsFromGmail();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (connected) sync();
  }, [connected]);

  const now = Date.now();
  const nextInterview = (jobs ?? [])
    .filter((j) => j.status === 'interview' && j.interviewAt && new Date(j.interviewAt).getTime() > now)
    .sort((a, b) => a.interviewAt!.localeCompare(b.interviewAt!))[0];
  const sorted = [...(jobs ?? [])].sort(
    (a, b) =>
      Number(ACTIVE.includes(b.status)) - Number(ACTIVE.includes(a.status)) ||
      (b.lastUpdate ?? b.sentAt ?? '').localeCompare(a.lastUpdate ?? a.sentAt ?? ''),
  );
  const activeCount = sorted.filter((j) => ACTIVE.includes(j.status)).length;
  const synced = lastJobsSync();

  return (
    <section className="jobs" aria-label="Job applications">
      <header className="view-header">
        <div>
          <h1>Job applications</h1>
          <span className="muted small">
            {connected
              ? synced
                ? `Updated from your inbox · ${new Date(synced).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
                : 'Connected to Gmail'
              : 'Connect Google in Settings to track applications from Gmail'}
          </span>
        </div>
        <div className="header-actions">
          {connected && (
            <button className="icon-btn" aria-label="Refresh from Gmail" onClick={sync} disabled={syncing}>
              <RefreshIcon />
            </button>
          )}
          <button className="round-btn small" aria-label="Add application" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
            <PlusIcon />
          </button>
        </div>
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {adding && (
        <form
          className="add-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!company.trim()) return;
            const today = new Date().toISOString().slice(0, 10);
            await db.jobs.add({ company: company.trim(), role: role.trim(), status: 'sent', sentAt: today, lastUpdate: today, source: 'manual' });
            setCompany('');
            setRole('');
            setAdding(false);
          }}
        >
          <label>
            <span className="muted small">Company</span>
            <input autoFocus value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
          <label>
            <span className="muted small">Role</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} />
          </label>
          <button className="btn primary" type="submit">
            Add application
          </button>
        </form>
      )}

      {nextInterview && (
        <section className="next-interview" aria-label="Next interview">
          <span className="eyebrow">Next interview</span>
          <strong className="company">{nextInterview.company}</strong>
          <span>
            {nextInterview.role} ·{' '}
            {new Date(nextInterview.interviewAt!).toLocaleString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </section>
      )}

      <div className="list-header">
        <h2>All applications</h2>
        <span className="muted small">{activeCount} active</span>
      </div>

      <ul className="list">
        {sorted.map((j) => {
          const h = hint(j);
          return (
            <li key={j.id} className="card job">
              <div className="job-row">
                <div className="job-main">
                  <span className="title">{j.company}</span>
                  <span className="muted small">
                    {j.role || 'Role not set'}
                    {j.sentAt ? ` · sent ${new Date(j.sentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                  </span>
                </div>
                <label className="sr-only" htmlFor={`status-${j.id}`}>
                  Status for {j.company}
                </label>
                <select
                  id={`status-${j.id}`}
                  className={`pill pill-${j.status}`}
                  value={j.status}
                  onChange={(e) =>
                    db.jobs.update(j.id!, { status: e.target.value as JobStatus, lastUpdate: new Date().toISOString().slice(0, 10) })
                  }
                >
                  {Object.entries(JOB_STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              {h && <p className="job-note">{h}</p>}
              {j.source !== 'gmail' && (
                <button className="link-btn" onClick={() => db.jobs.delete(j.id!)}>
                  <TrashIcon /> Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {jobs && jobs.length === 0 && (
        <p className="muted">
          No applications yet. {connected ? 'Jarvis will add them as confirmation emails arrive.' : 'Tap + or tell Jarvis "I applied to…".'}
        </p>
      )}
    </section>
  );
}
