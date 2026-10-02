import { describe, expect, it } from 'vitest';
import { internetCafeMission as t, type CafeFolder, type CafeLevel, type CafeSubmission } from './internet-cafe-mission';
import { validateParams } from '../registry';

const params = t.defaultParams;

function perfect(level: CafeLevel): CafeSubmission {
  return {
    stages: level.stages.map((s) => {
      switch (s.kind) {
        case 'captcha':
          return { selected: s.tiles.flatMap((x, i) => (x === s.target ? [i] : [])), ms: 0 };
        case 'sequence':
          return { taps: s.order, ms: 0 };
        case 'bill':
        case 'recall':
          return { choice: s.answer, ms: 0 };
        case 'files':
          return { fileId: s.targetId, ms: 0 };
      }
    }),
  };
}

const countNamed = (f: CafeFolder, name: string): number =>
  f.files.filter((x) => x.name === name).length + f.folders.reduce((n, c) => n + countNamed(c, name), 0);

describe('internet-cafe-mission', () => {
  it('is deterministic, has the right number of stages, and ends with recall', () => {
    const level = t.generateLevel(params, 'm');
    expect(level).toEqual(t.generateLevel(params, 'm'));
    expect(level.stages).toHaveLength(params.stages);
    expect(level.stages.at(-1)!.kind).toBe('recall');
    expect(level.stages.filter((s) => s.kind === 'recall')).toHaveLength(1);
    expect(level.password).toHaveLength(params.passwordLength);
  });

  it('builds sound stages', () => {
    for (let i = 0; i < 50; i++) {
      for (const s of t.generateLevel({ ...params, stages: 12, folderDepth: 3, folderBreadth: 5 }, `s${i}`).stages) {
        if (s.kind === 'captcha') expect(s.tiles.filter((x) => x === s.target)).toHaveLength(params.captchaTargets);
        if (s.kind === 'bill') {
          expect(s.options[s.answer]).toBe(s.lines.reduce((n, l) => n + l.qty * l.price, 0));
          expect(new Set(s.options).size).toBe(s.options.length);
        }
        if (s.kind === 'files') expect(countNamed(s.root, s.targetName)).toBe(1);
        if (s.kind === 'recall') expect(new Set(s.options).size).toBe(4);
      }
    }
  });

  it('hides bill/recall answers and the target file id from the client', () => {
    const level = t.generateLevel(params, 'hide');
    const client = t.toClientLevel(level, params);
    for (const s of client.stages) {
      expect(s).not.toHaveProperty('answer');
      expect(s).not.toHaveProperty('targetId');
    }
    expect(client.note).toContain(level.password);
  });

  it('skips recall when not configured', () => {
    const level = t.generateLevel({ ...params, stageTypes: ['captcha', 'bill'] }, 'nr');
    expect(level.password).toBeNull();
    expect(level.stages.every((s) => s.kind === 'captcha' || s.kind === 'bill')).toBe(true);
  });

  it('scores perfect at 100, empty at 0, and partial captcha in between', () => {
    const level = t.generateLevel(params, 'score');
    expect(t.score(level, perfect(level), { durationMs: 0 }, params).score).toBe(100);
    expect(t.score(level, { stages: [] }, { durationMs: 0 }, params).score).toBe(0);
    const p = perfect(level);
    const late = { stages: p.stages.map((s) => ({ ...s, ms: params.stageTimeLimitMs + 1 })) };
    expect(t.score(level, late, { durationMs: 0 }, params).score).toBe(0);
  });

  it('validates params', () => {
    expect(validateParams('internet-cafe-mission', { stageTypes: ['recall'] }).ok).toBe(false);
    expect(validateParams('internet-cafe-mission', { captchaGrid: 3, captchaTargets: 9 }).ok).toBe(false);
  });
});
