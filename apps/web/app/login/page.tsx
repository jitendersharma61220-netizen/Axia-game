'use client';

import { Suspense, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { GoogleButton } from '@/components/GoogleButton';
import type { Me } from '@/lib/types';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/games';
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const done = useCallback(async () => {
    const me = (await refresh()) as { user: Me | null } | undefined;
    router.replace(me?.user && !me.user.onboarded ? `/onboarding?next=${encodeURIComponent(next)}` : next);
  }, [refresh, router, next]);

  const devLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/auth/dev-login', { body: { email } });
      await done();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-10">
      <div className="card space-y-6">
        <div>
          <h1 className="text-2xl font-black">Sign in to Axia</h1>
          <p className="mt-1 text-sm text-muted">Save your scores, climb leaderboards and challenge friends.</p>
        </div>
        <GoogleButton onSignedIn={done} />
        {process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === 'true' && (
          <form onSubmit={devLogin} className="space-y-2 border-t border-line pt-4">
            <label className="label" htmlFor="dev-email">
              Developer sign-in (local only)
            </label>
            <input
              id="dev-email"
              className="input"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn-ghost w-full" type="submit">
              Continue
            </button>
          </form>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
