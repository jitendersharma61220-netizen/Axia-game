'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import useSWR from 'swr';
import { fetcher, track } from '@/lib/api';
import { rememberChallengeRef } from '@/lib/attribution';

interface Share {
  player: string;
  score: number;
  maxScore: number;
  game: { slug: string; name: string; description: string; estMinutes: number };
  difficulty: { key: string; label: string };
  challenge: { id: string; title: string } | null;
}

/** Landing page for a friend's challenge link: "Jitender scored 92. Can you beat them?" */
export default function ChallengeLanding() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data, error } = useSWR<Share>(`/share/${sessionId}`, fetcher);

  useEffect(() => {
    track('share_open', { sessionId });
    // A friend's challenge link doubles as a closed-beta invite.
    rememberChallengeRef(sessionId);
  }, [sessionId]);

  if (error) return <p className="py-10 text-center text-muted">This challenge link has expired.</p>;
  if (!data) return <p className="py-10 text-center text-muted">Loading…</p>;

  const href = data.challenge
    ? `/games/${data.game.slug}?challenge=${data.challenge.id}&vs=${sessionId}`
    : `/games/${data.game.slug}?difficulty=${data.difficulty.key}&vs=${sessionId}`;

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="card">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-2">You’ve been challenged</p>
        <h1 className="mt-3 text-3xl font-black">
          {data.player} scored {data.score}.
          <br />
          Can you beat them?
        </h1>
        <p className="mt-3 text-muted">
          {data.game.name} · {data.challenge?.title ?? data.difficulty.label} · ~{data.game.estMinutes} min
        </p>
        <p className="mt-1 text-sm text-muted">{data.game.description}</p>
        <Link href={href} className="btn-primary mt-6 w-full py-3 text-lg" onClick={() => track('challenge_accept', { sessionId })}>
          Accept challenge
        </Link>
      </div>
    </div>
  );
}
