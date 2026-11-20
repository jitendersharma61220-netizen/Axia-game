import { z } from 'zod';
import { createRng, hashSeed, type Rng } from '../prng';
import type { GameTemplate, ScoreResult } from '../types';

/**
 * Neon Dodge: an endless bullet-hell dodger played in waves.
 *
 * The whole game is a deterministic simulation that runs identically in the
 * browser (to play) and on the server (to verify). It only uses integer maths
 * plus +, -, *, Math.trunc and Math.sqrt, which IEEE-754 makes bit-exact in every
 * JS engine — never Math.sin/cos/atan2, whose results differ between browsers.
 *
 * Each wave is one interactive step: the browser sends the finger positions it
 * recorded for that wave, the server replays them and only then reveals the
 * seed of the next wave. Nobody can see, plan or rewind ahead of the wave they
 * are playing, and a score can't be claimed without the inputs that produce it.
 */

export const DODGE = {
  W: 720,
  H: 960,
  /** Fixed-point scale: positions and speeds are stored in 1/16 px. */
  FP: 16,
  TPS: 60,
  /** No spawns for this long at the start of a wave, so the player can settle. */
  WARMUP_TICKS: 60,
  /** No spawns for this long at the end of a wave, so it can clear out. */
  COOLDOWN_TICKS: 45,
  MAX_HAZARDS: 180,
} as const;

export const DODGE_HAZARDS = ['orb', 'shot', 'laser', 'burst', 'mine'] as const;
export type DodgeHazardType = (typeof DODGE_HAZARDS)[number];
export type DodgeHazardKind = 'orb' | 'shot' | 'laser' | 'burst' | 'spark' | 'mine' | 'core';

export const neonDodgeParamsSchema = z.object({
  waveSeconds: z.number().int().min(8).max(30).describe('Length of each wave (seconds)'),
  startWave: z.number().int().min(1).max(30).describe('Wave the run starts at (higher = harder from the first second)'),
  maxWaves: z.number().int().min(3).max(80).describe('Waves in a full run'),
  speedScale: z.number().min(0.5).max(3).describe('Hazard speed multiplier'),
  densityScale: z.number().min(0.5).max(3).describe('Hazard spawn-rate multiplier'),
  playerSpeed: z.number().int().min(4).max(20).describe('Ship speed (px per tick, 60 ticks/s)'),
  playerRadius: z.number().int().min(4).max(20).describe('Ship hitbox radius (px)'),
  grazeRadius: z.number().int().min(4).max(60).describe('Near-miss distance that counts as a graze (px beyond contact)'),
  shardsPerWave: z.number().int().min(0).max(10).describe('Bonus shards per wave'),
  bossEvery: z.number().int().min(0).max(20).describe('Boss wave every N waves (0 = never)'),
  hazards: z.array(z.enum(DODGE_HAZARDS)).min(1).describe('Hazard types (each unlocks at a later wave)'),
});

export type NeonDodgeParams = z.infer<typeof neonDodgeParamsSchema>;

export interface NeonDodgeLevel {
  /** One seed per wave. Only the first is sent to the browser up front. */
  waveSeeds: string[];
}

export interface NeonDodgeClientLevel {
  firstSeed: string;
  params: NeonDodgeParams;
}

/** [ticks, targetX, targetY] — the finger target held for `ticks` ticks; -1 = not touching. */
export type DodgeInput = [number, number, number];

const stepSchema = z.object({
  inputs: z
    .array(z.tuple([z.number().int().min(1).max(1800), z.number().int().min(-1).max(DODGE.W), z.number().int().min(-1).max(DODGE.H)]))
    .max(1800),
  /** The run ended early (player left the game) rather than by being hit. */
  quit: z.boolean().optional(),
});
export type NeonDodgeStep = z.infer<typeof stepSchema>;

export const neonDodgeSubmissionSchema = z.object({ waves: z.array(stepSchema).max(80) });
export type NeonDodgeSubmission = z.infer<typeof neonDodgeSubmissionSchema>;

/* ------------------------------------------------------------------ */
/* Integer trigonometry                                                */
/* ------------------------------------------------------------------ */

/** sin(i · π/128) · 4096 for i = 0..64 (a quarter wave), rounded. */
const QUARTER_SINE = [
  0, 101, 201, 301, 401, 501, 601, 700, 799, 897, 995, 1092, 1189, 1285, 1380, 1474, 1567, 1660, 1751, 1842, 1931, 2019, 2106,
  2191, 2276, 2359, 2440, 2520, 2598, 2675, 2751, 2824, 2896, 2967, 3035, 3102, 3166, 3229, 3290, 3349, 3406, 3461, 3513, 3564,
  3612, 3659, 3703, 3745, 3784, 3822, 3857, 3889, 3920, 3948, 3973, 3996, 4017, 4036, 4052, 4065, 4076, 4085, 4091, 4095, 4096,
];

/** sin of a 0–255 angle (256 = full turn), scaled by 4096. */
export function isin(angle: number): number {
  const a = angle & 255;
  if (a < 64) return QUARTER_SINE[a];
  if (a < 128) return QUARTER_SINE[128 - a];
  if (a < 192) return 0 - QUARTER_SINE[a - 128];
  return 0 - QUARTER_SINE[256 - a];
}
export const icos = (angle: number) => isin(angle + 64);

const isqrt = (n: number) => Math.floor(Math.sqrt(n));

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export interface DodgeHazard {
  id: number;
  kind: DodgeHazardKind;
  /** Position and velocity in 1/16 px. Lasers use x (vertical) or y (horizontal) as the beam line. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radius (1/16 px); half-thickness for lasers. */
  r: number;
  /** Telegraph ticks left; a hazard can't hurt while warn > 0. */
  warn: number;
  /** Ticks left before it disappears (-1 = until it leaves the arena). */
  life: number;
  /** Laser orientation: 0 = horizontal beam at y, 1 = vertical beam at x. */
  axis: number;
  /** Burst: bullets released when the telegraph ends. */
  count: number;
  angle: number;
  speed: number;
  grazed: boolean;
}

export interface DodgePickup {
  id: number;
  x: number;
  y: number;
  life: number;
}

export type DodgeEvent =
  | { type: 'graze'; x: number; y: number; combo: number; points: number }
  | { type: 'shard'; x: number; y: number; points: number }
  | { type: 'death'; x: number; y: number; cause: DodgeHazardKind }
  | { type: 'fire'; kind: DodgeHazardKind };

export interface DodgeRun {
  params: NeonDodgeParams;
  /** Index of the wave being played (0-based); the displayed wave number is waveNumber(run). */
  waveIndex: number;
  waveTick: number;
  totalTicks: number;
  px: number;
  py: number;
  alive: boolean;
  /** Set when the run is over: hit, quit, or every wave cleared. */
  ended: 'hit' | 'quit' | 'cleared' | null;
  points: number;
  chain: number;
  lastGrazeTick: number;
  maxCombo: number;
  grazes: number;
  shards: number;
  wavesCleared: number;
  hazards: DodgeHazard[];
  pickups: DodgePickup[];
  death: { wave: number; tick: number; cause: DodgeHazardKind } | null;
  /** Visual events from the last tick, only collected when `fx` is on (the browser). */
  fx: boolean;
  events: DodgeEvent[];
  // Per-wave spawner state.
  rng: Rng;
  nextId: number;
  timers: Record<DodgeHazardType, number>;
  shardTicks: number[];
  spiral: number;
}

export const waveTicks = (p: NeonDodgeParams) => p.waveSeconds * DODGE.TPS;
export const waveNumber = (run: Pick<DodgeRun, 'params' | 'waveIndex'>) => run.params.startWave + run.waveIndex;
export const isBossWave = (p: NeonDodgeParams, wave: number) => p.bossEvery > 0 && wave % p.bossEvery === 0;
export const comboOf = (chain: number) => Math.min(5, 1 + Math.floor(chain / 3));

const UNLOCK: Record<DodgeHazardType, number> = { orb: 1, shot: 2, laser: 3, burst: 4, mine: 7 };
const BASE_INTERVAL: Record<DodgeHazardType, number> = { orb: 80, shot: 150, laser: 280, burst: 330, mine: 420 };
const MIN_INTERVAL: Record<DodgeHazardType, number> = { orb: 9, shot: 18, laser: 60, burst: 80, mine: 160 };
const RAMP: Record<DodgeHazardType, number> = { orb: 0.3, shot: 0.22, laser: 0.16, burst: 0.16, mine: 0.12 };

function speedFactor(p: NeonDodgeParams, wave: number) {
  return Math.min(2.4, 1 + 0.07 * (wave - 1)) * p.speedScale;
}

function spawnInterval(p: NeonDodgeParams, kind: DodgeHazardType, wave: number, boss: boolean) {
  const base = BASE_INTERVAL[kind] / (1 + RAMP[kind] * (wave - UNLOCK[kind])) / p.densityScale;
  return Math.max(MIN_INTERVAL[kind], Math.trunc(boss ? base * 2 : base));
}

export function createRun(params: NeonDodgeParams, fx = false): DodgeRun {
  return {
    params,
    waveIndex: 0,
    waveTick: 0,
    totalTicks: 0,
    px: (DODGE.W / 2) * DODGE.FP,
    py: DODGE.H * 0.72 * DODGE.FP,
    alive: true,
    ended: null,
    points: 0,
    chain: 0,
    lastGrazeTick: -10_000,
    maxCombo: 1,
    grazes: 0,
    shards: 0,
    wavesCleared: 0,
    hazards: [],
    pickups: [],
    death: null,
    fx,
    events: [],
    rng: createRng('init'),
    nextId: 1,
    timers: { orb: 0, shot: 0, laser: 0, burst: 0, mine: 0 },
    shardTicks: [],
    spiral: 0,
  };
}

/** Resets the arena for the wave at run.waveIndex, seeded by that wave's seed. */
export function beginWave(run: DodgeRun, seed: string) {
  const p = run.params;
  const wave = waveNumber(run);
  const boss = isBossWave(p, wave);
  run.rng = createRng(seed);
  run.waveTick = 0;
  run.hazards = [];
  run.pickups = [];
  run.spiral = run.rng.int(0, 255);
  for (const kind of DODGE_HAZARDS) {
    run.timers[kind] = DODGE.WARMUP_TICKS + run.rng.int(0, spawnInterval(p, kind, wave, boss));
  }
  const total = waveTicks(p);
  const span = total - DODGE.WARMUP_TICKS - DODGE.COOLDOWN_TICKS;
  run.shardTicks = Array.from({ length: p.shardsPerWave }, (_, i) =>
    DODGE.WARMUP_TICKS + Math.trunc(((i + 0.5) * span) / p.shardsPerWave) + run.rng.int(-30, 30),
  );
  if (boss) {
    run.hazards.push(hazard(run, 'core', (DODGE.W / 2) * DODGE.FP, 250 * DODGE.FP, 0, 0, 34, { warn: 50, life: total }));
  }
}

function hazard(
  run: DodgeRun,
  kind: DodgeHazardKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radiusPx: number,
  extra: Partial<DodgeHazard> = {},
): DodgeHazard {
  return {
    id: run.nextId++,
    kind,
    x,
    y,
    vx,
    vy,
    r: radiusPx * DODGE.FP,
    warn: 0,
    life: -1,
    axis: 0,
    count: 0,
    angle: 0,
    speed: 0,
    grazed: false,
    ...extra,
  };
}

/** Velocity of `speed` (1/16 px per tick) pointing from (x, y) to (tx, ty). */
function aim(x: number, y: number, tx: number, ty: number, speed: number): [number, number] {
  const dx = tx - x;
  const dy = ty - y;
  const d = isqrt(dx * dx + dy * dy);
  if (d === 0) return [0, speed];
  return [Math.trunc((dx * speed) / d), Math.trunc((dy * speed) / d)];
}

/** A point just outside a random edge of the arena. */
function edgePoint(rng: Rng, marginPx: number): [number, number] {
  const { W, H, FP } = DODGE;
  const side = rng.int(0, 3);
  if (side === 0) return [rng.int(0, W) * FP, -marginPx * FP];
  if (side === 1) return [(W + marginPx) * FP, rng.int(0, H) * FP];
  if (side === 2) return [rng.int(0, W) * FP, (H + marginPx) * FP];
  return [-marginPx * FP, rng.int(0, H) * FP];
}

function spawn(run: DodgeRun, kind: DodgeHazardType, wave: number) {
  const { rng } = run;
  const { W, H, FP } = DODGE;
  const sf = speedFactor(run.params, wave);
  const px = (s: number) => Math.trunc(s * sf * FP);
  if (kind === 'orb') {
    const [x, y] = edgePoint(rng, 14);
    const [vx, vy] = aim(x, y, rng.int(100, W - 100) * FP, rng.int(150, H - 150) * FP, px(2.6));
    run.hazards.push(hazard(run, 'orb', x, y, vx, vy, 11));
  } else if (kind === 'shot') {
    const [x, y] = edgePoint(rng, 10);
    const [vx, vy] = aim(x, y, run.px, run.py, px(4.6));
    run.hazards.push(hazard(run, 'shot', x, y, vx, vy, 8));
  } else if (kind === 'laser') {
    const axis = rng.int(0, 1);
    const aimed = wave >= 6 && rng.int(0, 1) === 1;
    const line = aimed ? (axis === 0 ? run.py : run.px) : axis === 0 ? rng.int(80, H - 80) * FP : rng.int(60, W - 60) * FP;
    const warn = Math.max(32, 56 - 2 * wave);
    run.hazards.push(
      hazard(run, 'laser', axis === 1 ? line : 0, axis === 0 ? line : 0, 0, 0, 8, { axis, warn, life: warn + 24 }),
    );
  } else if (kind === 'burst') {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 6; tries++) {
      x = rng.int(90, W - 90) * FP;
      y = rng.int(140, H - 140) * FP;
      const dx = x - run.px;
      const dy = y - run.py;
      if (dx * dx + dy * dy >= (240 * FP) ** 2) break;
    }
    run.hazards.push(
      hazard(run, 'burst', x, y, 0, 0, 16, { warn: 45, life: 45, count: 8 + Math.min(10, wave - 4), angle: rng.int(0, 255), speed: px(2.4) }),
    );
  } else {
    const [x, y] = edgePoint(rng, 12);
    run.hazards.push(hazard(run, 'mine', x, y, 0, 0, 11, { life: 330, speed: px(2.1) }));
  }
}

function ring(run: DodgeRun, into: DodgeHazard[], x: number, y: number, count: number, angle: number, speed: number) {
  for (let i = 0; i < count; i++) {
    const a = angle + Math.trunc((i * 256) / count);
    into.push(hazard(run, 'spark', x, y, Math.trunc((icos(a) * speed) / 4096), Math.trunc((isin(a) * speed) / 4096), 7));
  }
}

function die(run: DodgeRun, cause: DodgeHazardKind) {
  run.alive = false;
  run.ended = 'hit';
  run.death = { wave: waveNumber(run), tick: run.totalTicks, cause };
  if (run.fx) run.events.push({ type: 'death', x: run.px, y: run.py, cause });
}

/** Advances the run by one tick with the finger target (tx, ty) in px, or -1 for no touch. */
export function tickRun(run: DodgeRun, tx: number, ty: number) {
  if (!run.alive || run.ended) return;
  const p = run.params;
  const { W, H, FP } = DODGE;
  if (run.fx) run.events = [];
  const wave = waveNumber(run);
  const boss = isBossWave(p, wave);
  const pr = p.playerRadius * FP;

  // 1. Move the ship toward the finger at most playerSpeed per tick.
  if (tx >= 0 && ty >= 0) {
    const gx = Math.min(W * FP - pr, Math.max(pr, tx * FP));
    const gy = Math.min(H * FP - pr, Math.max(pr, ty * FP));
    const dx = gx - run.px;
    const dy = gy - run.py;
    const sp = p.playerSpeed * FP;
    const d2 = dx * dx + dy * dy;
    if (d2 <= sp * sp) {
      run.px = gx;
      run.py = gy;
    } else {
      const d = isqrt(d2);
      run.px += Math.trunc((dx * sp) / d);
      run.py += Math.trunc((dy * sp) / d);
    }
  }

  // 2. Spawn.
  const t = run.waveTick;
  const total = waveTicks(p);
  if (t >= DODGE.WARMUP_TICKS && t < total - DODGE.COOLDOWN_TICKS && run.hazards.length < DODGE.MAX_HAZARDS) {
    for (const kind of DODGE_HAZARDS) {
      if (!p.hazards.includes(kind) || wave < UNLOCK[kind]) continue;
      if (boss && (kind === 'burst' || kind === 'mine')) continue;
      if (--run.timers[kind] > 0) continue;
      const interval = spawnInterval(p, kind, wave, boss);
      run.timers[kind] = interval + run.rng.int(-Math.trunc(interval / 4), Math.trunc(interval / 4));
      spawn(run, kind, wave);
      if (run.fx) run.events.push({ type: 'fire', kind });
    }
    if (boss) {
      const core = run.hazards.find((h) => h.kind === 'core');
      const every = Math.max(4, 9 - Math.floor(wave / 5));
      if (core && core.warn === 0 && t % every === 0) {
        const speed = Math.trunc(2.5 * speedFactor(p, wave) * FP);
        const arms = wave >= 10 ? 4 : 2;
        ring(run, run.hazards, core.x, core.y, arms, run.spiral, speed);
        run.spiral = (run.spiral + 11) & 255;
      }
    }
  }
  for (const at of run.shardTicks) {
    if (at === t) {
      run.pickups.push({ id: run.nextId++, x: run.rng.int(80, W - 80) * FP, y: run.rng.int(140, H - 140) * FP, life: 300 });
    }
  }

  // 3. Move hazards, resolve telegraphs, collide.
  const gr = p.grazeRadius * FP;
  const combo = comboOf(run.chain);
  const survivors: DodgeHazard[] = [];
  const born: DodgeHazard[] = [];
  for (const h of run.hazards) {
    if (h.warn > 0) {
      h.warn--;
      if (h.warn === 0 && h.kind === 'burst') {
        // Sparks start moving next tick, so a burst can't hit on the frame it opens.
        ring(run, born, h.x, h.y, h.count, h.angle, h.speed);
        continue;
      }
    } else if (h.kind === 'mine') {
      const [vx, vy] = aim(h.x, h.y, run.px, run.py, h.speed);
      h.vx = vx;
      h.vy = vy;
    }
    h.x += h.vx;
    h.y += h.vy;
    if (h.life > 0 && --h.life === 0) continue;
    if (h.life < 0 && (h.x < -60 * FP || h.x > (W + 60) * FP || h.y < -60 * FP || h.y > (H + 60) * FP)) continue;
    survivors.push(h);

    if (h.warn > 0 || !run.alive) continue;
    let dist2: number;
    let reach: number;
    if (h.kind === 'laser') {
      const d = h.axis === 0 ? run.py - h.y : run.px - h.x;
      dist2 = d * d;
      reach = h.r + pr;
    } else {
      const dx = h.x - run.px;
      const dy = h.y - run.py;
      dist2 = dx * dx + dy * dy;
      reach = h.r + pr;
    }
    if (dist2 < reach * reach) {
      die(run, h.kind);
    } else if (!h.grazed && dist2 < (reach + gr) * (reach + gr)) {
      h.grazed = true;
      run.chain++;
      run.grazes++;
      run.lastGrazeTick = run.totalTicks;
      const c = comboOf(run.chain);
      run.maxCombo = Math.max(run.maxCombo, c);
      run.points += 25 * c;
      if (run.fx) run.events.push({ type: 'graze', x: h.kind === 'laser' ? run.px : h.x, y: h.kind === 'laser' ? run.py : h.y, combo: c, points: 25 * c });
    }
  }
  run.hazards = survivors.concat(born);
  if (!run.alive) return;

  // 4. Shards.
  const reachShard = (12 + 8) * FP + pr;
  run.pickups = run.pickups.filter((s) => {
    const dx = s.x - run.px;
    const dy = s.y - run.py;
    if (dx * dx + dy * dy < reachShard * reachShard) {
      const pts = 100 * combo;
      run.points += pts;
      run.shards++;
      if (run.fx) run.events.push({ type: 'shard', x: s.x, y: s.y, points: pts });
      return false;
    }
    return --s.life > 0;
  });

  // 5. Survival points and combo decay.
  run.points += 1;
  if (run.totalTicks - run.lastGrazeTick > 180) run.chain = 0;
  run.waveTick++;
  run.totalTicks++;
}

/** Closes a fully survived wave: bonus, then either the next wave or the end of the run. */
export function finishWave(run: DodgeRun) {
  run.wavesCleared++;
  run.points += 200 * waveNumber(run);
  run.waveIndex++;
  if (run.waveIndex >= run.params.maxWaves) run.ended = 'cleared';
}

export const inputTicks = (step: Pick<NeonDodgeStep, 'inputs'>) => step.inputs.reduce((n, [c]) => n + c, 0);

export type WaveOutcome = 'survived' | 'hit' | 'quit';

/** Replays one wave from its recorded inputs. Inputs beyond the wave (or after a hit) are ignored. */
export function playWave(run: DodgeRun, seed: string, step: NeonDodgeStep): WaveOutcome {
  beginWave(run, seed);
  const total = waveTicks(run.params);
  let i = 0;
  let left = step.inputs[0]?.[0] ?? 0;
  for (let t = 0; t < total; t++) {
    while (left === 0 && i < step.inputs.length - 1) left = step.inputs[++i][0];
    if (left === 0) {
      // The inputs stop before the wave does: the player left.
      run.ended = 'quit';
      return 'quit';
    }
    left--;
    tickRun(run, step.inputs[i][1], step.inputs[i][2]);
    if (!run.alive) return 'hit';
  }
  if (step.quit) {
    run.ended = 'quit';
    return 'quit';
  }
  finishWave(run);
  return 'survived';
}

/** Plays every recorded wave in order, stopping when the run ends. */
export function replayRun(level: NeonDodgeLevel, params: NeonDodgeParams, steps: NeonDodgeStep[]): DodgeRun {
  const run = createRun(params);
  for (let i = 0; i < steps.length && !run.ended; i++) playWave(run, level.waveSeeds[i], steps[i]);
  return run;
}

const CAUSE: Record<DodgeHazardKind, string> = {
  orb: 'a drifting orb',
  shot: 'an aimed shot',
  laser: 'a laser beam',
  burst: 'a burst',
  spark: 'a burst spark',
  mine: 'a homing mine',
  core: 'the boss core',
};

const fmtTime = (ticks: number) => {
  const s = Math.floor(ticks / DODGE.TPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const neonDodge: GameTemplate<NeonDodgeParams, NeonDodgeLevel, NeonDodgeClientLevel, NeonDodgeSubmission> = {
  key: 'neon-dodge',
  name: 'Neon Dodge',
  category: 'arcade',
  description: 'Survive the swarm. Every wave is faster and meaner — one touch and you’re out.',
  howToPlay: [
    'Drag anywhere to steer your ship (arrow keys / WASD on a computer). One hit ends the run.',
    'Fly close past hazards to GRAZE: grazes build your combo up to ×5. Grab ◆ shards for big points.',
    'Lasers flash before they fire. New hazards join every few waves, and every 5th wave is a boss.',
    'Your score has no ceiling — how far can you go?',
  ],
  paramsSchema: neonDodgeParamsSchema,
  submissionSchema: neonDodgeSubmissionSchema,
  defaultParams: {
    waveSeconds: 12,
    startWave: 1,
    maxWaves: 50,
    speedScale: 1,
    densityScale: 1,
    playerSpeed: 9,
    playerRadius: 9,
    grazeRadius: 22,
    shardsPerWave: 3,
    bossEvery: 5,
    hazards: [...DODGE_HAZARDS],
  },

  generateLevel(params, seed) {
    // One-way: a wave seed reveals nothing about the session seed or later waves.
    const waveSeeds = Array.from({ length: params.maxWaves }, (_, i) =>
      [hashSeed(`${seed}|w${i}`), hashSeed(`w${i}|${seed}`)].map((n) => n.toString(36)).join('-'),
    );
    return { waveSeeds };
  },

  toClientLevel(level, params) {
    return { firstSeed: level.waveSeeds[0], params };
  },

  timingBounds(params) {
    return {
      minMs: 1000,
      maxMs: params.maxWaves * (params.waveSeconds * 1350 + 6000) + 60_000,
    };
  },

  interactive: {
    stepSchema,
    check(level, params, index, step: NeonDodgeStep, previous: NeonDodgeStep[]) {
      const run = replayRun(level, params, previous);
      if (run.ended) return { feedback: { outcome: 'over', points: run.points }, done: true };
      const outcome = playWave(run, level.waveSeeds[index], step);
      const next = outcome === 'survived' && !run.ended ? level.waveSeeds[index + 1] : undefined;
      return {
        feedback: {
          outcome,
          points: run.points,
          wave: waveNumber(run),
          ticks: run.totalTicks,
          combo: comboOf(run.chain),
          death: run.death,
          ...(next ? { nextSeed: next } : {}),
        },
        done: !next,
      };
    },
    toSubmission: (steps: NeonDodgeStep[]) => ({ waves: steps }),
    stepPlayMs: (step: NeonDodgeStep, params: NeonDodgeParams) =>
      Math.round((Math.min(inputTicks(step), waveTicks(params)) * 1000) / DODGE.TPS),
  },

  score(level, submission, _timing, params): ScoreResult {
    const run = replayRun(level, params, submission.waves);
    const reached = run.ended === 'cleared' ? run.params.startWave + run.params.maxWaves - 1 : waveNumber(run);
    const notes: string[] = [];
    if (run.death) notes.push(`Taken out by ${CAUSE[run.death.cause]} in wave ${run.death.wave} after ${fmtTime(run.death.tick)}.`);
    else if (run.ended === 'cleared') notes.push(`You cleared all ${params.maxWaves} waves. Legendary.`);
    else if (run.ended === 'quit') notes.push('The run ended when you left the game.');
    return {
      score: run.points,
      // Endless game: no ceiling on the score.
      maxScore: 0,
      breakdown: {
        points: run.points,
        ticks: run.totalTicks,
        waveReached: reached,
        wavesCleared: run.wavesCleared,
        grazes: run.grazes,
        shards: run.shards,
        maxCombo: run.maxCombo,
      },
      highlights: [
        { label: 'Survived', value: fmtTime(run.totalTicks) },
        { label: 'Wave', value: String(reached) },
        { label: 'Best combo', value: `×${run.maxCombo}` },
      ],
      notes,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Autopilot                                                           */
/* ------------------------------------------------------------------ */

const AUTOPILOT_DIRS: [number, number][] = [[0, 0]];
for (let a = 0; a < 256; a += 32) AUTOPILOT_DIRS.push([icos(a), isin(a)]);

/**
 * A simple look-ahead dodger, used by tests and admin tooling to measure how hard
 * a preset is ("a decent bot reaches wave N"). It sees only what a player sees.
 * Returns the finger target (px) for the next tick.
 */
export function autopilotTarget(run: DodgeRun, lookahead = 14): [number, number] {
  const p = run.params;
  const { W, H, FP } = DODGE;
  const pr = p.playerRadius * FP;
  const sp = p.playerSpeed * FP;
  let best: [number, number] = [-1, -1];
  let bestScore = -Infinity;
  for (const [cx, cy] of AUTOPILOT_DIRS) {
    let x = run.px;
    let y = run.py;
    let clearance = Infinity;
    for (let k = 1; k <= lookahead; k++) {
      x = Math.min(W * FP - pr, Math.max(pr, x + Math.trunc((cx * sp) / 4096)));
      y = Math.min(H * FP - pr, Math.max(pr, y + Math.trunc((cy * sp) / 4096)));
      for (const h of run.hazards) {
        if (h.kind === 'laser') {
          if (h.warn > k + 2) continue;
          const d = Math.abs(h.axis === 0 ? y - h.y : x - h.x) - h.r - pr;
          clearance = Math.min(clearance, d);
        } else if (h.kind === 'burst') {
          // Unopened burst: avoid standing right on top of it.
          const dx = h.x - x;
          const dy = h.y - y;
          clearance = Math.min(clearance, isqrt(dx * dx + dy * dy) - 140 * FP);
        } else {
          if (h.warn > k) continue;
          const hx = h.x + h.vx * k;
          const hy = h.y + h.vy * k;
          const dx = hx - x;
          const dy = hy - y;
          clearance = Math.min(clearance, isqrt(dx * dx + dy * dy) - h.r - pr);
        }
      }
    }
    // Prefer safety first, then staying away from walls and near the lower middle.
    const wall = Math.min(x, W * FP - x, y, H * FP - y);
    const home = Math.abs(x - (W / 2) * FP) + Math.abs(y - H * 0.65 * FP);
    const score = Math.min(clearance, 60 * FP) * 4 + Math.min(wall, 120 * FP) - home / 8;
    if (score > bestScore) {
      bestScore = score;
      best = cx === 0 && cy === 0 ? [-1, -1] : [Math.trunc(x / FP), Math.trunc(y / FP)];
    }
  }
  return best;
}

/** Plays one wave live with the autopilot and returns the recorded step. */
export function autopilotWave(run: DodgeRun, seed: string, opts: { lookahead?: number; stopAfterTicks?: number } = {}): NeonDodgeStep {
  beginWave(run, seed);
  const inputs: DodgeInput[] = [];
  const total = waveTicks(run.params);
  for (let t = 0; t < total && run.alive; t++) {
    if (opts.stopAfterTicks !== undefined && t >= opts.stopAfterTicks) return { inputs, quit: true };
    const [tx, ty] = autopilotTarget(run, opts.lookahead);
    const last = inputs[inputs.length - 1];
    if (last && last[1] === tx && last[2] === ty) last[0]++;
    else inputs.push([1, tx, ty]);
    tickRun(run, tx, ty);
  }
  if (run.alive) finishWave(run);
  return { inputs };
}
