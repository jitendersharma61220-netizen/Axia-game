'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { fmt } from '@/lib/dates';

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

/** Only fields that changed, so "objectCount 5 → 9" is obvious at a glance. */
function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const flat = (o: Record<string, unknown> | null, prefix = ''): Record<string, string> =>
    Object.entries(o ?? {}).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(acc, flat(v as Record<string, unknown>, `${prefix}${k}.`));
      else acc[`${prefix}${k}`] = JSON.stringify(v);
      return acc;
    }, {});
  const a = flat(before);
  const b = flat(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => a[k] !== b[k] && k !== 'updatedAt')
    .map((k) => ({ key: k, from: a[k], to: b[k] }));
}

export default function AdminAudit() {
  const [entity, setEntity] = useState('');
  const { data } = useSWR<{ items: AuditRow[] }>(`/admin/audit?entity=${entity}`, fetcher);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black">Audit log</h1>
      <select className="input w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
        <option value="">All</option>
        <option value="game">Games</option>
        <option value="preset">Presets</option>
        <option value="challenge">Challenges</option>
        <option value="user">Users</option>
      </select>
      <div className="card divide-y divide-line p-0">
        {data?.items.map((row) => (
          <div key={row.id} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span>
                <b>{row.actor}</b> {row.action}d {row.entity} <span className="font-mono text-xs text-muted">{row.entityId}</span>
              </span>
              <span className="text-xs text-muted">{fmt(row.createdAt)}</span>
            </div>
            {row.action === 'update' && (
              <ul className="mt-1 font-mono text-xs text-muted">
                {diff(row.before, row.after).map((d) => (
                  <li key={d.key}>
                    {d.key}: <span className="text-bad">{d.from ?? '∅'}</span> → <span className="text-good">{d.to ?? '∅'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {data?.items.length === 0 && <p className="px-5 py-6 text-muted">No changes yet.</p>}
      </div>
    </div>
  );
}
