'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { GameSummary, LeaderboardResponse } from '@/lib/types';

const PERIODS = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: 'This week' },
  { key: 'all', label: 'All time' },
];

function Board() {
  const search = useSearchParams();
  const challengeId = search.get('challenge');
  const { data: games } = useSWR<GameSummary[]>('/games', fetcher);
  const [slug, setSlug] = useState<string | null>(search.get('game'));
  const [period, setPeriod] = useState('daily');

  useEffect(() => {
    if (!slug && games?.length) setSlug(games[0].slug);
  }, [games, slug]);

  const key = challengeId ? `/leaderboards/challenge/${challengeId}` : slug ? `/leaderboards/${slug}?period=${period}` : null;
  const { data } = useSWR<LeaderboardResponse>(key, fetcher);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-black">{challengeId ? 'Challenge standings' : 'Leaderboard'}</h1>
      {!challengeId && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select className="input w-auto" value={slug ?? ''} onChange={(e) => setSlug(e.target.value)}>
            {games?.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>
          {PERIODS.map((p) => (
            <button key={p.key} className={p.key === period ? 'btn-primary' : 'btn-ghost'} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {data?.me && (
        <div className="card mt-4 flex items-center justify-between">
          <span>
            You: <b>#{data.me.rank}</b> of {data.me.total}
          </span>
          <span className="font-bold text-brand-2">TOP {data.me.topPercent}%</span>
          <span>Best {data.me.best}</span>
        </div>
      )}

      <div className="card mt-4 divide-y divide-line p-0">
        {data?.entries.map((e, i) => (
          <div key={i} className={`flex items-center gap-3 px-5 py-3 ${e.isMe ? 'bg-brand/10' : ''}`}>
            <span className="w-8 text-lg font-black text-muted">{e.rank}</span>
            <span className="flex-1">
              {e.name}
              {e.isMe && <span className="ml-2 text-xs text-brand">you</span>}
            </span>
            <span className="font-mono text-lg font-bold">{e.score}</span>
          </div>
        ))}
        {data && data.entries.length === 0 && <p className="px-5 py-6 text-muted">No scores yet. Be the first!</p>}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  );
}
