import Link from 'next/link';
import type { GameSummary } from '@/lib/types';
import { GameCard } from './GameCard';

/** Big neon card for the arcade games: the main event. */
function ArcadeCard({ game }: { game: GameSummary }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className="group relative block overflow-hidden rounded-2xl border border-brand/50 bg-[#070a16] p-6 transition hover:border-brand-2"
      data-testid={`arcade-${game.slug}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 20%, rgba(255,79,163,.35), transparent 40%), radial-gradient(circle at 15% 85%, rgba(34,211,238,.3), transparent 45%), linear-gradient(rgba(124,92,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(124,92,255,.12) 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 30px 30px, 30px 30px',
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest">
          <span className="rounded-full bg-brand-2/20 px-2 py-0.5 text-brand-2">Arcade</span>
          <span className="text-muted">endless · ~{game.estMinutes} min a run</span>
        </div>
        <h3 className="mt-3 text-4xl font-black tracking-tight group-hover:text-brand-2">{game.name}</h3>
        <p className="mt-2 max-w-md text-muted">{game.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {game.presets.map((p) => (
            <span key={p.key} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
              {p.label}
            </span>
          ))}
          {game.attemptsLeft !== null && <span className="text-xs text-muted">· {game.attemptsLeft} runs left today</span>}
        </div>
        <span className="btn-primary mt-5 inline-flex px-6 py-3 text-lg">Play now</span>
      </div>
    </Link>
  );
}

/** Arcade games up top, the gentler puzzle games below as warm-ups. */
export function GameSections({ games }: { games: GameSummary[] }) {
  const arcade = games.filter((g) => g.category === 'arcade');
  const warmups = games.filter((g) => g.category !== 'arcade');
  if (!games.length) return <p className="text-muted">No games are live right now.</p>;
  return (
    <div className="space-y-8">
      {arcade.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {arcade.map((g) => (
            <ArcadeCard key={g.slug} game={g} />
          ))}
        </div>
      )}
      {warmups.length > 0 && (
        <div>
          <h3 className="mb-1 text-xl font-bold">Warm-ups</h3>
          <p className="mb-4 text-sm text-muted">Short brain teasers to get your head in the game.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {warmups.map((g) => (
              <GameCard key={g.slug} game={g} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
