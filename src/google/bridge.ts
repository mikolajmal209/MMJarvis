import { getSettings, hasGoogleBridge } from '../settings';

/**
 * Talks to the Google Apps Script web app in /apps-script. The script runs in the
 * user's own Google account, so Gmail and Calendar access needs no OAuth app here.
 * Requests are sent as text/plain to stay "simple" and avoid a CORS preflight,
 * which Apps Script cannot answer.
 */
export async function callBridge<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const s = getSettings();
  if (!hasGoogleBridge(s)) {
    throw new Error('Google is not connected. Add the Google bridge URL and token in Settings.');
  }
  const res = await fetch(s.googleBridgeUrl, {
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
