'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';

interface Profile {
  user: { name: string; email: string; ageMode: string };
  totals: { plays: number; gamesPlayed: number };
  games: { game: { slug: string; name: string }; plays: number; best: number; average: number }[];
  recent: {
    id: string;
    game: { slug: string; name: string };
    difficulty: string;
    status: string;
    score: number | null;
    startedAt: string;
  }[];
}

function ProfileView() {
  const { data } = useSWR<Profile>('/me/profile', fetcher);
  if (!data) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">{data.user.name}</h1>
        <p className="text-muted">Skill profile</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-sm text-muted">Games completed</p>
          <p className="text-4xl font-black">{data.totals.plays}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">Different games played</p>
          <p className="text-4xl font-black">{data.totals.gamesPlayed}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.games.map((g) => (
          <Link key={g.game.slug} href={`/games/${g.game.slug}`} className="card block hover:border-brand">
            <p className="font-bold">{g.game.name}</p>
            <div className="mt-3 grid grid-cols-3 text-center">
              <div>
                <p className="text-2xl font-black">{g.best}</p>
                <p className="text-xs text-muted">Best</p>
              </div>
              <div>
                <p className="text-2xl font-black">{g.average}</p>
                <p className="text-xs text-muted">Average</p>
              </div>
              <div>
                <p className="text-2xl font-black">{g.plays}</p>
                <p className="text-xs text-muted">Plays</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div>
        <h2 className="mb-2 text-xl font-bold">Recent games</h2>
        <div className="card divide-y divide-line p-0">
          {data.recent.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="flex-1">
                {s.game.name} · {s.difficulty}
              </span>
              <span className="text-muted">{new Date(s.startedAt).toLocaleString()}</span>
              <span className="w-24 text-right font-bold">
                {s.status === 'COMPLETED' ? s.score : <span className="text-warn">{s.status.toLowerCase()}</span>}
              </span>
            </div>
          ))}
          {data.recent.length === 0 && <p className="px-5 py-6 text-muted">No games yet.</p>}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileView />
    </RequireAuth>
  );
}
