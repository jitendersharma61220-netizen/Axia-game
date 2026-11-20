import { describe, expect, it } from 'vitest';
import {
  autopilotStage,
  createKiteRun,
  patangRush,
  patangRushSubmissionSchema,
  playStage,
  replayKiteRun,
  stageTicks,
  type PatangRushParams,
  type PatangRushStep,
} from './patang-rush';

const params = patangRush.defaultParams;
const insane: PatangRushParams = { ...params, startStage: 6, speedRamp: 0.07, gapSize: 250, minGap: 180, rivalsFrom: 4 };

/** Plays a whole run with the autopilot, returning the recorded steps. */
function autoplay(p: PatangRushParams, seed: string, maxStages = p.maxStages) {
  const level = patangRush.generateLevel(p, seed);
  const run = createKiteRun(p);
  const steps: PatangRushStep[] = [];
  for (let i = 0; i < maxStages && !run.ended; i++) steps.push(autopilotStage(run, level.stageSeeds[i]));
  return { level, run, steps };
}

describe('patang-rush', () => {
  it('only sends the first stage seed to the browser', () => {
    const level = patangRush.generateLevel(params, 'secret-session-seed');
    expect(new Set(level.stageSeeds).size).toBe(params.maxStages);
    const client = JSON.stringify(patangRush.toClientLevel(level, params));
    expect(client).toContain(level.stageSeeds[0]);
    for (const s of level.stageSeeds.slice(1)) expect(client).not.toContain(s);
    expect(client).not.toContain('secret-session-seed');
  });

  it('replays the same taps to exactly the same result', () => {
    const { level, run, steps } = autoplay(params, 'det', 4);
    const again = replayKiteRun(level, params, steps);
    expect(again.points).toBe(run.points);
    expect(again.totalTicks).toBe(run.totalTicks);
    expect(again.y).toBe(run.y);
    expect(again.gatesPassed).toBe(run.gatesPassed);
    expect(again.death).toEqual(run.death);
  });

  it('judges stage by stage exactly like the final score, and reveals the next seed only after surviving', () => {
    const { level, run, steps } = autoplay(params, 'judge', 3);
    const previous: PatangRushStep[] = [];
    let last: Record<string, unknown> = {};
    steps.forEach((step, i) => {
      const verdict = patangRush.interactive!.check(level, params, i, step, previous);
      last = verdict.feedback;
      if (verdict.feedback.outcome === 'survived') {
        expect(verdict.feedback.nextSeed).toBe(level.stageSeeds[i + 1]);
        expect(verdict.done).toBe(false);
      } else {
        expect(verdict.feedback.nextSeed).toBeUndefined();
        expect(verdict.done).toBe(true);
      }
      previous.push(step);
    });
    const result = patangRush.score(level, patangRush.interactive!.toSubmission(steps), { durationMs: 60_000 }, params);
    expect(result.score).toBe(run.points);
    expect(last.points).toBe(run.points);
    expect(result.maxScore).toBe(0);
  });

  it('overrules a claimed survival: the replay decides', () => {
    const level = patangRush.generateLevel(params, 'liar');
    // Never tapping: the kite drops onto the street within a few seconds, whatever the client says.
    const step: PatangRushStep = { ticks: stageTicks(params), taps: [] };
    const verdict = patangRush.interactive!.check(level, params, 0, step, []);
    expect(verdict.feedback.outcome).toBe('hit');
    expect(verdict.done).toBe(true);
    const run = createKiteRun(params);
    expect(playStage(run, level.stageSeeds[0], step)).toBe('hit');
    expect(run.death!.cause).toBe('street');
    expect(run.death!.tick).toBeLessThan(5 * 60);
  });

  it('crashes a kite that only flies up', () => {
    const level = patangRush.generateLevel(params, 'up');
    const taps = Array.from({ length: stageTicks(params) / 6 }, (_, i) => i * 6);
    const run = createKiteRun(params);
    expect(playStage(run, level.stageSeeds[0], { ticks: stageTicks(params), taps })).toBe('hit');
    expect(run.death!.cause).toBe('tower');
  });

  it('ends the run when the recording stops early (player left)', () => {
    const level = patangRush.generateLevel(params, 'quit');
    const verdict = patangRush.interactive!.check(level, params, 0, { ticks: 40, taps: [] }, []);
    expect(verdict.feedback.outcome).toBe('quit');
    expect(verdict.done).toBe(true);
    const result = patangRush.score(level, { stages: [{ ticks: 40, taps: [] }] }, { durationMs: 2000 }, params);
    expect(result.breakdown.ticks).toBe(40);
    expect(result.notes?.[0]).toMatch(/left the game/);
  });

  it('is fair at the start but has a real ceiling', () => {
    const reached: number[] = [];
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const { run } = autoplay(params, seed);
      // A good flyer always clears the first two stages on Normal…
      expect(run.stagesCleared).toBeGreaterThanOrEqual(2);
      reached.push(run.stageIndex + params.startStage);
    }
    // …but even a zero-reaction-time bot with perfect vision never gets near the end.
    expect(Math.max(...reached)).toBeLessThan(25);
  });

  it('gets harder on harder presets', () => {
    const towers = (p: PatangRushParams) =>
      ['h1', 'h2', 'h3', 'h4'].reduce((n, seed) => n + autoplay(p, seed).run.gatesPassed, 0);
    expect(towers(insane)).toBeLessThan(towers(params));
  });

  it('scores towers, stars and stages in the breakdown', () => {
    const { level, steps, run } = autoplay(params, 'breakdown', 2);
    const r = patangRush.score(level, { stages: steps }, { durationMs: 40_000 }, params);
    expect(r.breakdown.towers).toBeGreaterThan(5);
    expect(r.breakdown.points).toBe(r.score);
    expect(r.score).toBe(r.breakdown.towers * 10 + r.breakdown.stars * 25 + (run.stagesCleared === 2 ? 20 + 40 : 20));
    expect(r.highlights.map((h) => h.label)).toEqual(['Towers', 'Stage', 'Flight time']);
  });

  it('reports the play time of a step for pacing checks', () => {
    expect(patangRush.interactive!.stepPlayMs!({ ticks: 90, taps: [1, 2] }, params)).toBe(1500);
    // Ticks past the end of the stage don't count.
    expect(patangRush.interactive!.stepPlayMs!({ ticks: 1800, taps: [] }, params)).toBe(params.stageSeconds * 1000);
  });

  it('rejects malformed steps', () => {
    const bad = [{ ticks: 0, taps: [] }, { ticks: 10, taps: [-1] }, { ticks: 10 }, { ticks: 10, taps: [1.5] }];
    for (const s of bad) expect(patangRushSubmissionSchema.safeParse({ stages: [s] }).success).toBe(false);
  });
});
