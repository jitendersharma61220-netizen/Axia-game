'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ActiveChallenge } from '@/lib/types';

function useCountdown(to: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m ${s}s`;
}

export function ChallengeCard({ challenge }: { challenge: ActiveChallenge }) {
  const left = useCountdown(challenge.endsAt);
  const played = challenge.mySession;
  return (
    <div className="card relative overflow-hidden">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/20 blur-2xl" />
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-2">
        {challenge.type === 'DAILY' ? 'Daily challenge' : 'Weekly challenge'}
      </p>
      <h3 className="mt-1 text-2xl font-black">{challenge.title}</h3>
      <p className="mt-1 text-sm text-muted">
        {challenge.game.name} · {challenge.difficulty} · same puzzle for everyone
      </p>
      <p className="mt-3 text-sm">Ends in <span className="font-mono">{left}</span></p>
      <div className="mt-4 flex gap-2">
        {played ? (
          <>
            <span className="btn-ghost cursor-default">
              {played.score !== null ? `Your score: ${played.score}` : 'Played'}
            </span>
            <Link href={`/leaderboard?challenge=${challenge.id}`} className="btn-ghost">
              Standings
            </Link>
          </>
        ) : (
          <Link href={`/games/${challenge.game.slug}?challenge=${challenge.id}`} className="btn-primary">
            Play now
          </Link>
        )}
      </div>
    </div>
  );
}
