import type { z } from 'zod';

/** Every game's score is normalised to this scale ("YOUR SCORE 92/100"). */
export const MAX_SCORE = 100;

export interface SessionTiming {
  /** Wall-clock duration measured by the server between session start and submit. */
  durationMs: number;
}

export interface ScoreResult {
  score: number;
  maxScore: number;
  breakdown: Record<string, number>;
}

export interface TimingBounds {
  /** Anything faster than this is physically impossible for a human and is flagged. */
  minMs: number;
  /** Anything slower than this means the session was abandoned and is rejected. */
  maxMs: number;
}

/**
 * A game template is the code half of a game. Everything that should be tunable
 * without a deploy (difficulty, timing, content pools, scoring weights) lives in
 * `Params`, which admins edit and which is validated by `paramsSchema`.
 *
 * Adding a new game = implement this interface, register it in `registry.ts`,
 * and add a matching client scene. No backend changes are required.
 */
export interface GameTemplate<Params = unknown, Level = unknown, ClientLevel = unknown, Submission = unknown> {
  key: string;
  name: string;
  description: string;
  paramsSchema: z.ZodType<Params>;
  submissionSchema: z.ZodType<Submission>;
  defaultParams: Params;
  /** Must be deterministic: same params + seed => same level. */
  generateLevel(params: Params, seed: string): Level;
  /** What the browser receives. Strip anything the player must not see. */
  toClientLevel(level: Level, params: Params): ClientLevel;
  timingBounds(params: Params): TimingBounds;
  score(level: Level, submission: Submission, timing: SessionTiming, params: Params): ScoreResult;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameTemplate = GameTemplate<any, any, any, any>;
