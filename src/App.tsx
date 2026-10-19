import { useEffect, useState, type ReactNode } from 'react';
import { ChatView } from './components/ChatView';
import { TasksView } from './components/TasksView';
import { JobsView } from './components/JobsView';
import { SettingsView } from './components/SettingsView';
import { ChatIcon, JobsIcon, SettingsIcon, TasksIcon } from './components/Icons';
import { useSettings } from './settings';

type View = 'chat' | 'tasks' | 'jobs' | 'settings';

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: 'chat', label: 'Chat', icon: <ChatIcon /> },
  { id: 'tasks', label: 'Tasks', icon: <TasksIcon /> },
  { id: 'jobs', label: 'Jobs', icon: <JobsIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

function initialView(): View {
  const h = location.hash.slice(1) as View;
  return NAV.some((n) => n.id === h) ? h : 'chat';
}

export function App() {
  const settings = useSettings();
  const [view, setView] = useState<View>(() => (settings.geminiApiKey ? initialView() : 'settings'));

  useEffect(() => {
    history.replaceState(null, '', `#${view}`);
  }, [view]);

  const nav = (cls: string) => (
    <nav className={cls} aria-label="Main">
      {NAV.map((n) => (
        <button key={n.id} aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
          {n.icon}
          <span>{n.label}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className={`app view-${view}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">Jarvis</span>
        </div>
        {nav('side-nav')}
      </aside>

      <main className="main">
        {!settings.geminiApiKey && view !== 'settings' && (
          <p className="notice">Add your free Gemini API key in Settings to start chatting.</p>
        )}
        {view === 'chat' && <ChatView />}
        {view === 'tasks' && <TasksView />}
        {view === 'jobs' && <JobsView />}
        {view === 'settings' && <SettingsView />}
      </main>

      {view === 'chat' && (
        <aside className="side-panel">
          <TasksView compact />
        </aside>
      )}

      {nav('bottom-nav')}
    </div>
  );
}
