import { describe, expect, it } from 'vitest';
import { pileFor, ruleShift as t, type RuleShiftSubmission } from './rule-shift';
import { validateParams } from '../registry';

const params = t.defaultParams;

describe('rule-shift', () => {
  it('is deterministic and respects run lengths', () => {
    const a = t.generateLevel(params, 's');
    expect(a).toEqual(t.generateLevel(params, 's'));
    expect(a.trials).toHaveLength(params.trials);
    let run = 1;
    for (let i = 1; i < a.trials.length; i++) {
      if (a.trials[i].rule === a.trials[i - 1].rule) run++;
      else {
        expect(run).toBeGreaterThanOrEqual(params.minRun);
        expect(run).toBeLessThanOrEqual(params.maxRun);
        run = 1;
      }
    }
  });

  it('never deals an ambiguous card: each rule points at a different pile', () => {
    for (const trial of t.generateLevel(params, 'cards').trials) {
      const piles = new Set([pileFor(trial, 'color'), pileFor(trial, 'shape'), pileFor(trial, 'count')]);
      expect(piles.size).toBe(3);
    }
  });

  it('only uses the configured rules', () => {
    const p = { ...params, rules: ['color' as const, 'count' as const] };
    expect(t.generateLevel(p, 'r').trials.every((x) => x.rule !== 'shape')).toBe(true);
  });

  it('scores a perfect instant run at 100 and catches every shift', () => {
    const level = t.generateLevel(params, 'p');
    const sub: RuleShiftSubmission = { answers: level.trials.map((x) => ({ pile: pileFor(x, x.rule), ms: 0 })) };
    const res = t.score(level, sub, { durationMs: 0 }, params);
    expect(res.score).toBe(100);
    expect(res.breakdown.shiftsAdapted).toBe(res.breakdown.shifts);
  });

  it('counts sticking to the old rule as perseveration', () => {
    const level = t.generateLevel(params, 'persev');
    const shiftAt = level.trials.findIndex((x, i) => i > 0 && level.trials[i - 1].rule !== x.rule);
    const answers = level.trials.map((x, i) => ({
      pile: pileFor(x, i === shiftAt ? level.trials[shiftAt - 1].rule : x.rule),
      ms: 500,
    }));
    const res = t.score(level, { answers }, { durationMs: 0 }, params);
    expect(res.breakdown.perseverativeErrors).toBe(1);
    expect(res.breakdown.wrong).toBe(1);
  });

  it('treats late answers as timeouts and an empty run as 0', () => {
    const level = t.generateLevel(params, 'late');
    const late = { answers: level.trials.map((x) => ({ pile: pileFor(x, x.rule), ms: params.trialTimeLimitMs + 1 })) };
    expect(t.score(level, late, { durationMs: 0 }, params).score).toBe(0);
    expect(t.score(level, { answers: [] }, { durationMs: 0 }, params).score).toBe(0);
  });

  it('validates params', () => {
    expect(validateParams('rule-shift', { minRun: 6, maxRun: 3 }).ok).toBe(false);
    expect(validateParams('rule-shift', { rules: ['color'] }).ok).toBe(false);
  });
});
