import { getSettings, hasGoogleBridge } from '../settings';

/**
 * Talks to the Google Apps Script web app in /apps-script. The script runs in the
 * user's own Google account, so Gmail and Calendar access needs no OAuth app here.
 * Requests are sent as text/plain to stay "simple" and avoid a CORS preflight,
 * which Apps Script cannot answer.
 */
// Only Apps Script web app URLs, so the token (which unlocks Gmail) is never sent anywhere else.
const BRIDGE_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/;

export function isValidBridgeUrl(url: string) {
  return BRIDGE_URL.test(url);
}

export async function callBridge<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const s = getSettings();
  if (!hasGoogleBridge(s)) {
    throw new Error('Google is not connected. Add the Google bridge URL and token in Settings.');
  }
  if (!isValidBridgeUrl(s.googleBridgeUrl)) {
    throw new Error('The Google bridge URL must look like https://script.google.com/macros/s/…/exec.');
  }
  const res = await fetch(s.googleBridgeUrl, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: s.googleBridgeToken, action, params }),
  });
  if (!res.ok) throw new Error(`Google bridge error ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Google bridge request failed');
  return data.result as T;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface BridgeJob {
  id: string;
  company: string;
  role: string;
  status: string;
  sentAt?: string;
  lastUpdate?: string;
  interviewAt?: string;
  note?: string;
}
