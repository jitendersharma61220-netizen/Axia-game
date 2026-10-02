'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

function Onboarding() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/games';
  const { user, loading, refresh } = useAuth();
  const [birthYear, setBirthYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (user?.onboarded) router.replace(next);
  }, [loading, user, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/me/onboarding', { method: 'PATCH', body: { birthYear: Number(birthYear) } });
      await refresh();
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <div className="mx-auto max-w-sm py-10">
      <form onSubmit={submit} className="card space-y-4">
        <h1 className="text-2xl font-black">One quick thing</h1>
        <p className="text-sm text-muted">
          We tailor Axia by age. Players aged 14–18 get a separate free experience. If you are under 18, please play with a
          parent’s or guardian’s permission.{' '}
          <Link className="underline" href="/privacy#children">
            How we handle data of players under 18
          </Link>
        </p>
        <div>
          <label className="label" htmlFor="birthYear">
            Year of birth
          </label>
          <select id="birthYear" className="input" required value={birthYear} onChange={(e) => setBirthYear(e.target.value)}>
            <option value="">Select…</option>
            {Array.from({ length: 80 }, (_, i) => thisYear - 8 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary w-full" type="submit">
          Continue
        </button>
        {error && <p className="text-sm text-bad">{error}</p>}
      </form>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
