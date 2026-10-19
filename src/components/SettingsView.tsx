import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { listModels } from '../ai/gemini';
import { callBridge, isValidBridgeUrl } from '../google/bridge';
import { DEFAULT_MODEL, updateSettings, useSettings } from '../settings';
import { TrashIcon } from './Icons';

const VOICE_LANGS = [
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['pl-PL', 'Polski'],
];

export function SettingsView() {
  const s = useSettings();
  const memories = useLiveQuery(() => db.memories.orderBy('createdAt').toArray(), []);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function loadModels() {
    setStatus('Loading models…');
    try {
      setModels(await listModels());
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  async function testGoogle() {
    setStatus('Testing Google connection…');
    try {
      const r = await callBridge<{ email: string }>('ping');
      setStatus(`Connected to Google as ${r.email}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="settings" aria-label="Settings">
      <header className="view-header">
        <h1>Settings</h1>
      </header>

      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}

      <fieldset>
        <legend>AI model</legend>
        <label>
          <span>Gemini API key</span>
          <input
            type="password"
            autoComplete="off"
            value={s.geminiApiKey}
            onChange={(e) => updateSettings({ geminiApiKey: e.target.value.trim() })}
            placeholder="Paste your key"
          />
          <span className="muted small">
            Free from{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
            . Stored only on this device.
          </span>
        </label>
        <label>
          <span>Model</span>
          {models.length ? (
            <select value={s.model} onChange={(e) => updateSettings({ model: e.target.value })}>
              {!models.includes(s.model) && <option value={s.model}>{s.model}</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input value={s.model} onChange={(e) => updateSettings({ model: e.target.value.trim() || DEFAULT_MODEL })} />
          )}
        </label>
        <button className="btn secondary" type="button" onClick={loadModels} disabled={!s.geminiApiKey}>
          Show available models
        </button>
      </fieldset>

      <fieldset>
        <legend>Google (Gmail and Calendar)</legend>
        <p className="muted small">
          Deploy the Jarvis Google script once (see the README), then paste its web app URL and secret token here.
        </p>
        <label>
          <span>Web app URL</span>
          <input
            value={s.googleBridgeUrl}
            onChange={(e) => updateSettings({ googleBridgeUrl: e.target.value.trim() })}
            placeholder="https://script.google.com/macros/s/…/exec"
          />
          {s.googleBridgeUrl && !isValidBridgeUrl(s.googleBridgeUrl) && (
            <span className="muted small">This must be the script.google.com web app URL ending in /exec.</span>
          )}
        </label>
        <label>
          <span>Secret token</span>
          <input
            type="password"
            autoComplete="off"
            value={s.googleBridgeToken}
            onChange={(e) => updateSettings({ googleBridgeToken: e.target.value.trim() })}
          />
        </label>
        <button className="btn secondary" type="button" onClick={testGoogle} disabled={!s.googleBridgeUrl || !s.googleBridgeToken}>
          Test connection
        </button>
      </fieldset>

      <fieldset>
        <legend>Voice and you</legend>
        <label>
          <span>Your name</span>
          <input value={s.userName} onChange={(e) => updateSettings({ userName: e.target.value })} />
        </label>
        <label>
          <span>Voice language</span>
          <select value={s.voiceLang} onChange={(e) => updateSettings({ voiceLang: e.target.value })}>
            {VOICE_LANGS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.speakReplies} onChange={(e) => updateSettings({ speakReplies: e.target.checked })} />
          <span>Read replies aloud</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Memory</legend>
        <p className="muted small">Facts Jarvis remembers about you across conversations.</p>
        <ul className="list">
          {memories?.map((m) => (
            <li key={m.id} className="card memory">
              <span>{m.fact}</span>
              <button className="icon-btn ghost" aria-label={`Forget: ${m.fact}`} onClick={() => db.memories.delete(m.id!)}>
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
        {memories?.length === 0 && <p className="muted small">Nothing yet. Tell Jarvis "remember that…".</p>}
        <button
          className="btn secondary"
          type="button"
          onClick={() => {
            if (confirm('Delete the whole chat history? Remembered facts are kept.')) db.messages.clear();
          }}
        >
          Clear chat history
        </button>
      </fieldset>
    </section>
  );
}
