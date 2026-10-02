'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmt, fromLocalInput } from '@/lib/dates';

interface Invite {
  id: string;
  code: string;
  label: string;
  maxUses: number | null;
  uses: number;
  activated: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export default function AdminInvites() {
  const { data, mutate } = useSWR<Invite[]>('/admin/invites', fetcher);
  const [form, setForm] = useState({ code: '', label: '', maxUses: '50', expiresAt: '' });
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/invites', {
        body: {
          code: form.code,
          label: form.label,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: fromLocalInput(form.expiresAt),
        },
      });
      setForm({ code: '', label: '', maxUses: '50', expiresAt: '' });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed');
    }
  };

  const toggle = async (i: Invite) => {
    await api(`/admin/invites/${i.id}`, { method: 'PATCH', body: { active: !i.active } });
    await mutate();
  };

  const copy = async (code: string) => {
    await navigator.clipboard?.writeText(`${origin}/?invite=${code}`);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Invite codes</h1>
        <p className="text-sm text-muted">
          With <code>SIGNUP_MODE=invite</code>, new players need a code or a friend’s challenge link. Make one code per group
          (college, creator, WhatsApp group) to see which group signs up and actually plays.
        </p>
      </div>

      <form onSubmit={create} className="card grid gap-3 sm:grid-cols-5 sm:items-end">
        <div>
          <label className="label" htmlFor="i-code">Code</label>
          <input id="i-code" className="input uppercase" required pattern="[A-Za-z0-9-]{3,40}" placeholder="COLLEGE50" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="i-label">Who is it for?</label>
          <input id="i-label" className="input" required placeholder="DU college group" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="i-max">Max uses</label>
          <input id="i-max" className="input" type="number" min={1} placeholder="∞" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="i-exp">Expires (optional)</label>
          <input id="i-exp" className="input" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </div>
        <button className="btn-primary sm:col-span-5 sm:w-fit" type="submit">Create code</button>
        {error && <p className="text-sm text-bad sm:col-span-5">{error}</p>}
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-5 py-2">Code</th>
              <th>Group</th>
              <th>Sign-ups</th>
              <th title="Signed up and completed at least one game">Played</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.map((i) => {
              const full = i.maxUses !== null && i.uses >= i.maxUses;
              return (
                <tr key={i.id} className={`border-t border-line ${i.active ? '' : 'opacity-50'}`} data-testid={`invite-${i.code}`}>
                  <td className="px-5 py-2 font-mono font-bold">{i.code}</td>
                  <td>{i.label}</td>
                  <td>
                    {i.uses}
                    {i.maxUses !== null && <span className="text-muted"> / {i.maxUses}</span>}
                    {full && <span className="ml-2 text-xs text-warn">full</span>}
                  </td>
                  <td>{i.activated}</td>
                  <td className="text-xs text-muted">{fmt(i.expiresAt)}</td>
                  <td className="space-x-3 pr-5 text-right text-xs">
                    <button className="underline" onClick={() => copy(i.code)}>{copied === i.code ? 'copied!' : 'copy link'}</button>
                    <button className={`underline ${i.active ? 'text-bad' : 'text-good'}`} onClick={() => toggle(i)}>
                      {i.active ? 'deactivate' : 'activate'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {data?.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-muted" colSpan={6}>No codes yet. Create one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
