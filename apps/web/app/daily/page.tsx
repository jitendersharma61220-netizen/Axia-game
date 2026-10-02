'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { ActiveChallenge } from '@/lib/types';
import { ChallengeCard } from '@/components/ChallengeCard';

export default function DailyPage() {
  const { data } = useSWR<ActiveChallenge[]>('/challenges/today', fetcher);
  return (
    <div>
      <h1 className="text-3xl font-black">Challenges</h1>
      <p className="mb-6 mt-1 text-muted">Everyone gets the same puzzle. One shot each. Make it count.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
        {data?.length === 0 && <p className="text-muted">No challenges are running right now. Check back tomorrow!</p>}
      </div>
    </div>
  );
}
