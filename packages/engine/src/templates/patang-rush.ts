import { z } from 'zod';
import { createRng, hashSeed, type Rng } from '../prng';
import type { GameTemplate, ScoreResult } from '../types';
import { isin } from './neon-dodge';

/**
 * Patang Rush: a one-tap kite flyer over a night-time city.
 *
 * Gravity pulls the kite down; every tap is a gust that lifts it. Towers rise
 * from the street and hang from the sky, and the kite has to slip through the
 * gap between them. Later stages add sliding gaps and rival kites.
 *
 * Like Neon Dodge, the game is a deterministic integer simulation that runs
 * identically in the browser (to play) and on the server (to verify). Each
 * stage is one interactive step: the browser sends the ticks on which the
 * player tapped, the server replays them and only then reveals the next
 * stage's seed.
 */

export const KITE = {
  W: 720,
  H: 960,
  /** Fixed-point scale: positions and speeds are stored in 1/16 px. */
  FP: 16,
  TPS: 60,
  /** The street. Touching it ends the run. */
  GROUND: 870,
  /** The kite flies at a fixed x; the city scrolls past it. */
  KX: 210,
  /** Towers appear with their left edge here. */
  SPAWN_X: 760,
  /** The kite hovers at the start of each stage until the first tap, at most this long. */
  HOVER_TICKS: 90,
  /** First tower of a stage appears on this tick. */
  FIRST_GATE_TICK: 20,
  /** Terminal fall speed (px per tick). */
  MAX_FALL: 15,
  /** Largest jump in gap height between neighbouring towers (px). */
  MAX_GAP_DELTA: 260,
} as const;

export const patangRushParamsSchema = z.object({
  stageSeconds: z.number().int().min(8).max(30).describe('Length of each stage (seconds)'),
  startStage: z.number().int().min(1).max(30).describe('Stage the run starts at (higher = harder from the first second)'),
  maxStages: z.number().int().min(3).max(60).describe('Stages in a full run'),
  scrollSpeed: z.number().min(2).max(10).describe('City scroll speed at stage 1 (px per tick, 60 ticks/s)'),
  speedRamp: z.number().min(0).max(0.2).describe('Extra scroll speed per stage (0.05 = +5% each stage)'),
  gravity: z.number().min(0.2).max(1.5).describe('Gravity (px per tick²)'),
  liftSpeed: z.number().min(5).max(20).describe('Upward speed from one tap (px per tick)'),
  gateSpacing: z.number().int().min(220).max(600).describe('Distance between towers (px)'),
  gateWidth: z.number().int().min(60).max(200).describe('Tower width (px)'),
  gapSize: z.number().int().min(160).max(420).describe('Gap between the towers at stage 1 (px)'),
  gapShrink: z.number().int().min(0).max(30).describe('Gap shrinks by this much each stage (px)'),
  minGap: z.number().int().min(140).max(400).describe('Smallest gap, however late the stage (px)'),
  kiteRadius: z.number().int().min(8).max(30).describe('Kite hitbox radius (px)'),
  movingFrom: z.number().int().min(0).max(30).describe('Gaps start sliding up and down from this stage (0 = never)'),
  moveAmplitude: z.number().int().min(0).max(200).describe('How far a sliding gap travels from its centre (px)'),
  rivalsFrom: z.number().int().min(0).max(30).describe('Rival kites appear from this stage (0 = never)'),
  starChance: z.number().min(0).max(1).describe('Chance of a bonus star between two towers'),
});

export type PatangRushParams = z.infer<typeof patangRushParamsSchema>;

export interface PatangRushLevel {
  /** One seed per stage. Only the first is sent to the browser up front. */
  stageSeeds: string[];
}

export interface PatangRushClientLevel {
  firstSeed: string;
  params: PatangRushParams;
}

const stepSchema = z.object({
  /** How many ticks of the stage were played. */
  ticks: z.number().int().min(1).max(1800),
  /** Stage ticks (0-based, ascending) on which the player tapped. */
  taps: z.array(z.number().int().min(0).max(1799)).max(900),
  /** The run ended early (player left the game) rather than by a crash. */
  quit: z.boolean().optional(),
});
export type PatangRushStep = z.infer<typeof stepSchema>;

export const patangRushSubmissionSchema = z.object({ stages: z.array(stepSchema).max(60) });
export type PatangRushSubmission = z.infer<typeof patangRushSubmissionSchema>;

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export interface KiteGate {
  id: number;
  /** Left edge (1/16 px). */
  x: number;
  w: number;
  /** Resting centre of the gap and its current centre (1/16 px). */
  baseY: number;
  cy: number;
  gap: number;
  /** Sliding gaps: amplitude (1/16 px), phase and speed in 1/256 turns. */
  amp: number;
  phase: number;
  rate: number;
  age: number;
  passed: boolean;
}

export type KiteThingKind = 'star' | 'rival';

export interface KiteThing {
  id: number;
  kind: KiteThingKind;
  x: number;
  baseY: number;
  y: number;
  r: number;
  amp: number;
  phase: number;
  rate: number;
  age: number;
}

export type KiteDeathCause = 'street' | 'tower' | 'rival';

export type KiteEvent =
  | { type: 'flap' }
  | { type: 'gate'; points: number; gates: number }
  | { type: 'star'; x: number; y: number; points: number }
  | { type: 'death'; y: number; cause: KiteDeathCause };

export interface KiteRun {
  params: PatangRushParams;
  /** Index of the stage being played (0-based); the displayed stage is stageNumber(run). */
  stageIndex: number;
  stageTick: number;
  totalTicks: number;
  /** Kite height and vertical speed (1/16 px, down is positive). */
  y: number;
  vy: number;
  hovering: boolean;
  alive: boolean;
  /** Set when the run is over: crashed, quit, or every stage cleared. */
  ended: 'hit' | 'quit' | 'cleared' | null;
  points: number;
  gatesPassed: number;
  stars: number;
  taps: number;
  stagesCleared: number;
  gates: KiteGate[];
  things: KiteThing[];
  death: { stage: number; tick: number; cause: KiteDeathCause } | null;
  /** Visual events from the last tick, only collected when `fx` is on (the browser). */
  fx: boolean;
  events: KiteEvent[];
  // Per-stage spawner state.
  rng: Rng;
  nextId: number;
  gateIn: number;
  thingIn: number;
  lastGap: number;
  nextGap: number;
}

export const stageTicks = (p: PatangRushParams) => p.stageSeconds * KITE.TPS;
export const stageNumber = (run: Pick<KiteRun, 'params' | 'stageIndex'>) => run.params.startStage + run.stageIndex;

const FP = KITE.FP;

/** Scroll speed for a stage, in 1/16 px per tick. */
export function scrollSpeed(p: PatangRushParams, stage: number) {
  const factor = Math.min(2.2, 1 + p.speedRamp * (stage - 1));
  return Math.max(FP, Math.trunc(p.scrollSpeed * factor * FP));
}

export function gapFor(p: PatangRushParams, stage: number) {
  return Math.max(p.minGap, p.gapSize - p.gapShrink * (stage - 1));
}

const gravityOf = (p: PatangRushParams) => Math.max(1, Math.trunc(p.gravity * FP));
const liftOf = (p: PatangRushParams) => Math.trunc(p.liftSpeed * FP);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createKiteRun(params: PatangRushParams, fx = false): KiteRun {
  return {
    params,
    stageIndex: 0,
    stageTick: 0,
    totalTicks: 0,
    y: Math.trunc(KITE.H * 0.42) * FP,
    vy: 0,
    hovering: true,
    alive: true,
    ended: null,
    points: 0,
    gatesPassed: 0,
    stars: 0,
    taps: 0,
    stagesCleared: 0,
    gates: [],
    things: [],
    death: null,
    fx,
    events: [],
    rng: createRng('init'),
    nextId: 1,
    gateIn: 0,
    thingIn: -1,
    lastGap: 0,
    nextGap: 0,
  };
}

/** Picks the resting gap centre (px) of the next tower, within reach of the previous one. */
function pickGap(run: KiteRun, stage: number, prev: number) {
  const p = run.params;
  const half = Math.trunc(gapFor(p, stage) / 2);
  const amp = movingAllowed(p, stage) ? p.moveAmplitude : 0;
  let lo = 110 + half + amp;
  let hi = KITE.GROUND - 90 - half - amp;
  if (lo > hi) lo = hi = Math.trunc((110 + KITE.GROUND - 90) / 2);
  lo = Math.max(lo, prev - KITE.MAX_GAP_DELTA);
  hi = Math.min(hi, prev + KITE.MAX_GAP_DELTA);
  if (lo > hi) return clamp(prev, Math.min(lo, hi), Math.max(lo, hi));
  return run.rng.int(lo, hi);
}

const movingAllowed = (p: PatangRushParams, stage: number) => p.movingFrom > 0 && stage >= p.movingFrom && p.moveAmplitude > 0;

/** Resets the sky for the stage at run.stageIndex, seeded by that stage's seed. */
export function beginStage(run: KiteRun, seed: string) {
  const stage = stageNumber(run);
  run.rng = createRng(seed);
  run.stageTick = 0;
  run.gates = [];
  run.things = [];
  run.y = Math.trunc(KITE.H * 0.42) * FP;
  run.vy = 0;
  run.hovering = true;
  run.gateIn = KITE.FIRST_GATE_TICK;
  run.thingIn = -1;
  run.lastGap = Math.trunc(KITE.H * 0.42);
  run.nextGap = pickGap(run, stage, run.lastGap);
}

/** Ticks a tower needs to scroll from where it appears to fully past the kite. */
function travelTicks(p: PatangRushParams, speed: number) {
  return Math.trunc(((KITE.SPAWN_X + p.gateWidth - KITE.KX + p.kiteRadius + 10) * FP) / speed) + 1;
}

function spawnGate(run: KiteRun, stage: number) {
  const p = run.params;
  const gap = gapFor(p, stage) * FP;
  let amp = 0;
  let phase = 0;
  let rate = 0;
  if (movingAllowed(p, stage) && run.rng.int(0, 99) < Math.min(70, 30 + 10 * (stage - p.movingFrom))) {
    // Sliding gaps start gentle and widen their swing over the next few stages.
    amp = Math.min(p.moveAmplitude, 35 + 7 * (stage - p.movingFrom)) * FP;
    phase = run.rng.int(0, 255);
    rate = stage - p.movingFrom >= 6 ? 3 : 2;
  }
  const baseY = run.nextGap * FP;
  run.gates.push({
    id: run.nextId++,
    x: KITE.SPAWN_X * FP,
    w: p.gateWidth * FP,
    baseY,
    cy: baseY + Math.trunc((amp * isin(phase)) / 4096),
    gap,
    amp,
    phase,
    rate,
    age: 0,
    passed: false,
  });
  run.lastGap = run.nextGap;
  run.nextGap = pickGap(run, stage, run.lastGap);
}

function spawnThing(run: KiteRun, stage: number) {
  const p = run.params;
  const mid = Math.trunc((run.lastGap + run.nextGap) / 2);
  const rivalPct = p.rivalsFrom > 0 && stage >= p.rivalsFrom ? Math.min(60, 25 + 5 * (stage - p.rivalsFrom)) : 0;
  const x = (KITE.SPAWN_X + 30) * FP;
  if (run.rng.int(0, 99) < rivalPct) {
    // A rival kite drifts between two towers, off the straight line between their gaps.
    const sign = run.rng.int(0, 1) === 0 ? -1 : 1;
    let y = mid + sign * run.rng.int(80, 140);
    if (y < 150 || y > KITE.GROUND - 150) y = mid - sign * run.rng.int(80, 140);
    y = clamp(y, 150, KITE.GROUND - 150);
    run.things.push({ id: run.nextId++, kind: 'rival', x, baseY: y * FP, y: y * FP, r: 20 * FP, amp: 45 * FP, phase: run.rng.int(0, 255), rate: 3, age: 0 });
  } else if (run.rng.int(0, 999) < Math.trunc(p.starChance * 1000)) {
    const y = clamp(mid + run.rng.int(-90, 90), 120, KITE.GROUND - 120);
    run.things.push({ id: run.nextId++, kind: 'star', x, baseY: y * FP, y: y * FP, r: 16 * FP, amp: 0, phase: 0, rate: 0, age: 0 });
  }
}

function die(run: KiteRun, cause: KiteDeathCause) {
  run.alive = false;
  run.ended = 'hit';
  run.death = { stage: stageNumber(run), tick: run.totalTicks, cause };
  if (run.fx) run.events.push({ type: 'death', y: run.y, cause });
}

/** Does the kite (a circle at KX, y) touch the axis-aligned box? All values in 1/16 px. */
function hitsBox(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number) {
  if (y1 <= y0) return false;
  const nx = clamp(cx, x0, x1);
  const ny = clamp(cy, y0, y1);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export const GATE_POINTS = 10;
export const STAR_POINTS = 25;
export const STAGE_BONUS = 20;

/** Advances the run by one tick. `tap` is true on the ticks the player tapped. */
export function tickKite(run: KiteRun, tap: boolean) {
  if (!run.alive || run.ended) return;
  const p = run.params;
  if (run.fx) run.events = [];
  const stage = stageNumber(run);
  const speed = scrollSpeed(p, stage);
  const r = p.kiteRadius * FP;
  const kx = KITE.KX * FP;
  const t = run.stageTick;

  // 1. The kite.
  if (tap) {
    run.hovering = false;
    run.vy = -liftOf(p);
    run.taps++;
    if (run.fx) run.events.push({ type: 'flap' });
  } else if (run.hovering && t >= KITE.HOVER_TICKS) {
    run.hovering = false;
  }
  if (!run.hovering) {
    if (!tap) run.vy = Math.min(run.vy + gravityOf(p), KITE.MAX_FALL * FP);
    run.y += run.vy;
    if (run.y < r) {
      run.y = r;
      run.vy = 0;
    }
  }

  // 2. Spawn towers, and stars or rivals halfway between them.
  const total = stageTicks(p);
  const interval = Math.max(20, Math.trunc((p.gateSpacing * FP) / speed));
  const lastSpawn = total - travelTicks(p, speed) - 20;
  if (run.gateIn > 0) run.gateIn--;
  if (run.gateIn === 0 && t <= lastSpawn) {
    spawnGate(run, stage);
    run.gateIn = interval;
    // Only between two towers: skip after the stage's last one.
    run.thingIn = t + interval <= lastSpawn ? Math.trunc(interval / 2) : -1;
  }
  if (run.thingIn > 0 && --run.thingIn === 0) {
    spawnThing(run, stage);
    run.thingIn = -1;
  }

  // 3. Scroll the city and check for crashes.
  const ground = KITE.GROUND * FP;
  if (run.y + r >= ground) {
    run.y = ground - r;
    die(run, 'street');
  }
  run.gates = run.gates.filter((g) => {
    g.x -= speed;
    g.age++;
    if (g.amp) g.cy = g.baseY + Math.trunc((g.amp * isin(g.phase + g.rate * g.age)) / 4096);
    if (run.alive) {
      const top = g.cy - Math.trunc(g.gap / 2);
      const bottom = g.cy + Math.trunc(g.gap / 2);
      if (hitsBox(kx, run.y, r, g.x, 0, g.x + g.w, top) || hitsBox(kx, run.y, r, g.x, bottom, g.x + g.w, ground)) {
        die(run, 'tower');
      } else if (!g.passed && g.x + g.w < kx - r) {
        g.passed = true;
        run.gatesPassed++;
        run.points += GATE_POINTS;
        if (run.fx) run.events.push({ type: 'gate', points: GATE_POINTS, gates: run.gatesPassed });
      }
    }
    return g.x + g.w > -40 * FP;
  });
  run.things = run.things.filter((th) => {
    th.x -= speed;
    th.age++;
    if (th.amp) th.y = th.baseY + Math.trunc((th.amp * isin(th.phase + th.rate * th.age)) / 4096);
    if (run.alive) {
      const dx = th.x - kx;
      const dy = th.y - run.y;
      const reach = th.r + r;
      if (dx * dx + dy * dy < reach * reach) {
        if (th.kind === 'rival') {
          die(run, 'rival');
        } else {
          run.stars++;
          run.points += STAR_POINTS;
          if (run.fx) run.events.push({ type: 'star', x: th.x, y: th.y, points: STAR_POINTS });
          return false;
        }
      }
    }
    return th.x > -60 * FP;
  });
  if (!run.alive) return;

  run.stageTick++;
  run.totalTicks++;
}

/** Closes a fully survived stage: bonus, then either the next stage or the end of the run. */
export function finishStage(run: KiteRun) {
  run.stagesCleared++;
  run.points += STAGE_BONUS * stageNumber(run);
  run.stageIndex++;
  if (run.stageIndex >= run.params.maxStages) run.ended = 'cleared';
}

export type StageOutcome = 'survived' | 'hit' | 'quit';

/** Replays one stage from its recorded taps. Taps beyond the stage (or after a crash) are ignored. */
export function playStage(run: KiteRun, seed: string, step: PatangRushStep): StageOutcome {
  beginStage(run, seed);
  const total = stageTicks(run.params);
  let i = 0;
  for (let t = 0; t < total; t++) {
    if (t >= step.ticks) {
      // The recording stops before the stage does: the player left.
      run.ended = 'quit';
      return 'quit';
    }
    while (i < step.taps.length && step.taps[i] < t) i++;
    tickKite(run, i < step.taps.length && step.taps[i] === t);
    if (!run.alive) return 'hit';
  }
  if (step.quit) {
    run.ended = 'quit';
    return 'quit';
  }
  finishStage(run);
  return 'survived';
}

/** Plays every recorded stage in order, stopping when the run ends. */
export function replayKiteRun(level: PatangRushLevel, params: PatangRushParams, steps: PatangRushStep[]): KiteRun {
  const run = createKiteRun(params);
  for (let i = 0; i < steps.length && !run.ended; i++) playStage(run, level.stageSeeds[i], steps[i]);
  return run;
}

const CAUSE: Record<KiteDeathCause, string> = {
  street: 'dropped onto the street',
  tower: 'clipped a tower',
  rival: 'tangled with a rival kite',
};

const fmtTime = (ticks: number) => {
  const s = Math.floor(ticks / KITE.TPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const patangRush: GameTemplate<PatangRushParams, PatangRushLevel, PatangRushClientLevel, PatangRushSubmission> = {
  key: 'patang-rush',
  name: 'Patang Rush',
  category: 'arcade',
  description: 'One tap, one gust. Fly your kite through the city skyline — clip a tower and it’s over.',
  howToPlay: [
    'Tap anywhere (or press Space) for a gust of wind that lifts your kite. Let go and it sinks.',
    'Slip through the gaps between the towers. Touching a tower or the street ends the run.',
    'Grab ★ stars for bonus points. Later stages bring sliding gaps and rival kites.',
    'Your score has no ceiling — how far can your patang fly?',
  ],
  paramsSchema: patangRushParamsSchema,
  submissionSchema: patangRushSubmissionSchema,
  defaultParams: {
    stageSeconds: 15,
    startStage: 1,
    maxStages: 40,
    scrollSpeed: 4,
    speedRamp: 0.05,
    gravity: 0.55,
    liftSpeed: 10.5,
    gateSpacing: 340,
    gateWidth: 110,
    gapSize: 270,
    gapShrink: 8,
    minGap: 190,
    kiteRadius: 17,
    movingFrom: 3,
    moveAmplitude: 70,
    rivalsFrom: 5,
    starChance: 0.4,
  },

  generateLevel(params, seed) {
    // One-way: a stage seed reveals nothing about the session seed or later stages.
    const stageSeeds = Array.from({ length: params.maxStages }, (_, i) =>
      [hashSeed(`${seed}|k${i}`), hashSeed(`k${i}|${seed}`)].map((n) => n.toString(36)).join('-'),
    );
    return { stageSeeds };
  },

  toClientLevel(level, params) {
    return { firstSeed: level.stageSeeds[0], params };
  },

  timingBounds(params) {
    return {
      minMs: 1000,
      maxMs: params.maxStages * (params.stageSeconds * 1350 + 6000) + 60_000,
    };
  },

  interactive: {
    stepSchema,
    check(level, params, index, step: PatangRushStep, previous: PatangRushStep[]) {
      const run = replayKiteRun(level, params, previous);
      if (run.ended) return { feedback: { outcome: 'over', points: run.points }, done: true };
      const outcome = playStage(run, level.stageSeeds[index], step);
      const next = outcome === 'survived' && !run.ended ? level.stageSeeds[index + 1] : undefined;
      return {
        feedback: {
          outcome,
          points: run.points,
          stage: stageNumber(run),
          gates: run.gatesPassed,
          ticks: run.totalTicks,
          death: run.death,
          ...(next ? { nextSeed: next } : {}),
        },
        done: !next,
      };
    },
    toSubmission: (steps: PatangRushStep[]) => ({ stages: steps }),
    stepPlayMs: (step: PatangRushStep, params: PatangRushParams) =>
      Math.round((Math.min(step.ticks, stageTicks(params)) * 1000) / KITE.TPS),
  },

  score(level, submission, _timing, params): ScoreResult {
    const run = replayKiteRun(level, params, submission.stages);
    const reached = run.ended === 'cleared' ? params.startStage + params.maxStages - 1 : stageNumber(run);
    const notes: string[] = [];
    if (run.death) notes.push(`Your kite ${CAUSE[run.death.cause]} in stage ${run.death.stage} after ${fmtTime(run.death.tick)}.`);
    else if (run.ended === 'cleared') notes.push(`You flew through all ${params.maxStages} stages. Sky king.`);
    else if (run.ended === 'quit') notes.push('The run ended when you left the game.');
    return {
      score: run.points,
      // Endless game: no ceiling on the score.
      maxScore: 0,
      breakdown: {
        points: run.points,
        ticks: run.totalTicks,
        stageReached: reached,
        stagesCleared: run.stagesCleared,
        towers: run.gatesPassed,
        stars: run.stars,
        taps: run.taps,
      },
      highlights: [
        { label: 'Towers', value: String(run.gatesPassed) },
        { label: 'Stage', value: String(reached) },
        { label: 'Flight time', value: fmtTime(run.totalTicks) },
      ],
      notes,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Autopilot                                                           */
/* ------------------------------------------------------------------ */

/** Gap offsets (as a share of the gap) the autopilot tries to cruise at. */
const AIM = [-4, 0, 3, 6];

/**
 * How many of the next `horizon` ticks the kite survives if it taps now (or not)
 * and then keeps a simple "tap when below the aim line" rhythm. Runs on a copy
 * of the visible state only, so the bot sees exactly what a player sees.
 */
function survives(run: KiteRun, tapNow: boolean, horizon: number, aim: number): number {
  const p = run.params;
  const speed = scrollSpeed(p, stageNumber(run));
  const r = p.kiteRadius * FP;
  const kx = KITE.KX * FP;
  const ground = KITE.GROUND * FP;
  const g = gravityOf(p);
  const lift = liftOf(p);
  let y = run.y;
  let vy = run.vy;
  const gates = run.gates.map((x) => ({ ...x }));
  const rivals = run.things.filter((x) => x.kind === 'rival').map((x) => ({ ...x }));
  for (let k = 0; k < horizon; k++) {
    const next = gates.find((x) => x.x + x.w >= kx - r);
    const target = next ? next.cy + Math.trunc((next.gap * aim) / 20) : Math.trunc(KITE.H * 0.5) * FP;
    const tap = k === 0 ? tapNow : y > target && vy >= 0;
    if (tap) vy = -lift;
    else vy = Math.min(vy + g, KITE.MAX_FALL * FP);
    y = Math.max(r, y + vy);
    if (y + r >= ground) return k;
    for (const x of gates) {
      x.x -= speed;
      x.age++;
      if (x.amp) x.cy = x.baseY + Math.trunc((x.amp * isin(x.phase + x.rate * x.age)) / 4096);
      const top = x.cy - Math.trunc(x.gap / 2);
      const bottom = x.cy + Math.trunc(x.gap / 2);
      if (hitsBox(kx, y, r, x.x, 0, x.x + x.w, top) || hitsBox(kx, y, r, x.x, bottom, x.x + x.w, ground)) return k;
    }
    for (const x of rivals) {
      x.x -= speed;
      x.age++;
      x.y = x.baseY + Math.trunc((x.amp * isin(x.phase + x.rate * x.age)) / 4096);
      const dx = x.x - kx;
      const dy = x.y - y;
      const reach = x.r + r;
      if (dx * dx + dy * dy < reach * reach) return k;
    }
  }
  return horizon;
}

/**
 * A look-ahead flyer, used by tests and admin tooling to measure how hard a
 * preset is ("a decent bot reaches stage N"). Returns whether to tap this tick.
 */
export function autopilotTap(run: KiteRun, horizon = 60): boolean {
  if (run.hovering && run.stageTick < 30) return false;
  let tapBest = 0;
  let waitBest = 0;
  for (const aim of AIM) {
    tapBest = Math.max(tapBest, survives(run, true, horizon, aim));
    waitBest = Math.max(waitBest, survives(run, false, horizon, aim));
    if (tapBest === horizon && waitBest === horizon) break;
  }
  if (tapBest !== waitBest) return tapBest > waitBest;
  // Both equally safe: follow the rhythm around the middle of the gap.
  const kx = KITE.KX * FP;
  const r = run.params.kiteRadius * FP;
  const next = run.gates.find((x) => x.x + x.w >= kx - r);
  const target = next ? next.cy + Math.trunc(next.gap / 6) : Math.trunc(KITE.H * 0.5) * FP;
  return run.y > target && run.vy >= 0;
}

/** Plays one stage live with the autopilot and returns the recorded step. */
export function autopilotStage(run: KiteRun, seed: string, opts: { horizon?: number; stopAfterTicks?: number } = {}): PatangRushStep {
  beginStage(run, seed);
  const taps: number[] = [];
  const total = stageTicks(run.params);
  let t = 0;
  for (; t < total && run.alive; t++) {
    if (opts.stopAfterTicks !== undefined && t >= opts.stopAfterTicks) return { ticks: t, taps, quit: true };
    const tap = autopilotTap(run, opts.horizon);
    if (tap) taps.push(t);
    tickKite(run, tap);
  }
  if (run.alive) finishStage(run);
  // On a crash at tick t the recording covers ticks 0..t.
  return { ticks: t, taps };
}
