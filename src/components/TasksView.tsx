import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Task } from '../db';
import { PlusIcon, TrashIcon } from './Icons';

type Filter = 'today' | 'upcoming' | 'done';

const todayKey = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time

function bucket(t: Task): Filter {
  if (t.done) return 'done';
  if (!t.due) return 'today';
  return t.due.slice(0, 10) <= todayKey() ? 'today' : 'upcoming';
}

export function formatDue(due?: string) {
  if (!due) return 'No date';
  const hasTime = due.length > 10;
  const d = new Date(hasTime ? due : `${due}T00:00`);
  if (Number.isNaN(d.getTime())) return due;
  const day = due.slice(0, 10);
  const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE');
  const label =
    day === todayKey()
      ? 'Today'
      : day === tomorrow
        ? 'Tomorrow'
        : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const overdue = day < todayKey() ? ' · overdue' : '';
  return hasTime ? `${label} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}${overdue}` : label + overdue;
}

export function TasksView({ compact = false }: { compact?: boolean }) {
  const tasks = useLiveQuery(() => db.tasks.orderBy('createdAt').toArray(), []);
  const [filter, setFilter] = useState<Filter>('today');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  const shown = (tasks ?? [])
    .filter((t) => bucket(t) === (compact ? 'today' : filter))
    .sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));

  async function add() {
    if (!title.trim()) return;
    await db.tasks.add({ title: title.trim(), due: due || undefined, done: 0, createdAt: Date.now() });
    setTitle('');
    setDue('');
    setAdding(false);
  }

  return (
    <section className={compact ? 'tasks compact' : 'tasks'} aria-label={compact ? "Today's tasks" : 'Tasks'}>
      <header className="view-header">
        {compact ? <h2>Today</h2> : <h1>Tasks</h1>}
        <button className="round-btn small" aria-label="Add task" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          <PlusIcon />
        </button>
      </header>

      {adding && (
        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label>
            <span className="sr-only">Task</span>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
          </label>
          <label>
            <span className="muted small">Due (optional)</span>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <button className="btn primary" type="submit">
            Add task
          </button>
        </form>
      )}

      {!compact && (
        <div className="segmented" role="group" aria-label="Filter tasks">
          {(['today', 'upcoming', 'done'] as Filter[]).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      <ul className="list">
        {shown.map((t) => (
          <li key={t.id} className={`card task ${t.done ? 'done' : ''}`}>
            <input
              type="checkbox"
              id={`task-${compact ? 'c' : 'm'}-${t.id}`}
              checked={!!t.done}
              onChange={() => db.tasks.update(t.id!, { done: t.done ? 0 : 1, completedAt: t.done ? undefined : Date.now() })}
            />
            <label htmlFor={`task-${compact ? 'c' : 'm'}-${t.id}`}>
              <span className="title">{t.title}</span>
              <span className="muted small">{formatDue(t.due)}</span>
            </label>
            <button className="icon-btn ghost" aria-label={`Delete ${t.title}`} onClick={() => db.tasks.delete(t.id!)}>
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
      {tasks && shown.length === 0 && <p className="muted">Nothing here. Say "Jarvis, add…" or tap + to create a task.</p>}
    </section>
  );
}
