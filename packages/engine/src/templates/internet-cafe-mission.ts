import { z } from 'zod';
import { createRng, type Rng } from '../prng';
import { MAX_SCORE, normalizeScore, speedFactor, type GameTemplate } from '../types';

export const CAFE_STAGES = ['captcha', 'sequence', 'bill', 'files', 'recall'] as const;
export type CafeStageKind = (typeof CAFE_STAGES)[number];

const STAGE_TITLES: Record<CafeStageKind, string> = {
  captcha: 'Prove you are human',
  sequence: 'Dial up the modem',
  bill: 'Settle the café bill',
  files: 'Find the file',
  recall: 'Log in to your email',
};

const BILL_ITEMS: [string, number][] = [
  ['Browsing (per hour)', 20],
  ['Print-out (per page)', 5],
  ['Scan (per page)', 10],
  ['CD burn', 30],
  ['Cold drink', 15],
  ['Headphones rental', 10],
  ['Floppy disk', 25],
];

const FOLDER_NAMES = ['My Documents', 'Downloads', 'Songs', 'College', 'Photos', 'Games', 'Backup', 'New Folder', 'Projects', 'Desktop', 'Old Stuff', 'Movies'];
const FILE_NAMES = [
  'resume_final.doc', 'form_2003.pdf', 'song.mp3', 'photo1.jpg', 'notes.txt', 'game_save.dat', 'assignment.doc',
  'marksheet.pdf', 'setup.exe', 'wallpaper.bmp', 'chat_log.txt', 'birthday.jpg', 'project_v2.ppt', 'admit_card.pdf',
  'virus_scan.log', 'mixtape.mp3', 'letter.doc', 'budget.xls',
];

export const cafeParamsSchema = z
  .object({
    stages: z.number().int().min(3).max(12).describe('Stages in the mission'),
    stageTypes: z.array(z.enum(CAFE_STAGES)).min(1).describe('Stage types in play'),
    stageTimeLimitMs: z.number().int().min(10_000).max(300_000).describe('Time per stage (ms)'),
    captchaGrid: z.number().int().min(3).max(6).describe('CAPTCHA grid size'),
    captchaTargets: z.number().int().min(1).max(12).describe('Target squares in the CAPTCHA'),
    captchaIcons: z.array(z.string().min(1)).min(3).describe('CAPTCHA icon pool'),
    sequenceLength: z.number().int().min(3).max(12).describe('Dial-up sequence length'),
    sequenceShowMs: z.number().int().min(300).max(2000).describe('Time each dial-up key lights up (ms)'),
    billItems: z.number().int().min(2).max(6).describe('Lines on the café bill'),
    folderDepth: z.number().int().min(1).max(3).describe('Folder depth for the file hunt'),
    folderBreadth: z.number().int().min(2).max(5).describe('Folders per level'),
    passwordLength: z.number().int().min(3).max(10).describe('Password length to remember'),
    noteShowMs: z.number().int().min(1000).max(20_000).describe('How long the password note is shown (ms)'),
    pointsPerStage: z.number().int().min(10).max(1000).describe('Points per perfect stage'),
    timeBonusMax: z.number().int().min(0).max(500).describe('Max speed bonus per perfect stage'),
  })
  .superRefine((p, ctx) => {
    if (p.captchaTargets >= p.captchaGrid * p.captchaGrid) {
      ctx.addIssue({ code: 'custom', path: ['captchaTargets'], message: 'captchaTargets must be smaller than captchaGrid²' });
    }
    if (!p.stageTypes.some((t) => t !== 'recall')) {
      ctx.addIssue({ code: 'custom', path: ['stageTypes'], message: 'Pick at least one stage type besides recall' });
    }
    if (new Set(p.captchaIcons).size < 3) {
      ctx.addIssue({ code: 'custom', path: ['captchaIcons'], message: 'Need at least 3 unique icons' });
    }
  });

export type CafeParams = z.infer<typeof cafeParamsSchema>;

export interface CafeFolder {
  name: string;
  folders: CafeFolder[];
  files: { id: string; name: string }[];
}

export type CafeStage =
  | { kind: 'captcha'; grid: number; tiles: string[]; target: string }
  | { kind: 'sequence'; keys: string[]; order: number[]; showMs: number }
  | { kind: 'bill'; lines: { label: string; qty: number; price: number }[]; options: number[]; answer: number }
  | { kind: 'files'; root: CafeFolder; targetName: string; targetId: string }
  | { kind: 'recall'; options: string[]; answer: number };

export interface CafeLevel {
  password: string | null;
  stages: CafeStage[];
}

type ClientStage =
  | Extract<CafeStage, { kind: 'captcha' | 'sequence' }>
  | Omit<Extract<CafeStage, { kind: 'bill' }>, 'answer'>
  | Omit<Extract<CafeStage, { kind: 'files' }>, 'targetId'>
  | Omit<Extract<CafeStage, { kind: 'recall' }>, 'answer'>;

export interface CafeClientLevel {
  intro: string;
  /** Sticky note shown at the start when the mission ends with a recall stage. */
  note: string | null;
  noteShowMs: number;
  stageTimeLimitMs: number;
  stages: (ClientStage & { title: string })[];
}

export const cafeSubmissionSchema = z.object({
  stages: z
    .array(
      z.object({
        selected: z.array(z.number().int().min(0).max(35)).max(36).optional(),
        taps: z.array(z.number().int().min(0).max(8)).max(20).optional(),
        choice: z.number().int().min(0).max(3).nullable().optional(),
        fileId: z.string().max(40).nullable().optional(),
        ms: z.number().int().min(0),
      }),
    )
    .max(12),
});

export type CafeSubmission = z.infer<typeof cafeSubmissionSchema>;

function distinctOptions<T>(rng: Rng, correct: T, make: () => T): { options: T[]; answer: number } {
  const set = new Set<T>([correct]);
  for (let guard = 0; set.size < 4 && guard < 200; guard++) set.add(make());
  const options = rng.shuffle([...set]);
  return { options, answer: options.indexOf(correct) };
}

function buildFolder(rng: Rng, name: string, depth: number, p: CafeParams, counter: { n: number }): CafeFolder {
  const folders = depth > 0 ? rng.sample(FOLDER_NAMES, p.folderBreadth).map((n) => buildFolder(rng, n, depth - 1, p, counter)) : [];
  const files = rng.sample(FILE_NAMES, rng.int(1, 3)).map((f) => ({ id: `f${counter.n++}`, name: f }));
  return { name, folders, files };
}

function leafFolders(folder: CafeFolder): CafeFolder[] {
  return folder.folders.length ? folder.folders.flatMap(leafFolders) : [folder];
}

function removeFile(folder: CafeFolder, name: string) {
  folder.files = folder.files.filter((f) => f.name !== name);
  folder.folders.forEach((f) => removeFile(f, name));
}

function generateStage(rng: Rng, kind: CafeStageKind, p: CafeParams, password: string | null): CafeStage {
  if (kind === 'captcha') {
    const icons = Array.from(new Set(p.captchaIcons));
    const target = icons[rng.int(0, icons.length - 1)];
    const others = icons.filter((i) => i !== target);
    const n = p.captchaGrid * p.captchaGrid;
    const targetCells = new Set(rng.sample(Array.from({ length: n }, (_, i) => i), p.captchaTargets));
    const tiles = Array.from({ length: n }, (_, i) => (targetCells.has(i) ? target : others[rng.int(0, others.length - 1)]));
    return { kind, grid: p.captchaGrid, tiles, target };
  }
  if (kind === 'sequence') {
    const order = Array.from({ length: p.sequenceLength }, () => rng.int(0, 8));
    return { kind, keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], order, showMs: p.sequenceShowMs };
  }
  if (kind === 'bill') {
    const lines = rng.sample(BILL_ITEMS, p.billItems).map(([label, price]) => ({ label, price, qty: rng.int(1, 4) }));
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
    // Plausible wrong totals: one line miscounted by ±1, or a line forgotten.
    const wrong = () => {
      const l = lines[rng.int(0, lines.length - 1)];
      return rng.next() < 0.7 ? total + (rng.next() < 0.5 ? -l.price : l.price) : total - l.qty * l.price;
    };
    return { kind, lines, ...distinctOptions(rng, total, () => Math.max(5, wrong())) };
  }
  if (kind === 'files') {
    const counter = { n: 0 };
    const root = buildFolder(rng, 'C:\\', p.folderDepth, p, counter);
    // Hide a uniquely named target in one of the deepest folders.
    const targetName = FILE_NAMES[rng.int(0, FILE_NAMES.length - 1)];
    removeFile(root, targetName);
    const leaves = leafFolders(root);
    const home = leaves[rng.int(0, leaves.length - 1)];
    const targetId = `f${counter.n++}`;
    home.files.splice(rng.int(0, home.files.length), 0, { id: targetId, name: targetName });
    return { kind, root, targetName, targetId };
  }
  // recall
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const mutate = () => {
    const arr = password!.split('');
    const i = rng.int(0, arr.length - 1);
    if (rng.next() < 0.5 && arr.length > 1) {
      const j = (i + 1) % arr.length;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    } else arr[i] = chars[rng.int(0, chars.length - 1)];
    return arr.join('');
  };
  return { kind: 'recall', ...distinctOptions(rng, password!, mutate) };
}

export function stageAccuracy(stage: CafeStage, answer: CafeSubmission['stages'][number] | undefined): number {
  if (!answer) return 0;
  switch (stage.kind) {
    case 'captcha': {
      const picked = new Set(answer.selected ?? []);
      let tp = 0;
      let fp = 0;
      picked.forEach((c) => (stage.tiles[c] === stage.target ? tp++ : fp++));
      const targets = stage.tiles.filter((t) => t === stage.target).length;
      return Math.max(0, (tp - fp) / targets);
    }
    case 'sequence': {
      const taps = answer.taps ?? [];
      let matched = 0;
      while (matched < stage.order.length && taps[matched] === stage.order[matched]) matched++;
      return taps.length > stage.order.length ? matched / (stage.order.length + 1) : matched / stage.order.length;
    }
    case 'bill':
    case 'recall':
      return answer.choice === stage.answer ? 1 : 0;
    case 'files':
      return answer.fileId === stage.targetId ? 1 : 0;
  }
}

export const internetCafeMission: GameTemplate<CafeParams, CafeLevel, CafeClientLevel, CafeSubmission> = {
  key: 'internet-cafe-mission',
  name: 'Internet Café Mission',
  description: 'It’s 2003, it’s ₹20 an hour, and the café closes soon. Get your college form submitted in time.',
  howToPlay: [
    'Clear each stage of the mission before its timer runs out.',
    'Stages mix CAPTCHAs, dial-up sequences, bills, file hunts, and remembering a password.',
    'If a sticky note appears at the start, remember what it says!',
  ],
  paramsSchema: cafeParamsSchema,
  submissionSchema: cafeSubmissionSchema,
  defaultParams: {
    stages: 6,
    stageTypes: ['captcha', 'sequence', 'bill', 'files', 'recall'],
    stageTimeLimitMs: 45_000,
    captchaGrid: 4,
    captchaTargets: 4,
    captchaIcons: ['🚲', '🚗', '🚦', '🌳', '🏠', '🚌', '🐄', '🛺'],
    sequenceLength: 5,
    sequenceShowMs: 700,
    billItems: 3,
    folderDepth: 2,
    folderBreadth: 3,
    passwordLength: 4,
    noteShowMs: 5000,
    pointsPerStage: 100,
    timeBonusMax: 25,
  },

  generateLevel(params, seed) {
    const rng = createRng(seed);
    const types = Array.from(new Set(params.stageTypes));
    const hasRecall = types.includes('recall');
    const playable = types.filter((t) => t !== 'recall');
    const kinds: CafeStageKind[] = [];
    let bag: CafeStageKind[] = [];
    while (kinds.length < params.stages - (hasRecall ? 1 : 0)) {
      if (!bag.length) bag = rng.shuffle(playable);
      kinds.push(bag.pop()!);
    }
    if (hasRecall) kinds.push('recall');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const password = hasRecall ? Array.from({ length: params.passwordLength }, () => chars[rng.int(0, chars.length - 1)]).join('') : null;
    return { password, stages: kinds.map((k) => generateStage(rng, k, params, password)) };
  },

  toClientLevel(level, params) {
    return {
      intro: 'It’s 2003. The café closes in 30 minutes and your college form is due tonight. Every second costs ₹20 an hour.',
      note: level.password ? `Email password: ${level.password}` : null,
      noteShowMs: params.noteShowMs,
      stageTimeLimitMs: params.stageTimeLimitMs,
      stages: level.stages.map((s) => {
        const title = STAGE_TITLES[s.kind];
        if (s.kind === 'bill' || s.kind === 'recall') {
          const { answer: _answer, ...rest } = s;
          return { ...rest, title };
        }
        if (s.kind === 'files') {
          const { targetId: _targetId, ...rest } = s;
          return { ...rest, title };
        }
        return { ...s, title };
      }),
    };
  },

  timingBounds(params) {
    const intro = params.stageTypes.includes('recall') ? params.noteShowMs : 0;
    return {
      minMs: Math.floor(intro * 0.9) + params.stages * 1_500,
      maxMs: intro + params.stages * (params.stageTimeLimitMs + params.sequenceLength * params.sequenceShowMs + 15_000) + 120_000,
    };
  },

  score(level, submission, _timing, params) {
    let raw = 0;
    let perfect = 0;
    let accuracySum = 0;
    let timeBonus = 0;
    const notes: string[] = [];
    level.stages.forEach((stage, i) => {
      const answer = submission.stages[i];
      const inTime = !!answer && answer.ms <= params.stageTimeLimitMs;
      const acc = inTime ? stageAccuracy(stage, answer) : 0;
      accuracySum += acc;
      raw += acc * params.pointsPerStage;
      if (acc === 1) {
        perfect++;
        const bonus = params.timeBonusMax * speedFactor(answer!.ms, params.stageTimeLimitMs);
        timeBonus += bonus;
        raw += bonus;
      }
      const label = `${i + 1}. ${STAGE_TITLES[stage.kind]}`;
      let detail = '';
      if (acc < 1 && stage.kind === 'bill') detail = ` (total was ₹${stage.options[stage.answer]})`;
      if (acc < 1 && stage.kind === 'recall') detail = ` (password was ${stage.options[stage.answer]})`;
      if (acc < 1 && stage.kind === 'files') detail = ` (${stage.targetName})`;
      notes.push(`${acc === 1 ? '✓' : acc > 0 ? '◐' : '✗'} ${label}${inTime ? '' : ' — out of time'}${detail}`);
    });
    const maxRaw = level.stages.length * (params.pointsPerStage + params.timeBonusMax);
    return {
      score: normalizeScore(raw, maxRaw),
      maxScore: MAX_SCORE,
      highlights: [
        { label: 'Stages cleared', value: `${perfect}/${level.stages.length}` },
        { label: 'Accuracy', value: `${Math.round((accuracySum / level.stages.length) * 100)}%` },
        { label: 'Speed bonus', value: String(Math.round(timeBonus)) },
      ],
      notes,
      breakdown: {
        perfectStages: perfect,
        stages: level.stages.length,
        accuracyPercent: Math.round((accuracySum / level.stages.length) * 100),
        timeBonus: Math.round(timeBonus),
        rawPoints: Math.round(raw),
        maxRawPoints: maxRaw,
      },
    };
  },
};
