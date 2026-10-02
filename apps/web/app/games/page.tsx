'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { GameSummary } from '@/lib/types';
import { GameCard } from '@/components/GameCard';

export default function GamesPage() {
  const { data, error } = useSWR<GameSummary[]>('/games', fetcher);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">Games</h1>
      {error && <p className="text-bad">Couldn’t load games.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((g) => <GameCard key={g.slug} game={g} />)}
      </div>
    </div>
  );
}
