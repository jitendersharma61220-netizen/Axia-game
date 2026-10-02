import { describe, expect, it } from 'vitest';
import { bossPhase, fightStep, initialFight, neuralBoss as t, questionTimeFor } from './neural-boss';

const params = t.defaultParams;

describe('neural-boss', () => {
  it('generates valid multiple-choice questions deterministically', () => {
    const level = t.generateLevel(params, 'q');
    expect(level).toEqual(t.generateLevel(params, 'q'));
    expect(level.questions).toHaveLength(params.maxQuestions);
    for (const q of level.questions) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
    }
  });

  it('computes correct answers', () => {
    const level = t.generateLevel({ ...params, maxQuestions: 60 }, 'math');
    for (const q of level.questions) {
      const correct = q.options[q.answer];
      if (q.type === 'arithmetic') {
        const [a, op, b] = q.prompt.replace(' = ?', '').split(' ');
        const v = op === '+' ? +a + +b : op === '−' ? +a - +b : +a * +b;
        expect(String(v)).toBe(correct);
      }
      if (q.type === 'compare') {
        const sums = q.options.map((o) => o.split(' + ').reduce((s, n) => s + +n, 0));
        expect(sums[q.answer]).toBe(Math.max(...sums));
      }
    }
  });

  it('speeds up by phase', () => {
    expect(bossPhase(100, 100)).toBe(0);
    expect(bossPhase(50, 100)).toBe(1);
    expect(bossPhase(20, 100)).toBe(2);
    expect(questionTimeFor(2, params)).toBeLessThan(questionTimeFor(0, params));
  });

  it('a flawless instant fight wins with 100', () => {
    const level = t.generateLevel(params, 'win');
    const answers = level.questions.map((q) => ({ choice: q.answer, ms: 0 }));
    const res = t.score(level, { answers }, { durationMs: 0 }, params);
    expect(res.score).toBe(100);
    expect(res.breakdown.won).toBe(1);
    expect(res.breakdown.asked).toBe(params.bossHp / params.damagePerHit);
  });

  it('loses after playerHp misses and slow answers count as misses', () => {
    const level = t.generateLevel(params, 'lose');
    const answers = level.questions.map((q) => ({ choice: q.answer, ms: params.questionTimeMs + 1 }));
    const res = t.score(level, { answers }, { durationMs: 0 }, params);
    expect(res.breakdown.won).toBe(0);
    expect(res.breakdown.asked).toBe(params.playerHp);
    expect(res.score).toBe(0);
  });

  it('fightStep ends when questions run out', () => {
    const level = t.generateLevel({ ...params, maxQuestions: 5, bossHp: 1000 }, 'out');
    let s = initialFight({ ...params, bossHp: 1000 });
    for (const q of level.questions) s = fightStep(s, q, { choice: q.answer, ms: 0 }, { ...params, bossHp: 1000 }, 5).state;
    expect(s.over).toBe(true);
    expect(s.won).toBe(false);
  });
});
