import Link from 'next/link';
import type { GameSummary } from '@/lib/types';

export function GameCard({ game }: { game: GameSummary }) {
  return (
    <Link href={`/games/${game.slug}`} className="card group block transition hover:border-brand">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>~{game.estMinutes} min</span>
        {game.status !== 'LIVE' && <span className="text-warn">{game.status} (admin preview)</span>}
        {game.attemptsLeft !== null && <span>{game.attemptsLeft} plays left today</span>}
      </div>
      <h3 className="mt-2 text-xl font-bold group-hover:text-brand">{game.name}</h3>
      <p className="mt-1 text-sm text-muted">{game.description}</p>
      <div className="mt-3 flex gap-2">
        {game.presets.map((p) => (
          <span key={p.key} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
            {p.label}
          </span>
        ))}
      </div>
    </Link>
  );
}
