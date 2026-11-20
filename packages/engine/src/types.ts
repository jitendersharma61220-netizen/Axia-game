import type { z } from 'zod';

/** Every game's score is normalised to this scale ("YOUR SCORE 92/100"). */
export const MAX_SCORE = 100;

export interface SessionTiming {
  /** Wall-clock duration measured by the server between session start and submit. */
  durationMs: number;
}

export interface ScoreHighlight {
  label: string;
  value: string;
}

export interface ScoreResult {
  score: number;
  /** 0 means the score has no ceiling (endless games). */
  maxScore: number;
  breakdown: Record<string, number>;
  /** Up to three headline stats for the result screen. */
  highlights: ScoreHighlight[];
  /** Optional per-round explanations, e.g. who the culprit really was. */
  notes?: string[];
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
/** Arcade games are the main event; warm-ups are short, gentle brain teasers. */
export type GameCategory = 'arcade' | 'warmup';

export interface GameTemplate<Params = unknown, Level = unknown, ClientLevel = unknown, Submission = unknown> {
  key: string;
  name: string;
  /** Defaults to 'warmup'. */
  category?: GameCategory;
  description: string;
  /** Short, player-facing instructions shown before the game starts. */
  howToPlay: string[];
  paramsSchema: z.ZodType<Params>;
  submissionSchema: z.ZodType<Submission>;
  defaultParams: Params;
  /** Must be deterministic: same params + seed => same level. */
  generateLevel(params: Params, seed: string): Level;
  /** What the browser receives. Strip anything the player must not see. */
  toClientLevel(level: Level, params: Params): ClientLevel;
  timingBounds(params: Params): TimingBounds;
  score(level: Level, submission: Submission, timing: SessionTiming, params: Params): ScoreResult;
  /**
   * Games with instant ✓/✗ feedback implement this so the browser never holds the
   * answers: each move is sent to the server, which judges it and records it. The
   * final score is computed only from those recorded moves.
   */
  interactive?: InteractiveSpec<Params, Level, Submission>;
}

export interface StepVerdict {
  /** Sent back to the browser for this move (e.g. correct / boss hit + new HP). */
  feedback: Record<string, unknown>;
  /** No further moves are accepted after this one. */
  done: boolean;
}

export interface InteractiveSpec<Params = unknown, Level = unknown, Submission = unknown, Step = any> {
  stepSchema: z.ZodType<Step>;
  /** Judge move `index`, given every earlier recorded move. Must agree with score(). */
  check(level: Level, params: Params, index: number, step: Step, previous: Step[]): StepVerdict;
  /** Turns the recorded moves into the submission that score() expects. */
  toSubmission(steps: Step[]): Submission;
  /**
   * Real-time games: how much play time (ms) a move covers. When present, the server
   * checks that moves arrived at the pace they were played (not faster, and without
   * long gaps that would allow rewinding) instead of the per-tap reaction check.
   */
  stepPlayMs?(step: Step, params: Params): number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameTemplate = GameTemplate<any, any, any, any>;

/** Scales raw points onto 0–MAX_SCORE, clamped. */
export function normalizeScore(raw: number, maxRaw: number): number {
  if (maxRaw <= 0) return 0;
  return Math.min(MAX_SCORE, Math.max(0, Math.round((raw / maxRaw) * MAX_SCORE)));
}

/** Clamped 0..1 share of the time limit left, used for speed bonuses. */
export function speedFactor(ms: number, limitMs: number): number {
  if (limitMs <= 0 || ms > limitMs) return 0;
  return 1 - Math.max(0, ms) / limitMs;
}
