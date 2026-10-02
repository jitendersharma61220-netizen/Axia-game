import { z } from 'zod';
import { createRng } from '../prng';
import { MAX_SCORE, normalizeScore, speedFactor, type GameTemplate } from '../types';

export const RULE_SHIFT_COLORS = ['red', 'green', 'yellow', 'blue'] as const;
export const RULE_SHIFT_SHAPES = ['triangle', 'star', 'cross', 'circle'] as const;
export const RULES = ['color', 'shape', 'count'] as const;
export type Rule = (typeof RULES)[number];

export interface RuleShiftCard {
  /** Index into RULE_SHIFT_COLORS. */
  color: number;
  /** Index into RULE_SHIFT_SHAPES. */
  shape: number;
  /** 1–4 symbols. */
  count: number;
}

/**
 * The four reference piles. Pile i has colour i, shape i and i+1 symbols, so for
 * any rule each card belongs to exactly one pile.
 */
export const RULE_SHIFT_PILES: RuleShiftCard[] = [0, 1, 2, 3].map((i) => ({ color: i, shape: i, count: i + 1 }));

export function pileFor(card: RuleShiftCard, rule: Rule): number {
  if (rule === 'color') return card.color;
  if (rule === 'shape') return card.shape;
  return card.count - 1;
}

export const ruleShiftParamsSchema = z
  .object({
    trials: z.number().int().min(8).max(100).describe('Cards per session'),
    minRun: z.number().int().min(2).max(30).describe('Fewest cards before the rule may change'),
    maxRun: z.number().int().min(2).max(30).describe('Most cards before the rule changes'),
    rules: z.array(z.enum(RULES)).min(2).describe('Sorting rules in play'),
    showRuleHint: z.boolean().describe('Show the current rule (easy mode)'),
    trialTimeLimitMs: z.number().int().min(1000).max(30_000).describe('Time per card (ms)'),
    pointsPerCorrect: z.number().int().min(1).max(100).describe('Points per correct sort'),
    speedBonusMax: z.number().int().min(0).max(100).describe('Max speed bonus per card'),
  })
  .superRefine((p, ctx) => {
    if (p.maxRun < p.minRun) ctx.addIssue({ code: 'custom', path: ['maxRun'], message: 'maxRun must be ≥ minRun' });
    if (new Set(p.rules).size < 2) ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Pick at least two different rules' });
  });

export type RuleShiftParams = z.infer<typeof ruleShiftParamsSchema>;

export interface RuleShiftTrial extends RuleShiftCard {
  rule: Rule;
}

export interface RuleShiftLevel {
  trials: RuleShiftTrial[];
}

export interface RuleShiftClientLevel extends RuleShiftLevel {
  piles: RuleShiftCard[];
  showRuleHint: boolean;
  trialTimeLimitMs: number;
}

export const ruleShiftSubmissionSchema = z.object({
  answers: z
    .array(z.object({ pile: z.number().int().min(0).max(3).nullable(), ms: z.number().int().min(0) }))
    .max(100),
});

export type RuleShiftSubmission = z.infer<typeof ruleShiftSubmissionSchema>;

export const ruleShift: GameTemplate<RuleShiftParams, RuleShiftLevel, RuleShiftClientLevel, RuleShiftSubmission> = {
  key: 'rule-shift',
  name: 'Rule Shift',
  description: 'Sort each card onto a pile. The rule is secret — and it keeps changing.',
  howToPlay: [
    'Tap the pile the card belongs to: by colour, shape or number of symbols.',
    'Nobody tells you the rule. Use the ✓ / ✗ feedback to work it out.',
    'Without warning, the rule shifts. Spot it fast. Quick correct answers earn bonus points.',
  ],
  paramsSchema: ruleShiftParamsSchema,
  submissionSchema: ruleShiftSubmissionSchema,
  defaultParams: {
    trials: 24,
    minRun: 4,
    maxRun: 7,
    rules: ['color', 'shape', 'count'],
    showRuleHint: false,
    trialTimeLimitMs: 5000,
    pointsPerCorrect: 10,
    speedBonusMax: 5,
  },

  generateLevel(params, seed) {
    const rng = createRng(seed);
    const rules = Array.from(new Set(params.rules));
    const trials: RuleShiftTrial[] = [];
    let rule = rules[rng.int(0, rules.length - 1)];
    let runLeft = rng.int(params.minRun, params.maxRun);
    for (let i = 0; i < params.trials; i++) {
      if (runLeft === 0) {
        const others = rules.filter((r) => r !== rule);
        rule = others[rng.int(0, others.length - 1)];
        runLeft = rng.int(params.minRun, params.maxRun);
      }
      // Colour, shape and count all point at different piles, so every
      // answer tells the player which rule they were (wrongly) using.
      const [color, shape, countIdx] = rng.sample([0, 1, 2, 3], 3);
      trials.push({ color, shape, count: countIdx + 1, rule });
      runLeft--;
    }
    return { trials };
  },

  toClientLevel(level, params) {
    // Instant ✓/✗ feedback needs the rule on the client; integrity relies on
    // timing checks and server-side re-scoring.
    return { ...level, piles: RULE_SHIFT_PILES, showRuleHint: params.showRuleHint, trialTimeLimitMs: params.trialTimeLimitMs };
  },

  timingBounds(params) {
    return {
      minMs: params.trials * 250,
      maxMs: params.trials * (params.trialTimeLimitMs + 1_500) + 60_000,
    };
  },

  score(level, submission, _timing, params) {
    let raw = 0;
    let correct = 0;
    let timeouts = 0;
    let perseverative = 0;
    let reactionTotal = 0;
    const ok: boolean[] = [];
    const shiftStarts: number[] = [];
    let lastShift = -1;

    level.trials.forEach((trial, i) => {
      if (i > 0 && level.trials[i - 1].rule !== trial.rule) {
        shiftStarts.push(i);
        lastShift = i;
      }
      const answer = submission.answers[i];
      if (!answer || answer.pile === null || answer.ms > params.trialTimeLimitMs) {
        timeouts++;
        ok.push(false);
        return;
      }
      const isCorrect = answer.pile === pileFor(trial, trial.rule);
      ok.push(isCorrect);
      if (isCorrect) {
        correct++;
        reactionTotal += answer.ms;
        raw += params.pointsPerCorrect + params.speedBonusMax * speedFactor(answer.ms, params.trialTimeLimitMs);
      } else if (lastShift > 0 && i - lastShift < 3 && answer.pile === pileFor(trial, level.trials[lastShift - 1].rule)) {
        // Still sorting by the old rule right after a shift.
        perseverative++;
      }
    });

    // A shift is "caught" when the player is back on track within two cards.
    const shifts = shiftStarts.length;
    const shiftsAdapted = shiftStarts.filter((s) => ok[s] || ok[s + 1]).length;

    const maxRaw = level.trials.length * (params.pointsPerCorrect + params.speedBonusMax);
    const avgMs = correct ? Math.round(reactionTotal / correct) : 0;
    return {
      score: normalizeScore(raw, maxRaw),
      maxScore: MAX_SCORE,
      highlights: [
        { label: 'Correct', value: `${correct}/${level.trials.length}` },
        { label: 'Shifts caught', value: `${shiftsAdapted}/${shifts}` },
        { label: 'Avg reaction', value: correct ? `${(avgMs / 1000).toFixed(2)}s` : '–' },
      ],
      breakdown: {
        correct,
        wrong: level.trials.length - correct - timeouts,
        timeouts,
        shifts,
        shiftsAdapted,
        perseverativeErrors: perseverative,
        avgReactionMs: avgMs,
        rawPoints: Math.round(raw),
        maxRawPoints: maxRaw,
      },
    };
  },
};
