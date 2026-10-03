'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { api, ApiError, fetcher, postStep } from '@/lib/api';
import type { GameSummary, SessionResult, ShipSkinData, StartedSession } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import { ResultScreen } from '@/components/game/ResultScreen';

const PhaserGame = dynamic(() => import('@/components/game/PhaserGame').then((m) => m.PhaserGame), {
  ssr: false,
  loading: () => <p className="text-center text-muted">Loading game…</p>,
});

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'playing'; session: StartedSession }
  | { kind: 'submitting'; session: StartedSession }
  | { kind: 'result'; session: StartedSession; result: SessionResult };

interface ShareInfo {
  player: string;
  score: number;
}

function Play() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, refresh } = useAuth();
  const challengeId = search.get('challenge');
  const vs = search.get('vs');
  const { data: game, error: gameError, mutate } = useSWR<GameSummary>(`/games/${slug}`, fetcher);
  const { data: rival } = useSWR<ShareInfo>(vs ? `/share/${vs}` : null, fetcher);
  // Purely visual extras (e.g. a Neon Dodge ship skin) the player has equipped.
  const { data: equipped } = useSWR<{ items: { kind: string; data: ShipSkinData }[] }>(user ? `/shop/equipped/${slug}` : null, fetcher);
  const ship = equipped?.items.find((i) => i.kind === 'SKIN')?.data;
  const [difficulty, setDifficulty] = useState<string | null>(search.get('difficulty'));
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (game && !difficulty) setDifficulty((game.presets.find((p) => p.isDefault) ?? game.presets[0])?.key ?? null);
  }, [game, difficulty]);

  const start = async (useCoins = false) => {
    if (!user) return router.push(`/login?next=${encodeURIComponent(`${pathname}?${search.toString()}`)}`);
    if (!user.onboarded) return router.push(`/onboarding?next=${encodeURIComponent(`${pathname}?${search.toString()}`)}`);
    setError(null);
    setState({ kind: 'starting' });
    try {
      const session = await api<StartedSession>(`/games/${slug}/sessions`, {
        body: challengeId ? { challengeId } : { difficulty, ...(useCoins ? { useCoins: true } : {}) },
      });
      if (useCoins) void refresh();
      setState({ kind: 'playing', session });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the game');
      setState({ kind: 'idle' });
    }
  };

  const onComplete = useCallback(
    async (submission: unknown) => {
      if (state.kind !== 'playing') return;
      const session = state.session;
      setState({ kind: 'submitting', session });
      try {
        const result = await api<SessionResult>(`/sessions/${session.sessionId}/submit`, { body: { submission } });
        setState({ kind: 'result', session, result });
        void mutate();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not submit your score');
        setState({ kind: 'idle' });
      }
    },
    [state, mutate],
  );

  // Free plays used up: an adult can buy one more with coins (never for challenges).
  const outOfPlays = game?.attemptsLeft === 0;
  const extraCost = !challengeId && user?.ageMode === 'ADULT' && game?.extraTryCoins ? game.extraTryCoins : null;
  const canAfford = extraCost !== null && (user?.coins ?? 0) >= extraCost;

  if (gameError) return <p className="text-bad">Game not found.</p>;
  if (!game) return <p className="text-muted">Loading…</p>;

  if (state.kind === 'playing' || state.kind === 'submitting') {
    return (
      <div className="mx-auto max-w-[540px]">
        <div className="mb-2 flex items-center justify-between text-sm text-muted">
          <span>{state.session.game.name}</span>
          <span>{state.session.challenge?.title ?? state.session.difficulty.label}</span>
        </div>
        <PhaserGame
          templateKey={state.session.game.templateKey}
          level={state.session.level}
          onComplete={onComplete}
          server={{ step: (index, step) => postStep(state.session.sessionId, index, step) }}
          cosmetics={ship ? { ship } : undefined}
        />
        {state.kind === 'submitting' && <p className="mt-3 text-center text-muted">Scoring…</p>}
      </div>
    );
  }

  if (state.kind === 'result') {
    return (
      <ResultScreen
        result={state.result}
        gameName={game.name}
        gameSlug={game.slug}
        rival={rival ? { player: rival.player, score: rival.score } : null}
        canPlayAgain={!challengeId && ((game.attemptsLeft ?? 0) > 0 || canAfford)}
        playAgainCost={outOfPlays ? extraCost : null}
        onPlayAgain={() => {
          setState({ kind: 'idle' });
          void start(outOfPlays && canAfford);
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/games" className="text-sm text-muted">
        ← All games
      </Link>
      <div className="card space-y-4">
        {rival && (
          <p className="rounded-lg bg-brand/15 p-3 text-center font-semibold">
            {rival.player} scored {rival.score}. Can you beat them?
          </p>
        )}
        <h1 className="text-3xl font-black">{game.name}</h1>
        <p className="text-muted">{game.description}</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          {game.howToPlay.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        {challengeId ? (
          <p className="text-sm text-brand-2">Challenge mode: same puzzle for everyone, one attempt.</p>
        ) : (
          <div>
            <p className="label">Difficulty</p>
            <div className="flex gap-2">
              {game.presets.map((p) => (
                <button
                  key={p.key}
                  className={p.key === difficulty ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => setDifficulty(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">
            {game.attemptsLeft !== null ? `${game.attemptsLeft} of ${game.attemptsPerDay} free plays left today` : `~${game.estMinutes} min`}
          </span>
          {outOfPlays && extraCost !== null ? (
            canAfford ? (
              <button className="btn-primary px-6 py-3 text-lg" onClick={() => start(true)} disabled={state.kind === 'starting'} data-testid="play-with-coins">
                {state.kind === 'starting' ? 'Starting…' : `Play again · 🪙 ${extraCost}`}
              </button>
            ) : (
              <Link href="/shop" className="btn-primary px-6 py-3 text-lg">
                Get coins for another play
              </Link>
            )
          ) : (
            <button className="btn-primary px-8 py-3 text-lg" onClick={() => start()} disabled={state.kind === 'starting' || outOfPlays}>
              {state.kind === 'starting' ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>
        {outOfPlays && extraCost !== null && (
          <p className="text-right text-xs text-muted">Free plays reset at midnight IST. You have 🪙 {user?.coins ?? 0}.</p>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense>
      <Play />
    </Suspense>
  );
}
