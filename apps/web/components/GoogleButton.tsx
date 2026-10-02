'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { readAttribution } from '@/lib/attribution';

interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** Google Identity Services button. The API verifies the returned ID token. */
export function GoogleButton({ onSignedIn, onError }: { onSignedIn: () => void; onError: (err: unknown) => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    const render = () => {
      window.google!.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            await api('/auth/google', { body: { idToken: credential, ...readAttribution() } });
            onSignedIn();
          } catch (e) {
            onError(e);
          }
        },
      });
      window.google!.accounts.id.renderButton(ref.current!, { theme: 'filled_black', size: 'large', shape: 'pill', width: 280 });
    };
    if (window.google) return render();
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    return () => script?.removeEventListener('load', render);
  }, [clientId, onSignedIn, onError]);

  if (!clientId) {
    return <p className="text-sm text-muted">Google sign-in isn’t configured yet (set NEXT_PUBLIC_GOOGLE_CLIENT_ID).</p>;
  }
  return <div ref={ref} />;
}
