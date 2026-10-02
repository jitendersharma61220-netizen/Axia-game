import { describe, expect, it } from 'vitest';
import { clueMatches, digitalDetective as t } from './digital-detective';
import { validateParams } from '../registry';

const params = t.defaultParams;

describe('digital-detective', () => {
  it('always has exactly one suspect matching every clue', () => {
    for (let s = 0; s < 200; s++) {
      const p = { ...params, suspects: 3 + (s % 6), attributeCount: 2 + (s % 3), negativeClueRatio: (s % 5) / 4 };
      const level = t.generateLevel(p, `case-${s}`);
      for (const c of level.cases) {
        const fits = c.suspects.map((sus, i) => (c.clues.every((cl) => clueMatches(cl, sus)) ? i : -1)).filter((i) => i >= 0);
        expect(fits).toEqual([c.culprit]);
      }
    }
  });

  it('gives every suspect a unique profile and a unique name', () => {
    const level = t.generateLevel({ ...params, suspects: 8 }, 'uniq');
    for (const c of level.cases) {
      expect(new Set(c.suspects.map((s) => s.name)).size).toBe(8);
      expect(new Set(c.suspects.map((s) => JSON.stringify(s.facts))).size).toBe(8);
    }
  });

  it('never sends the culprit to the client', () => {
    const client = t.toClientLevel(t.generateLevel(params, 'x'), params);
    expect(JSON.stringify(client)).not.toContain('culprit"');
    expect(client.cases[0].clues.every((c) => typeof c === 'string')).toBe(true);
  });

  it('scores correct fast accusations at 100 and wrong ones at 0, with notes', () => {
    const level = t.generateLevel(params, 'score');
    const right = { cases: level.cases.map((c) => ({ accused: c.culprit, ms: 0 })) };
    expect(t.score(level, right, { durationMs: 0 }, params).score).toBe(100);
    const wrong = { cases: level.cases.map((c) => ({ accused: (c.culprit + 1) % c.suspects.length, ms: 1000 })) };
    const res = t.score(level, wrong, { durationMs: 0 }, params);
    expect(res.score).toBe(0);
    expect(res.notes?.[0]).toContain(level.cases[0].suspects[level.cases[0].culprit].name);
  });

  it('rejects pools too small for unique suspects', () => {
    const res = validateParams('digital-detective', { suspects: 8, attributeCount: 2, devicePool: ['a', 'b'], locationPool: ['x', 'y'] });
    expect(res.ok).toBe(false);
  });
});
