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
  rec.continuous = false;
  let text = '';
  let cancelled = false;
  rec.onresult = (e) => {
    text = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join('');
    onText(text);
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    onError(e.error === 'not-allowed' ? 'Microphone access was blocked.' : `Voice error: ${e.error}`);
  };
  rec.onend = () => onDone(cancelled ? '' : text.trim());
  rec.start();
  return {
    stop: () => rec.stop(),
    cancel: () => {
      cancelled = true;
      rec.abort();
    },
    dispose: () => {
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
