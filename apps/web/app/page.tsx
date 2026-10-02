'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { ActiveChallenge, GameSummary } from '@/lib/types';
import { ChallengeCard } from '@/components/ChallengeCard';
import { GameCard } from '@/components/GameCard';

export default function Home() {
  const { data: games } = useSWR<GameSummary[]>('/games', fetcher);
  const { data: challenges } = useSWR<ActiveChallenge[]>('/challenges/today', fetcher);
  const daily = challenges?.find((c) => c.type === 'DAILY');

  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 py-6 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-black leading-tight md:text-5xl">
            Sharpen your mind.
            <br />
            <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent">Beat your friends.</span>
          </h1>
          <p className="mt-4 text-lg text-muted">
            5–15 minute skill games, a fresh daily challenge, and leaderboards that show exactly where you stand.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={daily ? `/games/${daily.game.slug}?challenge=${daily.id}` : '/games'} className="btn-primary">
              Play today’s challenge
            </Link>
            <Link href="/games" className="btn-ghost">
              Browse games
            </Link>
          </div>
        </div>
        {daily && <ChallengeCard challenge={daily} />}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Games</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games?.map((g) => <GameCard key={g.slug} game={g} />)}
          {games?.length === 0 && <p className="text-muted">No games are live right now.</p>}
        </div>
      </section>
    </div>
  );
}
