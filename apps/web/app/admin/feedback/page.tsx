'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { fmt } from '@/lib/dates';

interface FeedbackList {
  total: number;
  pageSize: number;
  averageRating: number | null;
  ratings: number;
  items: { id: string; message: string; page: string; rating: number | null; createdAt: string; user: { email: string; name: string } | null }[];
}

export default function AdminFeedback() {
  const [page, setPage] = useState(1);
  const { data } = useSWR<FeedbackList>(`/admin/feedback?page=${page}`, fetcher);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black">Beta feedback</h1>
      <div className="flex gap-3">
        <div className="card p-4">
          <p className="text-xs text-muted">Messages</p>
          <p className="text-3xl font-black">{data?.total ?? '–'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Average rating ({data?.ratings ?? 0} rated)</p>
          <p className="text-3xl font-black">{data?.averageRating ?? '–'} <span className="text-lg">⭐</span></p>
        </div>
      </div>
      <div className="card divide-y divide-line p-0">
        {data?.items.map((f) => (
          <div key={f.id} className="space-y-1 px-5 py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
              <span>
                {f.user?.email ?? 'anonymous'} · on <span className="font-mono">{f.page}</span>
                {f.rating && <span className="ml-2">{'⭐'.repeat(f.rating)}</span>}
              </span>
              <span>{fmt(f.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap">{f.message}</p>
          </div>
        ))}
        {data?.items.length === 0 && <p className="px-5 py-6 text-muted">No feedback yet.</p>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span className="text-muted">Page {page} of {pages}</span>
        <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
