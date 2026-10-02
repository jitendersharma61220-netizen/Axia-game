import { z } from 'zod';
import { createRng, type Rng } from '../prng';
import { MAX_SCORE, normalizeScore, speedFactor, type GameTemplate } from '../types';

export const QUESTION_TYPES = ['arithmetic', 'sequence', 'compare'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const neuralBossParamsSchema = z.object({
  bossHp: z.number().int().min(20).max(1000).describe('Boss health'),
  playerHp: z.number().int().min(1).max(10).describe('Player lives'),
  damagePerHit: z.number().int().min(1).max(100).describe('Damage per correct answer'),
  questionTimeMs: z.number().int().min(1500).max(30_000).describe('Time per question in phase 1 (ms)'),
  phaseSpeedup: z.number().min(0).max(0.5).describe('Time cut per boss phase, 0–0.5 (phases at 66% and 33% HP)'),
  maxQuestions: z.number().int().min(5).max(100).describe('Questions available before the boss escapes'),
  questionTypes: z.array(z.enum(QUESTION_TYPES)).min(1).describe('Attack types'),
  numberMax: z.number().int().min(5).max(1000).describe('Largest number in early questions (grows over the fight)'),
});

export type NeuralBossParams = z.infer<typeof neuralBossParamsSchema>;

export interface BossQuestion {
  type: QuestionType;
  prompt: string;
  options: string[];
  answer: number;
}

export interface NeuralBossLevel {
  questions: BossQuestion[];
}

export interface NeuralBossClientLevel extends NeuralBossLevel {
  bossHp: number;
  playerHp: number;
  damagePerHit: number;
  questionTimeMs: number;
  phaseSpeedup: number;
}

export const neuralBossSubmissionSchema = z.object({
  answers: z.array(z.object({ choice: z.number().int().min(0).max(3).nullable(), ms: z.number().int().min(0) })).max(100),
});

export type NeuralBossSubmission = z.infer<typeof neuralBossSubmissionSchema>;

/** Boss phase (0, 1, 2) from remaining HP. */
export function bossPhase(hp: number, maxHp: number) {
  const f = hp / maxHp;
  return f > 2 / 3 ? 0 : f > 1 / 3 ? 1 : 2;
}

export function questionTimeFor(phase: number, p: Pick<NeuralBossParams, 'questionTimeMs' | 'phaseSpeedup'>) {
  return Math.round(p.questionTimeMs * (1 - p.phaseSpeedup * phase));
}

export interface FightState {
  bossHp: number;
  playerHp: number;
  asked: number;
  hits: number;
  speedSum: number;
  over: boolean;
  won: boolean;
}

export function initialFight(p: Pick<NeuralBossParams, 'bossHp' | 'playerHp'>): FightState {
  return { bossHp: p.bossHp, playerHp: p.playerHp, asked: 0, hits: 0, speedSum: 0, over: false, won: false };
}

/**
 * Applies one answer. Shared by the client (to animate the fight) and the
 * server (to replay and score it), so both always agree.
 */
export function fightStep(
  state: FightState,
  question: BossQuestion,
  answer: { choice: number | null; ms: number },
  p: Pick<NeuralBossParams, 'bossHp' | 'damagePerHit' | 'questionTimeMs' | 'phaseSpeedup'>,
  totalQuestions: number,
): { state: FightState; hit: boolean } {
  if (state.over) return { state, hit: false };
  const allowed = questionTimeFor(bossPhase(state.bossHp, p.bossHp), p);
  const hit = answer.choice === question.answer && answer.ms <= allowed;
  const next = { ...state, asked: state.asked + 1 };
  if (hit) {
    next.hits++;
    next.speedSum += speedFactor(answer.ms, allowed);
    next.bossHp = Math.max(0, next.bossHp - p.damagePerHit);
  } else {
    next.playerHp = Math.max(0, next.playerHp - 1);
  }
  next.won = next.bossHp === 0;
  next.over = next.won || next.playerHp === 0 || next.asked >= totalQuestions;
  return { state: next, hit };
}

function makeOptions(rng: Rng, correct: number, spread: number): { options: string[]; answer: number } {
  const values = new Set<number>([correct]);
  while (values.size < 4) {
    const delta = rng.int(1, Math.max(3, spread)) * (rng.next() < 0.5 ? -1 : 1);
    values.add(correct + delta);
  }
  const options = rng.shuffle([...values]);
  return { options: options.map(String), answer: options.indexOf(correct) };
}

function makeQuestion(rng: Rng, type: QuestionType, max: number): BossQuestion {
  if (type === 'arithmetic') {
    const op = rng.int(0, 2);
    if (op === 2) {
      const a = rng.int(2, Math.max(3, Math.round(Math.sqrt(max) * 1.5)));
      const b = rng.int(2, 12);
      return { type, prompt: `${a} × ${b} = ?`, ...makeOptions(rng, a * b, Math.max(a, b)) };
    }
    const a = rng.int(1, max);
    const b = rng.int(1, max);
    return op === 0
      ? { type, prompt: `${a} + ${b} = ?`, ...makeOptions(rng, a + b, 10) }
      : { type, prompt: `${Math.max(a, b)} − ${Math.min(a, b)} = ?`, ...makeOptions(rng, Math.abs(a - b), 10) };
  }
  if (type === 'sequence') {
    const start = rng.int(1, max);
    const step = rng.int(2, Math.max(3, Math.round(max / 4))) * (rng.next() < 0.25 ? -1 : 1);
    const terms = [0, 1, 2, 3].map((i) => start + step * i);
    return { type, prompt: `${terms.join(', ')}, ?`, ...makeOptions(rng, start + step * 4, Math.abs(step)) };
  }
  // compare: pick the largest sum
  const sums = new Set<number>();
  const options: string[] = [];
  const totals: number[] = [];
  while (options.length < 4) {
    const a = rng.int(1, max);
    const b = rng.int(1, max);
    if (sums.has(a + b)) continue;
    sums.add(a + b);
    options.push(`${a} + ${b}`);
    totals.push(a + b);
  }
  return { type, prompt: 'Which is the largest?', options, answer: totals.indexOf(Math.max(...totals)) };
}

export const neuralBoss: GameTemplate<NeuralBossParams, NeuralBossLevel, NeuralBossClientLevel, NeuralBossSubmission> = {
  key: 'neural-boss',
  name: 'Neural Boss',
  description: 'A brain-boss attacks with rapid-fire puzzles. Answer fast to hit back before your lives run out.',
  howToPlay: [
    'Every correct answer damages the boss. A wrong or slow answer costs you a life.',
    'The boss speeds up at 66% and 33% health.',
    'Defeat it with lives to spare for the top score.',
  ],
  paramsSchema: neuralBossParamsSchema,
  submissionSchema: neuralBossSubmissionSchema,
  defaultParams: {
    bossHp: 100,
    playerHp: 3,
    damagePerHit: 10,
    questionTimeMs: 7000,
    phaseSpeedup: 0.2,
    maxQuestions: 20,
    questionTypes: ['arithmetic', 'sequence', 'compare'],
    numberMax: 20,
  },

  generateLevel(params, seed) {
    const rng = createRng(seed);
    const types = Array.from(new Set(params.questionTypes));
    const questions = Array.from({ length: params.maxQuestions }, (_, i) => {
      // Numbers grow up to 2.5× over the fight.
      const max = Math.round(params.numberMax * (1 + (1.5 * i) / params.maxQuestions));
      return makeQuestion(rng, types[rng.int(0, types.length - 1)], max);
    });
    return { questions };
  },

  toClientLevel(level, params) {
    // Answers are included for instant hit/miss feedback; the server replays the fight.
    return {
      ...level,
      bossHp: params.bossHp,
      playerHp: params.playerHp,
      damagePerHit: params.damagePerHit,
      questionTimeMs: params.questionTimeMs,
      phaseSpeedup: params.phaseSpeedup,
    };
  },

  timingBounds(params) {
    const minAnswers = Math.min(params.maxQuestions, params.playerHp);
    return {
      minMs: minAnswers * 300,
      maxMs: params.maxQuestions * (params.questionTimeMs + 2_000) + 60_000,
    };
  },

  score(level, submission, _timing, params) {
    let state = initialFight(params);
    level.questions.forEach((q, i) => {
      if (state.over) return;
      state = fightStep(state, q, submission.answers[i] ?? { choice: null, ms: Infinity }, params, level.questions.length).state;
    });
    // Unanswered questions at the end count as misses until the fight ends.
    const damageFrac = (params.bossHp - state.bossHp) / params.bossHp;
    const hpFrac = state.won ? state.playerHp / params.playerHp : 0;
    const speed = state.hits ? state.speedSum / state.hits : 0;
    const raw = damageFrac * 60 + hpFrac * 25 + speed * 15 * damageFrac;
    return {
      score: normalizeScore(raw, 100),
      maxScore: MAX_SCORE,
      highlights: [
        { label: 'Result', value: state.won ? 'Boss defeated' : 'Defeated' },
        { label: 'Boss damage', value: `${Math.round(damageFrac * 100)}%` },
        { label: 'Lives left', value: `${state.playerHp}/${params.playerHp}` },
      ],
      breakdown: {
        won: state.won ? 1 : 0,
        hits: state.hits,
        asked: state.asked,
        bossHpLeft: state.bossHp,
        livesLeft: state.playerHp,
        speedPercent: Math.round(speed * 100),
      },
    };
  },
};
