'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmt } from '@/lib/dates';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  ageMode: string | null;
  banned: boolean;
  coins: number;
  createdAt: string;
  _count: { sessions: number };
}

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, mutate } = useSWR<{ total: number; pageSize: number; items: UserRow[] }>(
    `/admin/users?q=${encodeURIComponent(q)}&page=${page}`,
    fetcher,
  );
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<UserRow | null>(null);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');

  const adjust = async () => {
    if (!adjusting) return;
    setError(null);
    try {
      await api(`/admin/users/${adjusting.id}/coins`, { body: { delta: Number(delta), note } });
      setAdjusting(null);
      setDelta('');
      setNote('');
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed');
    }
  };

  const update = async (u: UserRow, body: Partial<Pick<UserRow, 'role' | 'banned'>>) => {
    setError(null);
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed');
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black">Users</h1>
      <input className="input max-w-sm" placeholder="Search email or name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {error && <p className="text-sm text-bad">{error}</p>}
      {adjusting && (
        <div className="card space-y-3" data-testid="coin-adjust">
          <p className="font-semibold">
            Adjust coins for {adjusting.name} <span className="text-muted">(balance 🪙 {adjusting.coins})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <input className="input w-36" type="number" placeholder="+50 or -20" value={delta} onChange={(e) => setDelta(e.target.value)} />
            <input className="input flex-1" placeholder="Reason (shown in the audit log and the player's history)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" disabled={!Number(delta) || note.trim().length < 3} onClick={adjust}>
              Apply
            </button>
            <button className="btn-ghost" onClick={() => setAdjusting(null)}>
              Cancel
            </button>
          </div>
          <p className="text-xs text-muted">Use for support and goodwill only. Coins must never be given as a prize for winning a game.</p>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-5 py-2">User</th>
              <th>Age mode</th>
              <th>Plays</th>
              <th>Coins</th>
              <th>Joined</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} className={`border-t border-line ${u.banned ? 'opacity-50' : ''}`}>
                <td className="px-5 py-2">
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td>{u.ageMode ?? '—'}</td>
                <td>{u._count.sessions}</td>
                <td>
                  <button className="text-warn underline" onClick={() => setAdjusting(u)} title="Adjust coins">
                    🪙 {u.coins}
                  </button>
                </td>
                <td className="text-xs text-muted">{fmt(u.createdAt)}</td>
                <td>
                  <select className="input w-auto py-1" value={u.role} onChange={(e) => update(u, { role: e.target.value as UserRow['role'] })}>
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td className="pr-5 text-right">
                  <button className={`text-xs underline ${u.banned ? 'text-good' : 'text-bad'}`} onClick={() => update(u, { banned: !u.banned })}>
                    {u.banned ? 'unban' : 'ban'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span className="text-muted">Page {page} of {pages} · {data?.total ?? 0} users</span>
        <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
