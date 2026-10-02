'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Static summary of a generated level, so admins can see the effect of a
 * change before saving it. One small renderer per template, plus a JSON fallback.
 */
export function LevelPreview({ templateKey, level, serverLevel }: { templateKey: string; level: any; serverLevel?: any }) {
  const render = previews[templateKey];
  if (!render) {
    return <pre className="max-h-64 overflow-auto rounded bg-ink p-3 text-xs text-muted">{JSON.stringify(level, null, 2)}</pre>;
  }
  return <div className="space-y-2 text-sm">{render(level, serverLevel ?? level)}</div>;
}

/** `level` is what players receive; `full` is the admin-only server level including answers. */
const previews: Record<string, (level: any, full: any) => React.ReactNode> = {
  'memory-reconstruction': (level) => {
    const round = level.rounds[0];
    const byCell = new Map<number, string>(round.placements.map((p: any) => [p.cell, p.icon]));
    return (
      <>
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
      </>
    );
  },

  'rule-shift': (level, full) => {
    const runs: { rule: string; n: number }[] = [];
    for (const t of full.trials) {
      const last = runs[runs.length - 1];
      if (last?.rule === t.rule) last.n++;
      else runs.push({ rule: t.rule, n: 1 });
    }
    return (
      <p>
        {level.trials.length} cards · hidden rule sequence: <b>{runs.map((r) => `${r.rule}×${r.n}`).join(' → ')}</b>
        {level.showRuleHint ? ' · rule shown to player (easy mode)' : ' · players never see it'}
      </p>
    );
  },

  'digital-detective': (level) => {
    const c = level.cases[0];
    return (
      <>
        <p>
          {level.cases.length} case(s). Case 1: <b>Someone {c.crime}.</b>
        </p>
        <ul className="list-disc pl-5 text-muted">
          {c.clues.map((clue: string) => (
            <li key={clue}>{clue}</li>
          ))}
        </ul>
        <table className="text-xs">
          <tbody>
            {c.suspects.map((s: any) => (
              <tr key={s.name}>
                <td className="pr-3 font-bold">{s.name}</td>
                <td className="text-muted">{level.attributes.map((a: any) => s.facts[a.key]).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  },

  'neural-boss': (level, full) => (
    <>
      <p>
        Boss HP {level.bossHp} · lives {level.playerHp} · {level.questions.length} questions · first 5 (answers are never sent to players):
      </p>
      <ol className="list-decimal pl-5 text-muted">
        {full.questions.slice(0, 5).map((q: any, i: number) => (
          <li key={i}>
            {q.prompt} <span className="text-good">→ {q.options[q.answer]}</span>
          </li>
        ))}
      </ol>
    </>
  ),

  'internet-cafe-mission': (level) => (
    <>
      {level.note && <p>📌 {level.note}</p>}
      <ol className="list-decimal pl-5 text-muted">
        {level.stages.map((s: any, i: number) => (
          <li key={i}>
            <b className="text-white">{s.title}</b> ({s.kind})
            {s.kind === 'files' && ` · find ${s.targetName}`}
            {s.kind === 'captcha' && ` · ${s.grid}×${s.grid}, target ${s.target}`}
            {s.kind === 'sequence' && ` · ${s.order.length} keys`}
            {s.kind === 'bill' && ` · ${s.lines.length} lines`}
          </li>
        ))}
      </ol>
    </>
  ),
};
