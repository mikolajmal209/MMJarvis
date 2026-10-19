import { useSyncExternalStore } from 'react';

export interface Settings {
  geminiApiKey: string;
  model: string;
  /** Google Apps Script web app URL that gives Jarvis Gmail and Calendar access. */
  googleBridgeUrl: string;
  googleBridgeToken: string;
  speakReplies: boolean;
  voiceLang: string;
  userName: string;
}

export const DEFAULT_MODEL = 'gemini-flash-latest';

const DEFAULTS: Settings = {
  geminiApiKey: '',
  model: DEFAULT_MODEL,
  googleBridgeUrl: '',
  googleBridgeToken: '',
  speakReplies: true,
  voiceLang: 'en-US',
  userName: '',
};

const KEY = 'jarvis.settings';
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = load();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage can be unavailable (private mode); keep settings in memory for this visit.
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function hasGoogleBridge(s: Settings = current) {
  return Boolean(s.googleBridgeUrl && s.googleBridgeToken);
}
