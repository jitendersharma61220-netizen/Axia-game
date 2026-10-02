import { z } from 'zod';
import { createRng, type Rng } from '../prng';
import { MAX_SCORE, normalizeScore, speedFactor, type GameTemplate } from '../types';

export const DETECTIVE_ATTRIBUTES = ['device', 'location', 'time', 'outfit'] as const;
export type DetectiveAttribute = (typeof DETECTIVE_ATTRIBUTES)[number];

export const ATTRIBUTE_LABELS: Record<DetectiveAttribute, string> = {
  device: 'Device',
  location: 'Location',
  time: 'Online at',
  outfit: 'Wearing',
};

const CLUE_TEXT: Record<DetectiveAttribute, { yes: string; no: string }> = {
  device: { yes: 'The culprit used a {v}.', no: 'The culprit did not use a {v}.' },
  location: { yes: 'The culprit was at the {v}.', no: 'The culprit was not at the {v}.' },
  time: { yes: 'The culprit was online at {v}.', no: 'The culprit was not online at {v}.' },
  outfit: { yes: 'The culprit was wearing a {v}.', no: 'The culprit was not wearing a {v}.' },
};

const SOURCES = ['🧾 Server logs:', '👀 A witness:', '📷 CCTV:', '📱 Phone records:', '💬 Group chat:'];

const pool = (label: string) => z.array(z.string().min(1)).min(2).describe(label);

export const detectiveParamsSchema = z
  .object({
    cases: z.number().int().min(1).max(5).describe('Cases per session'),
    suspects: z.number().int().min(3).max(8).describe('Suspects per case'),
    attributeCount: z.number().int().min(2).max(4).describe('Facts per suspect (device, location, time, outfit)'),
    negativeClueRatio: z.number().min(0).max(1).describe('Share of “was NOT” clues (harder), 0–1'),
    redHerrings: z.number().int().min(0).max(4).describe('Extra true-but-useless clues per case'),
    caseTimeLimitMs: z.number().int().min(15_000).max(600_000).describe('Time per case (ms)'),
    pointsPerCase: z.number().int().min(10).max(1000).describe('Points for a solved case'),
    timeBonusMax: z.number().int().min(0).max(500).describe('Max speed bonus per solved case'),
    crimePool: pool('Crimes (one per line)'),
    namePool: z.array(z.string().min(1)).min(3).describe('Suspect names'),
    devicePool: pool('Devices'),
    locationPool: pool('Locations'),
    timePool: pool('Times'),
    outfitPool: pool('Outfits'),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.namePool).size < p.suspects) {
      ctx.addIssue({ code: 'custom', path: ['namePool'], message: 'Need at least as many unique names as suspects' });
    }
    const combos = DETECTIVE_ATTRIBUTES.slice(0, p.attributeCount).reduce((n, a) => n * new Set(poolFor(p, a)).size, 1);
    if (combos < p.suspects) {
      ctx.addIssue({ code: 'custom', path: ['attributeCount'], message: 'Pools are too small to give every suspect a unique profile' });
    }
  });

export type DetectiveParams = z.infer<typeof detectiveParamsSchema>;

function poolFor(p: Pick<DetectiveParams, 'devicePool' | 'locationPool' | 'timePool' | 'outfitPool'>, attr: DetectiveAttribute) {
  return { device: p.devicePool, location: p.locationPool, time: p.timePool, outfit: p.outfitPool }[attr];
}

export interface DetectiveSuspect {
  name: string;
  facts: Partial<Record<DetectiveAttribute, string>>;
}

export interface DetectiveClue {
  attr: DetectiveAttribute;
  value: string;
  negated: boolean;
  text: string;
}

export interface DetectiveCase {
  crime: string;
  suspects: DetectiveSuspect[];
  clues: DetectiveClue[];
  culprit: number;
}

export interface DetectiveLevel {
  attributes: DetectiveAttribute[];
  cases: DetectiveCase[];
}

export interface DetectiveClientLevel {
  attributes: { key: DetectiveAttribute; label: string }[];
  /** The culprit is never sent to the browser. */
  cases: { crime: string; suspects: DetectiveSuspect[]; clues: string[] }[];
  caseTimeLimitMs: number;
}

export const detectiveSubmissionSchema = z.object({
  cases: z.array(z.object({ accused: z.number().int().min(0).max(7).nullable(), ms: z.number().int().min(0) })).max(5),
});

export type DetectiveSubmission = z.infer<typeof detectiveSubmissionSchema>;

export function clueMatches(clue: Pick<DetectiveClue, 'attr' | 'value' | 'negated'>, s: DetectiveSuspect) {
  return (s.facts[clue.attr] === clue.value) !== clue.negated;
}

function makeClue(rng: Rng, attr: DetectiveAttribute, value: string, negated: boolean): DetectiveClue {
  const template = CLUE_TEXT[attr][negated ? 'no' : 'yes'];
  return { attr, value, negated, text: `${SOURCES[rng.int(0, SOURCES.length - 1)]} ${template.replace('{v}', value)}` };
}

function generateCase(rng: Rng, params: DetectiveParams, attrs: DetectiveAttribute[]): DetectiveCase {
  const names = rng.sample(Array.from(new Set(params.namePool)), params.suspects);
  const seen = new Set<string>();
  const suspects: DetectiveSuspect[] = names.map((name) => {
    for (;;) {
      const facts: DetectiveSuspect['facts'] = {};
      for (const a of attrs) {
        const options = Array.from(new Set(poolFor(params, a)));
        facts[a] = options[rng.int(0, options.length - 1)];
      }
      const key = attrs.map((a) => facts[a]).join('|');
      if (!seen.has(key)) {
        seen.add(key);
        return { name, facts };
      }
    }
  });
  const culprit = rng.int(0, suspects.length - 1);
  const guilty = suspects[culprit];

  // Add clues (all true about the culprit) until only the culprit fits them all.
  const clues: DetectiveClue[] = [];
  let remaining = suspects.filter((_, i) => i !== culprit);
  while (remaining.length) {
    const negative = rng.next() < params.negativeClueRatio;
    const options: { attr: DetectiveAttribute; value: string; negated: boolean }[] = [];
    for (const attr of attrs) {
      if (negative) {
        for (const s of remaining) if (s.facts[attr] !== guilty.facts[attr]) options.push({ attr, value: s.facts[attr]!, negated: true });
      } else if (remaining.some((s) => s.facts[attr] !== guilty.facts[attr])) {
        options.push({ attr, value: guilty.facts[attr]!, negated: false });
      }
    }
    if (!options.length) continue; // try the other clue kind
    const pick = options[rng.int(0, options.length - 1)];
    if (clues.some((c) => c.attr === pick.attr && c.value === pick.value && c.negated === pick.negated)) continue;
    const clue = makeClue(rng, pick.attr, pick.value, pick.negated);
    clues.push(clue);
    remaining = remaining.filter((s) => clueMatches(clue, s));
  }

  for (let i = 0; i < params.redHerrings; i++) {
    const attr = attrs[rng.int(0, attrs.length - 1)];
    if (!clues.some((c) => c.attr === attr && !c.negated)) clues.push(makeClue(rng, attr, guilty.facts[attr]!, false));
  }

  const crimes = Array.from(new Set(params.crimePool));
  return { crime: crimes[rng.int(0, crimes.length - 1)], suspects, clues: rng.shuffle(clues), culprit };
}

export const digitalDetective: GameTemplate<DetectiveParams, DetectiveLevel, DetectiveClientLevel, DetectiveSubmission> = {
  key: 'digital-detective',
  name: 'Digital Detective',
  description: 'Read the evidence, cross-check the suspects, and name the one who did it.',
  howToPlay: [
    'Each case has a few suspects and a list of clues. Every clue is true.',
    'Exactly one suspect matches every clue. Tap them, then press Accuse.',
    'You get one accusation per case. Solving quickly earns bonus points.',
  ],
  paramsSchema: detectiveParamsSchema,
  submissionSchema: detectiveSubmissionSchema,
  defaultParams: {
    cases: 3,
    suspects: 4,
    attributeCount: 3,
    negativeClueRatio: 0.3,
    redHerrings: 1,
    caseTimeLimitMs: 120_000,
    pointsPerCase: 100,
    timeBonusMax: 30,
    crimePool: [
      'leaked the exam paper from the college server',
      'hacked the café Wi-Fi',
      'deleted the class group chat',
      'posted the fake meme from the admin account',
      'changed everyone’s profile pictures',
    ],
    namePool: ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Sana', 'Vikram', 'Ishita', 'Arjun', 'Tara', 'Neel', 'Zoya'],
    devicePool: ['laptop', 'phone', 'tablet', 'desktop', 'smartwatch'],
    locationPool: ['café', 'library', 'metro', 'office', 'hostel'],
    timePool: ['9 PM', '10 PM', '11 PM', 'midnight', '1 AM'],
    outfitPool: ['red hoodie', 'denim jacket', 'black cap', 'green scarf', 'white kurta'],
  },

  generateLevel(params, seed) {
    const rng = createRng(seed);
    const attributes = DETECTIVE_ATTRIBUTES.slice(0, params.attributeCount);
    return { attributes, cases: Array.from({ length: params.cases }, () => generateCase(rng, params, attributes)) };
  },

  toClientLevel(level, params) {
    return {
      attributes: level.attributes.map((key) => ({ key, label: ATTRIBUTE_LABELS[key] })),
      cases: level.cases.map((c) => ({ crime: c.crime, suspects: c.suspects, clues: c.clues.map((cl) => cl.text) })),
      caseTimeLimitMs: params.caseTimeLimitMs,
    };
  },

  timingBounds(params) {
    return {
      minMs: params.cases * 3_000,
      maxMs: params.cases * (params.caseTimeLimitMs + 30_000) + 60_000,
    };
  },

  score(level, submission, _timing, params) {
    let raw = 0;
    let solved = 0;
    let timeBonus = 0;
    const notes: string[] = [];
    level.cases.forEach((c, i) => {
      const answer = submission.cases[i];
      const culprit = c.suspects[c.culprit].name;
      const inTime = !!answer && answer.ms <= params.caseTimeLimitMs;
      if (inTime && answer.accused === c.culprit) {
        solved++;
        const bonus = params.timeBonusMax * speedFactor(answer.ms, params.caseTimeLimitMs);
        timeBonus += bonus;
        raw += params.pointsPerCase + bonus;
        notes.push(`Case ${i + 1}: ✓ ${culprit} did it.`);
      } else {
        const accused = inTime && answer.accused !== null ? c.suspects[answer.accused]?.name : null;
        notes.push(`Case ${i + 1}: ✗ ${accused ? `Not ${accused} — ` : ''}it was ${culprit}.`);
      }
    });
    const maxRaw = level.cases.length * (params.pointsPerCase + params.timeBonusMax);
    return {
      score: normalizeScore(raw, maxRaw),
      maxScore: MAX_SCORE,
      highlights: [
        { label: 'Cases solved', value: `${solved}/${level.cases.length}` },
        { label: 'Speed bonus', value: String(Math.round(timeBonus)) },
        { label: 'Clues', value: String(level.cases.reduce((n, c) => n + c.clues.length, 0)) },
      ],
      notes,
      breakdown: { solved, cases: level.cases.length, timeBonus: Math.round(timeBonus), rawPoints: Math.round(raw), maxRawPoints: maxRaw },
    };
  },
};
