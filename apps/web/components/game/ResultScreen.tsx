'use client';

import Link from 'next/link';
import { useState } from 'react';
import { track } from '@/lib/api';
import type { SessionResult } from '@/lib/types';

interface Props {
  result: SessionResult;
  gameName: string;
  gameSlug: string;
  /** Set when the player arrived from a friend's challenge link. */
  rival?: { player: string; score: number } | null;
  canPlayAgain: boolean;
  /** Coins the next play costs (free plays used up), or null when it's free. */
  playAgainCost?: number | null;
  onPlayAgain: () => void;
}

export function ResultScreen({ result, gameName, gameSlug, rival, canPlayAgain, playAgainCost, onPlayAgain }: Props) {
  const [copied, setCopied] = useState(false);
  const rank = result.challengeLeaderboard ?? result.leaderboard;
  const won = rival ? result.score > rival.score : null;
  const flagged = result.status === 'FLAGGED';

  const share = async () => {
    const url = `${window.location.origin}/c/${result.sessionId}`;
    const text = `I scored ${formatScore(result)} on ${gameName}. Can you beat me?`;
    track('share_click', { sessionId: result.sessionId, game: gameSlug });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Axia challenge', text, url });
        return;
      } catch {
        // User cancelled or share failed: fall back to copying.
      }
    }
    await navigator.clipboard?.writeText(`${text} ${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="card mx-auto max-w-md text-center" data-testid="result">
      {won !== null && (
        <p className={`text-3xl font-black ${won ? 'text-good' : 'text-warn'}`}>
          {won ? 'YOU WON!' : result.score === rival!.score ? 'IT’S A TIE!' : 'SO CLOSE!'}
        </p>
      )}
      {rival && (
        <p className="mt-1 text-sm text-muted">
          {rival.player} scored {rival.score}
        </p>
      )}
      <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted">Your score</p>
      <p className={`${result.maxScore ? 'text-7xl' : 'text-6xl'} font-black tabular-nums`} data-testid="score">
        {result.maxScore ? result.score : result.score.toLocaleString('en-IN')}
        {result.maxScore > 0 && <span className="text-3xl text-muted">/{result.maxScore}</span>}
      </p>
      {rank && !flagged && (
        <p className="mt-2 text-2xl font-bold text-brand-2" data-testid="percentile">
          {rank.rank === 1 ? '#1 · TOP SCORE' : `TOP ${rank.topPercent}%`}
        </p>
      )}
      {rank && !flagged && (
        <p className="text-sm text-muted">
          Rank #{rank.rank} of {rank.total}
          {result.isPersonalBest && ' · New personal best!'}
        </p>
      )}
      {flagged && (
        <p className="mt-3 rounded-lg bg-warn/10 p-3 text-sm text-warn">
          {result.fraudFlags?.includes('off_pace')
            ? 'This run didn’t keep real-time pace (it was paused, rewound or sped up), so it won’t count on the leaderboard.'
            : 'This run finished faster than humanly possible, so it won’t count on the leaderboard.'}
        </p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
        {result.highlights.map((h) => (
          <Stat key={h.label} label={h.label} value={h.value} />
        ))}
      </div>
      {result.notes.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-line p-3 text-left text-sm" data-testid="notes">
          {result.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {!flagged && (
          <button className="btn-primary py-3 text-lg" onClick={share}>
            {rival ? 'Challenge another friend' : 'Challenge a friend'}
          </button>
        )}
        {copied && <p className="text-sm text-good">Link copied. Send it to a friend!</p>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={onPlayAgain} disabled={!canPlayAgain}>
            {playAgainCost ? `Play again · 🪙 ${playAgainCost}` : 'Play again'}
          </button>
          <Link className="btn-ghost" href={`/leaderboard?game=${gameSlug}`}>
            Leaderboard
          </Link>
        </div>
      </div>
    </div>
  );
}

/** "92/100" for scored games, "18,450" for endless ones (maxScore 0). */
function formatScore(r: Pick<SessionResult, 'score' | 'maxScore'>) {
  return r.maxScore ? `${r.score}/${r.maxScore}` : r.score.toLocaleString('en-IN');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line p-2">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
