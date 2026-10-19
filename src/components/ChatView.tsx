import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ask } from '../ai/gemini';
import { updateSettings, useSettings } from '../settings';
import { canListen, speak, stopSpeaking } from '../voice';
import { MicIcon, SendIcon, SpeakerIcon } from './Icons';
import { VoiceOverlay } from './VoiceOverlay';

const TOOL_LABELS: Record<string, string> = {
  add_task: 'Adding a task',
  list_tasks: 'Checking your tasks',
  complete_task: 'Completing a task',
  remember: 'Remembering that',
  get_calendar_events: 'Checking your calendar',
  create_calendar_event: 'Adding to your calendar',
  search_email: 'Searching your email',
  list_job_applications: 'Checking your applications',
  refresh_job_applications_from_gmail: 'Refreshing applications from Gmail',
};

export function ChatView() {
  const settings = useSettings();
  const messages = useLiveQuery(() => db.messages.orderBy('createdAt').toArray(), []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length, busy]);

  const lastModel = [...(messages ?? [])].reverse().find((m) => m.model)?.model ?? settings.model;

  async function send(text: string, fromVoice = false) {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    setInput('');
    stopSpeaking();
    await db.messages.add({ role: 'user', text: t, createdAt: Date.now() });
    setBusy('Thinking');
    try {
      const reply = await ask(
        (tool) => setBusy(TOOL_LABELS[tool] ?? 'Working'),
        async (action) => confirm(`Jarvis wants to: ${action}\n\nAllow?`),
      );
      await db.messages.add({ role: 'assistant', text: reply.text, createdAt: Date.now(), model: reply.model });
      if (settings.speakReplies || fromVoice) speak(reply.text, settings.voiceLang);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="chat" aria-label="Chat">
      <header className="view-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <div className="brand-text">
            <h1>Jarvis</h1>
            <span className="muted small" title="AI model answering you">
              Model: {lastModel} · {busy ? 'Working' : 'Ready'}
            </span>
          </div>
        </div>
        <button
          className="icon-btn"
          aria-label={settings.speakReplies ? 'Turn off spoken replies' : 'Turn on spoken replies'}
          aria-pressed={settings.speakReplies}
          onClick={() => {
            if (settings.speakReplies) stopSpeaking();
            updateSettings({ speakReplies: !settings.speakReplies });
          }}
        >
          <SpeakerIcon on={settings.speakReplies} />
        </button>
      </header>

      <div className="messages" aria-live="polite">
        {messages?.length === 0 && (
          <div className="empty">
            <p>Hi{settings.userName ? `, ${settings.userName}` : ''}. Ask me anything, or try:</p>
            <ul>
              <li>"What's on my list today?"</li>
              <li>"Remind me to call mom tomorrow at six"</li>
              <li>"How are my job applications going?"</li>
            </ul>
          </div>
        )}
        {messages?.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="bubble assistant pending">{busy}…</div>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="msg" className="sr-only">
          Message Jarvis
        </label>
        <input
          id="msg"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Jarvis anything"
          autoComplete="off"
        />
        {input.trim() ? (
          <button className="round-btn" type="submit" aria-label="Send" disabled={!!busy}>
            <SendIcon />
          </button>
        ) : (
          <button
            className="round-btn"
            type="button"
            aria-label="Talk to Jarvis"
            disabled={!canListen() || !!busy}
            title={canListen() ? undefined : 'Voice input is not supported in this browser'}
            onClick={() => {
              stopSpeaking();
              setVoiceOpen(true);
            }}
          >
            <MicIcon />
          </button>
        )}
      </form>

      {voiceOpen && (
        <VoiceOverlay
          lang={settings.voiceLang}
          onClose={() => setVoiceOpen(false)}
          onResult={(text) => {
            setVoiceOpen(false);
            send(text, true);
          }}
        />
      )}
    </section>
  );
}
