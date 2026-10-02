'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { api, ApiError, fetcher } from '@/lib/api';

interface AdminGame {
  id: string;
  slug: string;
  name: string;
  templateKey: string;
  status: string;
  ageModes: string[];
  attemptsPerDay: number;
  _count: { sessions: number; presets: number };
}

interface Template {
  key: string;
  name: string;
  description: string;
}

const statusColor: Record<string, string> = { LIVE: 'text-good', DRAFT: 'text-warn', DISABLED: 'text-bad' };

export default function AdminGames() {
  const { data, mutate } = useSWR<AdminGame[]>('/admin/games', fetcher);
  const { data: templates } = useSWR<Template[]>('/admin/templates', fetcher);
  const [form, setForm] = useState({ name: '', slug: '', description: '', templateKey: '' });
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/games', { body: { ...form, templateKey: form.templateKey || templates?.[0]?.key } });
      setForm({ name: '', slug: '', description: '', templateKey: '' });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Games & Difficulty</h1>
      <div className="card divide-y divide-line p-0">
        {data?.map((g) => (
          <Link key={g.id} href={`/admin/games/${g.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-white/5">
            <span className="flex-1">
              <span className="font-bold">{g.name}</span>
              <span className="ml-2 font-mono text-xs text-muted">/{g.slug}</span>
            </span>
            <span className="text-xs text-muted">{g.templateKey}</span>
            <span className="text-xs text-muted">{g.ageModes.join(' + ')}</span>
            <span className="text-xs text-muted">{g._count.presets} presets · {g._count.sessions} plays</span>
            <span className={`text-xs font-bold ${statusColor[g.status]}`}>{g.status}</span>
          </Link>
        ))}
      </div>

      <form onSubmit={create} className="card space-y-3">
        <h2 className="font-bold">New game from a template</h2>
        <p className="text-sm text-muted">
          Any installed template can be launched as many games as you like (e.g. “Memory Sprint” with different content and
          timings). New games start as DRAFT.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="g-name">Name</label>
            <input id="g-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="g-slug">Slug (URL)</label>
            <input id="g-slug" className="input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="g-desc">Description</label>
            <input id="g-desc" className="input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="g-tpl">Template</label>
            <select id="g-tpl" className="input" value={form.templateKey} onChange={(e) => setForm({ ...form, templateKey: e.target.value })}>
              {templates?.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-primary" type="submit">Create game</button>
        {error && <p className="text-sm text-bad">{error}</p>}
      </form>
    </div>
  );
}
