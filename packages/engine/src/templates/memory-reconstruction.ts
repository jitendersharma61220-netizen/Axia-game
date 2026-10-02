import { z } from 'zod';
import { createRng } from '../prng';
import { MAX_SCORE, type GameTemplate } from '../types';

export const DEFAULT_ICON_POOL = [
  '🍎', '🚗', '🐶', '⭐', '🎈', '🔑', '📚', '🎸', '⚽', '🌵',
  '🍕', '🚀', '🎩', '🐟', '🌙', '☂️', '🧩', '🎲', '🦋', '🍩',
];

export const memoryParamsSchema = z
  .object({
    gridRows: z.number().int().min(2).max(8).describe('Grid rows'),
    gridCols: z.number().int().min(2).max(8).describe('Grid columns'),
    objectCount: z.number().int().min(1).max(30).describe('Objects shown per round'),
    distractorCount: z.number().int().min(0).max(12).describe('Extra icons in the tray that were never shown'),
    iconPool: z.array(z.string().min(1)).min(2).describe('Icon pool (content) objects are drawn from'),
    showDurationMs: z.number().int().min(500).max(60_000).describe('How long objects are visible (ms)'),
    recallTimeLimitMs: z.number().int().min(3_000).max(300_000).describe('Time allowed to rebuild the grid (ms)'),
    rounds: z.number().int().min(1).max(10).describe('Rounds per session'),
    pointsPerCorrect: z.number().int().min(1).max(100).describe('Points per correctly placed object'),
    penaltyPerWrong: z.number().int().min(0).max(100).describe('Points lost per wrong placement'),
    timeBonusMax: z.number().int().min(0).max(1000).describe('Max speed bonus per round'),
  })
  .superRefine((p, ctx) => {
    if (p.objectCount > p.gridRows * p.gridCols) {
      ctx.addIssue({ code: 'custom', path: ['objectCount'], message: 'objectCount cannot exceed gridRows × gridCols' });
    }
    if (new Set(p.iconPool).size < p.objectCount + p.distractorCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['iconPool'],
        message: 'iconPool needs at least objectCount + distractorCount unique icons',
      });
    }
  });

export type MemoryParams = z.infer<typeof memoryParamsSchema>;

export interface MemoryPlacement {
  cell: number;
  icon: string;
}

export interface MemoryRound {
  placements: MemoryPlacement[];
  /** Icons offered while rebuilding: the shown ones plus distractors, shuffled. */
  tray: string[];
}

export interface MemoryLevel {
  rows: number;
  cols: number;
  rounds: MemoryRound[];
}

export interface MemoryClientLevel extends MemoryLevel {
  showDurationMs: number;
  recallTimeLimitMs: number;
}

export const memorySubmissionSchema = z.object({
  rounds: z
    .array(
      z.object({
        placements: z.array(z.object({ cell: z.number().int().min(0), icon: z.string() })).max(64),
        recallMs: z.number().int().min(0),
      }),
    )
    .max(10),
});

export type MemorySubmission = z.infer<typeof memorySubmissionSchema>;

export const memoryReconstruction: GameTemplate<MemoryParams, MemoryLevel, MemoryClientLevel, MemorySubmission> = {
  key: 'memory-reconstruction',
  name: 'Memory Reconstruction',
  description: 'Objects flash on a grid, then vanish. Put every object back where it was.',
  paramsSchema: memoryParamsSchema,
  submissionSchema: memorySubmissionSchema,
  defaultParams: {
    gridRows: 4,
    gridCols: 4,
    objectCount: 5,
    distractorCount: 2,
    iconPool: DEFAULT_ICON_POOL,
    showDurationMs: 5_000,
    recallTimeLimitMs: 30_000,
    rounds: 3,
    pointsPerCorrect: 10,
    penaltyPerWrong: 5,
    timeBonusMax: 20,
  },

  generateLevel(params, seed) {
    const rng = createRng(seed);
    const cells = Array.from({ length: params.gridRows * params.gridCols }, (_, i) => i);
    const pool = Array.from(new Set(params.iconPool));
    const rounds: MemoryRound[] = [];
    for (let r = 0; r < params.rounds; r++) {
      const icons = rng.sample(pool, params.objectCount + params.distractorCount);
      const shown = icons.slice(0, params.objectCount);
      const chosenCells = rng.sample(cells, params.objectCount);
      rounds.push({
        placements: shown.map((icon, i) => ({ cell: chosenCells[i], icon })),
        tray: rng.shuffle(icons),
      });
    }
    return { rows: params.gridRows, cols: params.gridCols, rounds };
  },

  toClientLevel(level, params) {
    // A memory game must show the answer before hiding it, so the full level is sent.
    // Integrity comes from server-side timing checks and re-scoring, not secrecy.
    return { ...level, showDurationMs: params.showDurationMs, recallTimeLimitMs: params.recallTimeLimitMs };
  },

  timingBounds(params) {
    return {
      minMs: Math.floor(params.rounds * params.showDurationMs * 0.95),
      // Generous grace for transitions between rounds and network latency.
      maxMs: params.rounds * (params.showDurationMs + params.recallTimeLimitMs) + 120_000,
    };
  },

  score(level, submission, _timing, params) {
    const cellCount = level.rows * level.cols;
    let raw = 0;
    let correct = 0;
    let wrong = 0;
    let timeBonus = 0;

    level.rounds.forEach((round, r) => {
      const sub = submission.rounds[r];
      if (!sub) return;
      const answer = new Map(round.placements.map((p) => [p.cell, p.icon]));
      const seenCells = new Set<number>();
      let roundCorrect = 0;
      let roundWrong = 0;
      for (const p of sub.placements) {
        if (p.cell >= cellCount || seenCells.has(p.cell)) continue;
        seenCells.add(p.cell);
        if (answer.get(p.cell) === p.icon) roundCorrect++;
        else roundWrong++;
      }
      const roundPoints = Math.max(0, roundCorrect * params.pointsPerCorrect - roundWrong * params.penaltyPerWrong);
      const accuracy = roundCorrect / round.placements.length;
      const recallMs = Math.min(sub.recallMs, params.recallTimeLimitMs);
      const bonus = sub.recallMs > params.recallTimeLimitMs
        ? 0
        : params.timeBonusMax * accuracy * (1 - recallMs / params.recallTimeLimitMs);
      raw += roundPoints + bonus;
      correct += roundCorrect;
      wrong += roundWrong;
      timeBonus += bonus;
    });

    const maxRaw = level.rounds.length * (params.objectCount * params.pointsPerCorrect + params.timeBonusMax);
    const score = maxRaw === 0 ? 0 : Math.round((raw / maxRaw) * MAX_SCORE);
    return {
      score: Math.min(MAX_SCORE, Math.max(0, score)),
      maxScore: MAX_SCORE,
      breakdown: {
        correct,
        wrong,
        totalObjects: level.rounds.length * params.objectCount,
        timeBonus: Math.round(timeBonus),
        rawPoints: Math.round(raw),
        maxRawPoints: maxRaw,
      },
    };
  },
};
