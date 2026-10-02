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
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-5 py-2">User</th>
              <th>Age mode</th>
              <th>Plays</th>
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
