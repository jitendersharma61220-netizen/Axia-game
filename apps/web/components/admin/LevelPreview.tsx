'use client';

interface PreviewLevel {
  rows: number;
  cols: number;
  rounds: { placements: { cell: number; icon: string }[]; tray: string[] }[];
}

/** Static render of round 1 of a generated level, so admins can see a change before saving it. */
export function LevelPreview({ level }: { level: PreviewLevel }) {
  const round = level.rounds[0];
  const byCell = new Map(round.placements.map((p) => [p.cell, p.icon]));
  return (
    <div className="space-y-3">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${level.cols}, minmax(0, 2.5rem))` }}>
        {Array.from({ length: level.rows * level.cols }, (_, i) => (
          <div key={i} className="grid aspect-square place-items-center rounded border border-line bg-ink text-xl">
            {byCell.get(i) ?? ''}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Tray: <span className="text-base">{round.tray.join(' ')}</span> · {level.rounds.length} round(s)
      </p>
    </div>
  );
}
