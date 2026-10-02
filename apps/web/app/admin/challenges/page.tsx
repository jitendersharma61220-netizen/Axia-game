'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmt, fromLocalInput, toLocalInput } from '@/lib/dates';

interface Challenge {
  id: string;
  type: 'DAILY' | 'WEEKLY';
  title: string;
  seed: string;
  startsAt: string;
  endsAt: string;
  game: { id: string; name: string };
  preset: { id: string; label: string };
  _count: { sessions: number };
}

interface GameWithPresets {
  id: string;
  name: string;
  presets: { id: string; label: string }[];
}

function defaultWindow(type: 'DAILY' | 'WEEKLY') {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + (type === 'DAILY' ? 1 : 7));
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export default function AdminChallenges() {
  const { data, mutate } = useSWR<Challenge[]>('/admin/challenges', fetcher);
  const { data: games } = useSWR<{ id: string; name: string }[]>('/admin/games', fetcher);
  const [gameId, setGameId] = useState('');
  const selectedGame = gameId || games?.[0]?.id;
  const { data: game } = useSWR<GameWithPresets>(selectedGame ? `/admin/games/${selectedGame}` : null, fetcher);
  const [form, setForm] = useState({ type: 'DAILY' as 'DAILY' | 'WEEKLY', title: '', presetId: '', ...defaultWindow('DAILY') });
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/challenges', {
        body: { ...form, gameId: selectedGame, presetId: form.presetId || game?.presets[0]?.id },
      });
      setForm({ ...form, title: '' });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed');
    }
  };

  const remove = async (c: Challenge) => {
    if (!confirm(`Delete “${c.title}”?`)) return;
    await api(`/admin/challenges/${c.id}`, { method: 'DELETE' });
    await mutate();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Challenges</h1>
      <form onSubmit={create} className="card space-y-3">
        <h2 className="font-bold">Schedule a challenge</h2>
        <p className="text-sm text-muted">Every player gets the identical level (fixed seed) and one attempt.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="c-game">Game</label>
            <select id="c-game" className="input" value={selectedGame ?? ''} onChange={(e) => setGameId(e.target.value)}>
              {games?.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-preset">Difficulty</label>
            <select id="c-preset" className="input" value={form.presetId} onChange={(e) => setForm({ ...form, presetId: e.target.value })}>
              {game?.presets.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-type">Type</label>
            <select
              id="c-type"
              className="input"
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as 'DAILY' | 'WEEKLY';
                setForm({ ...form, type, ...defaultWindow(type) });
              }}
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-title">Title</label>
            <input id="c-title" className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="c-start">Starts</label>
            <input id="c-start" type="datetime-local" className="input" required value={toLocalInput(form.startsAt)} onChange={(e) => setForm({ ...form, startsAt: fromLocalInput(e.target.value) ?? '' })} />
          </div>
          <div>
            <label className="label" htmlFor="c-end">Ends</label>
            <input id="c-end" type="datetime-local" className="input" required value={toLocalInput(form.endsAt)} onChange={(e) => setForm({ ...form, endsAt: fromLocalInput(e.target.value) ?? '' })} />
          </div>
        </div>
        <button className="btn-primary" type="submit">Schedule</button>
        {error && <p className="text-sm text-bad">{error}</p>}
      </form>

      <div className="card divide-y divide-line p-0">
        {data?.map((c) => {
          const live = new Date(c.startsAt).getTime() <= now && now < new Date(c.endsAt).getTime();
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className={`w-16 text-xs font-bold ${live ? 'text-good' : 'text-muted'}`}>{live ? 'LIVE' : c.type}</span>
              <span className="flex-1">
                <b>{c.title}</b> · {c.game.name} · {c.preset.label}
              </span>
              <span className="text-muted">
                {fmt(c.startsAt)} → {fmt(c.endsAt)}
              </span>
              <span className="text-muted">{c._count.sessions} plays</span>
              <button className="text-xs text-bad underline" onClick={() => remove(c)}>delete</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
