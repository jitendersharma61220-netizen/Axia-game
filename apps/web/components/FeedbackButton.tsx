'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

/** Floating "Feedback" button for beta players. Hidden in the admin area. */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  if (pathname.startsWith('/admin')) return null;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      await api('/feedback', { body: { message, page: pathname, ...(rating && { rating }) } });
      setState('sent');
      setMessage('');
      setRating(null);
      setTimeout(() => {
        setOpen(false);
        setState('idle');
      }, 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send feedback');
      setState('error');
    }
  };

  return (
    <>
      <button
        className="fixed bottom-4 right-4 z-30 rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold shadow-lg hover:border-brand"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
      >
        💬 Feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/50 p-4 sm:place-items-center" onClick={() => setOpen(false)}>
          <form onSubmit={send} className="card w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Help us improve Axia</h2>
              <button type="button" className="text-muted" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            {state === 'sent' ? (
              <p className="py-6 text-center text-good">Thanks! We read every message. 🙏</p>
            ) : (
              <>
                <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={rating === r}
                      className={`text-2xl ${rating !== null && r <= rating ? '' : 'opacity-30'}`}
                      onClick={() => setRating(r)}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
                <textarea
                  className="input min-h-28"
                  required
                  minLength={2}
                  maxLength={2000}
                  placeholder="Was anything confusing? What did you love? Found a bug?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button className="btn-primary w-full" type="submit" disabled={state === 'sending'}>
                  {state === 'sending' ? 'Sending…' : 'Send feedback'}
                </button>
                {state === 'error' && <p className="text-sm text-bad">{error}</p>}
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
