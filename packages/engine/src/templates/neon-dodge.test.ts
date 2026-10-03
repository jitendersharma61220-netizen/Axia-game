import { describe, expect, it } from 'vitest';
import {
  autopilotWave,
  createRun,
  icos,
  inputTicks,
  isin,
  neonDodge,
  neonDodgeSubmissionSchema,
  playWave,
  replayRun,
  type NeonDodgeParams,
  type NeonDodgeStep,
} from './neon-dodge';

const params = neonDodge.defaultParams;
const insane: NeonDodgeParams = { ...params, startWave: 6, speedScale: 1.4, densityScale: 1.4 };

/** Plays a whole run with the autopilot, returning the recorded steps. */
function autoplay(p: NeonDodgeParams, seed: string, maxWaves = p.maxWaves) {
  const level = neonDodge.generateLevel(p, seed);
  const run = createRun(p);
  const steps: NeonDodgeStep[] = [];
  for (let i = 0; i < maxWaves && !run.ended; i++) steps.push(autopilotWave(run, level.waveSeeds[i]));
  return { level, run, steps };
}

const idleWave = (seconds = params.waveSeconds): NeonDodgeStep => ({ inputs: [[seconds * 60, -1, -1]] });

describe('neon-dodge', () => {
  it('has an exact integer sine table', () => {
    expect([isin(0), isin(64), isin(128), isin(192)]).toEqual([0, 4096, 0, -4096]);
    expect(icos(0)).toBe(4096);
    expect(isin(32)).toBe(-isin(-32));
  });

  it('only sends the first wave seed to the browser', () => {
    const level = neonDodge.generateLevel(params, 'secret-session-seed');
    expect(new Set(level.waveSeeds).size).toBe(params.maxWaves);
    const client = JSON.stringify(neonDodge.toClientLevel(level, params));
    expect(client).toContain(level.waveSeeds[0]);
    for (const s of level.waveSeeds.slice(1)) expect(client).not.toContain(s);
    expect(client).not.toContain('secret-session-seed');
  });

  it('replays the same inputs to exactly the same result', () => {
    const { level, run, steps } = autoplay(params, 'det', 4);
    const again = replayRun(level, params, steps);
    expect(again.points).toBe(run.points);
    expect(again.totalTicks).toBe(run.totalTicks);
    expect([again.px, again.py]).toEqual([run.px, run.py]);
    expect(again.death).toEqual(run.death);
  });

  it('judges wave by wave exactly like the final score, and reveals the next seed only after surviving', () => {
    const { level, run, steps } = autoplay(params, 'judge', 3);
    const previous: NeonDodgeStep[] = [];
    let last: Record<string, unknown> = {};
    steps.forEach((step, i) => {
      const verdict = neonDodge.interactive!.check(level, params, i, step, previous);
      last = verdict.feedback;
      if (verdict.feedback.outcome === 'survived') {
        expect(verdict.feedback.nextSeed).toBe(level.waveSeeds[i + 1]);
        expect(verdict.done).toBe(false);
      } else {
        expect(verdict.feedback.nextSeed).toBeUndefined();
        expect(verdict.done).toBe(true);
      }
      previous.push(step);
    });
    const result = neonDodge.score(level, neonDodge.interactive!.toSubmission(steps), { durationMs: 60_000 }, params);
    expect(result.score).toBe(run.points);
    expect(last.points).toBe(run.points);
    expect(result.maxScore).toBe(0);
  });

  it('overrules a claimed survival: the replay decides', () => {
    const level = neonDodge.generateLevel(insane, 'liar');
    // Parked in a corner on Insane: hit long before the wave ends, whatever the client says.
    const step: NeonDodgeStep = { inputs: [[insane.waveSeconds * 60, 20, 20]] };
    const verdict = neonDodge.interactive!.check(level, insane, 0, step, []);
    expect(verdict.feedback.outcome).toBe('hit');
    expect(verdict.done).toBe(true);
    const run = createRun(insane);
    expect(playWave(run, level.waveSeeds[0], step)).toBe('hit');
    expect(run.death!.tick).toBeLessThan(insane.waveSeconds * 60);
  });

  it('ends the run when the inputs stop early (player left)', () => {
    const level = neonDodge.generateLevel(params, 'quit');
    const verdict = neonDodge.interactive!.check(level, params, 0, { inputs: [[90, -1, -1]] }, []);
    expect(verdict.feedback.outcome).toBe('quit');
    expect(verdict.done).toBe(true);
    const result = neonDodge.score(level, { waves: [{ inputs: [[90, -1, -1]] }] }, { durationMs: 2000 }, params);
    expect(result.breakdown.ticks).toBe(90);
    expect(result.notes?.[0]).toMatch(/left the game/);
  });

  it('kills a player who never moves, fast on harder presets', () => {
    for (const [p, maxSeconds] of [
      [params, 60],
      [insane, 8],
    ] as const) {
      for (const seed of ['a', 'b', 'c']) {
        const level = neonDodge.generateLevel(p, seed);
        const steps = Array.from({ length: p.maxWaves }, () => idleWave(p.waveSeconds));
        const run = replayRun(level, p, steps);
        expect(run.ended).toBe('hit');
        expect(run.totalTicks / 60).toBeLessThan(maxSeconds);
      }
    }
  });

  it('is fair at the start but has a real ceiling', () => {
    const reached: number[] = [];
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const { run } = autoplay(params, seed);
      // A decent dodger always clears the first wave on Normal…
      expect(run.wavesCleared).toBeGreaterThanOrEqual(1);
      reached.push(run.waveIndex + params.startWave);
    }
    // …but even a zero-reaction-time bot with perfect vision never gets near the end.
    expect(Math.max(...reached)).toBeLessThan(30);
  });

  it('scores grazes, combo and time in the breakdown', () => {
    const { level, steps } = autoplay(params, 'breakdown', 3);
    const r = neonDodge.score(level, { waves: steps }, { durationMs: 40_000 }, params);
    expect(r.breakdown.ticks).toBeGreaterThan(params.waveSeconds * 60);
    expect(r.breakdown.points).toBe(r.score);
    expect(r.highlights.map((h) => h.label)).toEqual(['Survived', 'Wave', 'Best combo']);
  });

  it('reports the play time of a step for pacing checks', () => {
    expect(neonDodge.interactive!.stepPlayMs!({ inputs: [[60, 1, 1], [30, -1, -1]] }, params)).toBe(1500);
    // Inputs past the end of the wave don't count.
    expect(neonDodge.interactive!.stepPlayMs!({ inputs: [[1800, 1, 1]] }, params)).toBe(params.waveSeconds * 1000);
    expect(inputTicks({ inputs: [[2, 0, 0], [3, 0, 0]] })).toBe(5);
  });

  it('rejects malformed steps', () => {
    const bad = [{ inputs: [[0, 1, 1]] }, { inputs: [[5, 999, 1]] }, { inputs: [[5, 1]] }];
    for (const s of bad) expect(neonDodgeSubmissionSchema.safeParse({ waves: [s] }).success).toBe(false);
  });
});
