import { describe, expect, it } from 'vitest';
import { memoryReconstruction as t, type MemoryLevel, type MemorySubmission } from './memory-reconstruction';
import { validateParams, listTemplates } from '../registry';

const params = t.defaultParams;
const perfect = (level: MemoryLevel, recallMs = 0): MemorySubmission => ({
  rounds: level.rounds.map((r) => ({ placements: r.placements, recallMs })),
});

describe('memory-reconstruction', () => {
  it('generates the same level for the same seed', () => {
    expect(t.generateLevel(params, 'seed-a')).toEqual(t.generateLevel(params, 'seed-a'));
    expect(t.generateLevel(params, 'seed-a')).not.toEqual(t.generateLevel(params, 'seed-b'));
  });

  it('respects the params', () => {
    const p = { ...params, gridRows: 3, gridCols: 5, objectCount: 7, distractorCount: 3, rounds: 4 };
    const level = t.generateLevel(p, 'x');
    expect(level.rows).toBe(3);
    expect(level.cols).toBe(5);
    expect(level.rounds).toHaveLength(4);
    for (const round of level.rounds) {
      expect(round.placements).toHaveLength(7);
      expect(new Set(round.placements.map((pl) => pl.cell)).size).toBe(7);
      expect(round.tray).toHaveLength(10);
      for (const pl of round.placements) {
        expect(pl.cell).toBeLessThan(15);
        expect(round.tray).toContain(pl.icon);
      }
    }
  });

  it('scores a perfect instant game at 100', () => {
    const level = t.generateLevel(params, 'p');
    const res = t.score(level, perfect(level), { durationMs: 20_000 }, params);
    expect(res.score).toBe(100);
    expect(res.breakdown.correct).toBe(params.objectCount * params.rounds);
    expect(res.breakdown.wrong).toBe(0);
  });

  it('gives less speed bonus for slower recall', () => {
    const level = t.generateLevel(params, 'p');
    const fast = t.score(level, perfect(level, 1_000), { durationMs: 0 }, params).score;
    const slow = t.score(level, perfect(level, 25_000), { durationMs: 0 }, params).score;
    expect(fast).toBeGreaterThan(slow);
  });

  it('gives no speed bonus after the time limit', () => {
    const level = t.generateLevel(params, 'p');
    const res = t.score(level, perfect(level, params.recallTimeLimitMs + 1), { durationMs: 0 }, params);
    expect(res.breakdown.timeBonus).toBe(0);
  });

  it('penalises wrong placements, ignores duplicates and out-of-range cells, never goes negative', () => {
    const level = t.generateLevel(params, 'w');
    const round = level.rounds[0];
    const wrongIcon = round.tray.find((i) => i !== round.placements[0].icon)!;
    const sub: MemorySubmission = {
      rounds: [
        {
          placements: [
            { cell: round.placements[0].cell, icon: round.placements[0].icon },
            { cell: round.placements[0].cell, icon: wrongIcon }, // duplicate cell: ignored
            { cell: 999, icon: wrongIcon }, // out of range: ignored
          ],
          recallMs: params.recallTimeLimitMs,
        },
      ],
    };
    const res = t.score(level, sub, { durationMs: 0 }, params);
    expect(res.breakdown.correct).toBe(1);
    expect(res.breakdown.wrong).toBe(0);

    const allWrong: MemorySubmission = {
      rounds: [{ placements: [{ cell: round.placements[0].cell, icon: wrongIcon }], recallMs: 0 }],
    };
    expect(t.score(level, allWrong, { durationMs: 0 }, params).score).toBe(0);
  });

  it('scores an empty submission at 0', () => {
    const level = t.generateLevel(params, 'e');
    expect(t.score(level, { rounds: [] }, { durationMs: 0 }, params).score).toBe(0);
  });
});

describe('validateParams', () => {
  it('merges defaults and accepts partial params', () => {
    const res = validateParams('memory-reconstruction', { objectCount: 8 });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.params as typeof params).objectCount).toBe(8);
  });

  it('rejects objectCount larger than the grid', () => {
    const res = validateParams('memory-reconstruction', { gridRows: 2, gridCols: 2, objectCount: 5 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.map((e) => e.path)).toContain('objectCount');
  });

  it('rejects an icon pool that is too small', () => {
    const res = validateParams('memory-reconstruction', { iconPool: ['a', 'b'], objectCount: 3 });
    expect(res.ok).toBe(false);
  });

  it('rejects unknown templates', () => {
    expect(validateParams('nope', {}).ok).toBe(false);
  });

  it('exposes a JSON schema for the admin editor', () => {
    const d = listTemplates().find((t) => t.key === 'memory-reconstruction')!;
    const schema = d.paramsJsonSchema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toContain('objectCount');
  });
});
