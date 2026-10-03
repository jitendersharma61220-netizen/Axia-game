'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { GameSummary } from '@/lib/types';
import { GameSections } from '@/components/GameSections';

export default function GamesPage() {
  const { data, error } = useSWR<GameSummary[]>('/games', fetcher);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">Games</h1>
      {error && <p className="text-bad">Couldn’t load games.</p>}
      {data && <GameSections games={data} />}
    </div>
  );
}
