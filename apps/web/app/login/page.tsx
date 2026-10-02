'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { readAttribution, setInviteCode } from '@/lib/attribution';
import type { Me } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import { GoogleButton } from '@/components/GoogleButton';

const INVITE_ERRORS: Record<string, string> = {
  INVITE_REQUIRED: 'Axia is in closed beta. Enter an invite code (or open a friend’s challenge link) to join.',
  INVITE_INVALID: 'That invite code isn’t valid or has expired. Double-check it with whoever sent it.',
  INVITE_EXHAUSTED: 'That invite code has been fully used. Ask for a new one!',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
};

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/games';
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState('');
  const [hasRef, setHasRef] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const a = readAttribution();
    setInvite(a.inviteCode ?? '');
    setHasRef(!!a.ref);
  }, []);

  const done = useCallback(async () => {
    const me = (await refresh()) as { user: Me | null } | undefined;
    router.replace(me?.user && !me.user.onboarded ? `/onboarding?next=${encodeURIComponent(next)}` : next);
  }, [refresh, router, next]);

  const fail = useCallback((err: unknown) => {
    if (err instanceof ApiError) setError((err.code && INVITE_ERRORS[err.code]) ?? err.message);
    else setError('Sign-in failed. Please try again.');
  }, []);

  const devLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/auth/dev-login', { body: { email, ...readAttribution() } });
      await done();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-10">
      <div className="card space-y-6">
        <div>
          <span className="rounded-full border border-brand-2/40 bg-brand-2/10 px-3 py-1 text-xs font-semibold text-brand-2">Closed beta</span>
          <h1 className="mt-3 text-2xl font-black">Sign in to Axia</h1>
          <p className="mt-1 text-sm text-muted">Save your scores, climb leaderboards and challenge friends.</p>
        </div>

        <div>
          <label className="label" htmlFor="invite">
            Invite code <span className="text-xs">(new players)</span>
          </label>
          <input
            id="invite"
            className="input uppercase"
            placeholder="e.g. COLLEGE50"
            value={invite}
            onChange={(e) => {
              setInvite(e.target.value);
              setInviteCode(e.target.value);
            }}
          />
          {hasRef && !invite && <p className="mt-1 text-xs text-good">✓ You were invited through a friend’s challenge link.</p>}
        </div>

        <GoogleButton onSignedIn={done} onError={fail} />

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
        {error && (
          <p className="rounded-lg bg-bad/10 p-3 text-sm text-bad" data-testid="login-error">
            {error}
          </p>
        )}
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
