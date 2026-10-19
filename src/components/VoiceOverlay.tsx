import { useEffect, useRef, useState } from 'react';
import { listen, type Listener } from '../voice';
import { MicIcon } from './Icons';

export function VoiceOverlay(props: { lang: string; onResult: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listener = useRef<Listener | null>(null);
  // Keep the latest callbacks without restarting recognition on every render.
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    listener.current = listen(
      props.lang,
      setText,
      (final) => (final ? cb.current.onResult(final) : cb.current.onClose()),
      setError,
    );
    return () => listener.current?.dispose();
  }, [props.lang]);

  return (
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-label="Voice input">
      <div className={`voice-rings ${error ? '' : 'active'}`}>
        <div className="voice-core">
          <MicIcon size={52} />
        </div>
      </div>
      <p className="voice-state">{error ? 'Voice unavailable' : 'Listening…'}</p>
      <p className="voice-text">{error ?? (text ? `"${text}"` : 'Speak now')}</p>
      <div className="voice-actions">
        <button className="btn secondary" onClick={() => (error ? props.onClose() : listener.current?.cancel())}>
          Cancel
        </button>
        {!error && (
          <button className="btn primary" onClick={() => listener.current?.stop()}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
