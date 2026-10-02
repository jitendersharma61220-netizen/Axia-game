'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { fmt } from '@/lib/dates';

interface Dashboard {
  today: { newUsers: number; activeUsers: number; sessions: number; completed: number; flagged: number };
  usersTotal: number;
  games: { game: { name: string; slug: string }; started: number; completed: number; completionRate: number | null; avgScore: number | null }[];
  events: Record<string, number>;
  recentFlagged: { id: string; user: string; game: string; score: number; durationMs: number; flags: string[]; startedAt: string }[];
}

export default function AdminDashboard() {
  const { data } = useSWR<Dashboard>('/admin/dashboard', fetcher, { refreshInterval: 15_000 });
  if (!data) return <p className="text-muted">Loading…</p>;
  const tiles = [
    ['Total users', data.usersTotal],
    ['New today', data.today.newUsers],
    ['Active today', data.today.activeUsers],
    ['Games started', data.today.sessions],
    ['Completed', data.today.completed],
    ['Flagged', data.today.flagged],
  ] as const;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-3xl font-black">{value}</p>
          </div>
        ))}
      </div>

      <section className="card p-0">
        <h2 className="border-b border-line px-5 py-3 font-bold">Games today</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-5 py-2">Game</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Completion</th>
              <th>Avg score</th>
            </tr>
          </thead>
          <tbody>
            {data.games.map((g) => (
              <tr key={g.game.slug} className="border-t border-line">
                <td className="px-5 py-2">{g.game.name}</td>
                <td>{g.started}</td>
                <td>{g.completed}</td>
                <td>{g.completionRate === null ? '—' : `${g.completionRate}%`}</td>
                <td>{g.avgScore ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-bold">Events today</h2>
          {Object.keys(data.events).length === 0 && <p className="text-sm text-muted">No events yet.</p>}
          <ul className="space-y-1 text-sm">
            {Object.entries(data.events).map(([name, n]) => (
              <li key={name} className="flex justify-between">
                <span className="font-mono text-muted">{name}</span>
                <span className="font-bold">{n}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="mb-3 font-bold">Fraud: recently flagged runs</h2>
          {data.recentFlagged.length === 0 && <p className="text-sm text-muted">Nothing flagged.</p>}
          <ul className="space-y-2 text-sm">
            {data.recentFlagged.map((f) => (
              <li key={f.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {f.user} · {f.game}
                </span>
                <span className="text-warn">
                  {f.flags.join(', ')} · {(f.durationMs / 1000).toFixed(1)}s · score {f.score}
                </span>
                <span className="w-full text-xs text-muted">{fmt(f.startedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
