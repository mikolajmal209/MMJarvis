// Browser speech APIs: free and built in. Chrome/Edge (desktop and Android) and Safari support them.

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const canListen = () => Boolean(recognitionCtor());
export const canSpeak = () => 'speechSynthesis' in window;

export interface Listener {
  stop(): void;
  cancel(): void;
  /** Stops without calling any callback, for unmounting. */
  dispose(): void;
}

// The browser ends recognition at the first short pause, so Jarvis restarts it and only
// finishes after this much silence, or when the user taps Done.
const SILENCE_MS = 3000;
// How long to wait for the first word before giving up.
const NO_SPEECH_MS = 8000;

/** Starts listening. onText gets the live transcript; onDone gets the final text (empty if cancelled). */
export function listen(
  lang: string,
  onText: (text: string) => void,
  onDone: (text: string) => void,
  onError: (message: string) => void,
): Listener {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    onError('Voice input is not supported in this browser. Try Chrome or Edge.');
    return { stop() {}, cancel() {}, dispose() {} };
  }
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  // Single-shot sessions chained together: continuous mode repeats words on Android Chrome.
  rec.continuous = false;
  let committed = ''; // text from earlier sessions
  let current = ''; // text from the running session
  let finished = false; // no more restarts
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const full = () => [committed, current].filter(Boolean).join(' ');
  const finish = () => {
    finished = true;
    clearTimeout(timer);
    rec.stop();
  };
  const waitFor = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(finish, ms);
  };
  rec.onresult = (e) => {
    current = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join('')
      .trim();
    onText(full());
    waitFor(SILENCE_MS);
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return;
    if (e.error === 'no-speech') {
      // Silence inside a session: finish only if nothing was said yet and the wait is over.
      if (!full()) finished = true;
      return;
    }
    finished = true;
    onError(e.error === 'not-allowed' ? 'Microphone access was blocked.' : `Voice error: ${e.error}`);
  };
  rec.onend = () => {
    committed = full();
    current = '';
    if (!finished && !cancelled) {
      try {
        rec.start();
        return;
      } catch {
        // Some browsers refuse a restart without a tap; keep what was heard.
      }
    }
    clearTimeout(timer);
    onDone(cancelled ? '' : committed);
  };
  rec.start();
  waitFor(NO_SPEECH_MS);
  return {
    stop: finish,
    cancel: () => {
      cancelled = true;
      finished = true;
      clearTimeout(timer);
      rec.abort();
    },
    dispose: () => {
      finished = true;
      clearTimeout(timer);
      rec.onresult = rec.onerror = rec.onend = null;
      rec.abort();
    },
  };
}

export function speak(text: string, lang: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  // Strip markdown symbols so they are not read aloud.
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>]/g, ''));
  u.lang = lang;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
