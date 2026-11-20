import type PhaserNS from 'phaser';
import {
  KITE,
  autopilotTap,
  beginStage,
  createKiteRun,
  finishStage,
  scrollSpeed,
  stageNumber,
  stageTicks,
  tickKite,
  type KiteEvent,
  type KiteGate,
  type KiteRun,
  type KiteThing,
  type PatangRushClientLevel,
  type PatangRushStep,
} from '@axia/engine';
import { Sfx, vibrate } from './NeonDodgeScene';
import type { GameServer } from './scenes';
import { FONT, HEIGHT, WIDTH, clearScene, label } from './ui';

type PhaserLib = typeof PhaserNS;

const FP = KITE.FP;
const TICK_MS = 1000 / KITE.TPS;
const MAX_TICKS_PER_FRAME = 8;
/** Dev/test builds only: lets automated browser tests fly the kite with the engine's autopilot. */
const DEV_HOOKS = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === 'true';
const GROUND = KITE.GROUND;

/** Each stage is a stretch of Gurugram. The run loops back to the start after the last one. */
export const PATANG_PLACES: { en: string; hi: string }[] = [
  { en: 'MG Road', hi: 'एमजी रोड' },
  { en: 'IFFCO Chowk', hi: 'इफको चौक' },
  { en: 'Sector 48', hi: 'सेक्टर 48' },
  { en: 'Cyber City', hi: 'साइबर सिटी' },
  { en: 'Golf Course Road', hi: 'गोल्फ कोर्स रोड' },
  { en: 'Sohna Road', hi: 'सोहना रोड' },
  { en: 'Sector 29', hi: 'सेक्टर 29' },
  { en: 'Rajiv Chowk', hi: 'राजीव चौक' },
  { en: 'Sikanderpur', hi: 'सिकंदरपुर' },
  { en: 'Udyog Vihar', hi: 'उद्योग विहार' },
  { en: 'Sector 56', hi: 'सेक्टर 56' },
  { en: 'Golf Course Extension Road', hi: 'गोल्फ कोर्स एक्सटेंशन रोड' },
  { en: 'Dwarka Expressway', hi: 'द्वारका एक्सप्रेसवे' },
  { en: 'Millennium City Centre', hi: 'मिलेनियम सिटी सेंटर' },
  { en: 'Old Gurgaon', hi: 'पुराना गुड़गांव' },
];
export const placeFor = (stage: number) => PATANG_PLACES[(stage - 1) % PATANG_PLACES.length];

/** Daylight over Gurugram: a hazy blue sky, glass towers, a metro line and a busy road. */
const COLORS = {
  skyTop: 0x4f8fcf,
  skyMid: 0x8fbfe6,
  skyLow: 0xdfe9ee,
  sun: 0xfffbea,
  cloud: 0xffffff,
  cloudShade: 0xdfe7ee,
  farCity: 0xb5c4d0,
  midCity: 0x8ea2b4,
  metro: 0xb9bec3,
  metroShade: 0x8f969c,
  footpath: 0xc9c1b3,
  joint: 0xb1a999,
  curbBlack: 0x26282b,
  curbYellow: 0xf0c330,
  asphalt: 0x45484d,
  lane: 0xf2f2f2,
  treeDark: 0x3f7a35,
  treeLight: 0x5c9a46,
  trunk: 0x6b4f35,
  signGreen: 0x1d6b3c,
  beacon: 0xe8343f,
  hazard: 0xf0a020,
  star: 0xf5b800,
  starLight: 0xffe58a,
  string: 0x5a4a3a,
};

/** Facades for the obstacle towers: blue glass, sandstone offices, dark glass. */
const STYLES = [
  { kind: 'glass', light: 0x9cc0dc, base: 0x5f8db3, side: 0x3c6587, line: 0x2f526f, trim: 0x8796a3, lobby: 0x2b3d4d },
  { kind: 'ribbon', light: 0xe4dccd, base: 0xcbbfa9, side: 0xa59780, line: 0x51677a, trim: 0x9d927f, lobby: 0x5a5146 },
  { kind: 'glass', light: 0x6d8094, base: 0x384a5c, side: 0x232f3b, line: 0x18212b, trim: 0x6b747c, lobby: 0x1c252e },
] as const;
type Style = (typeof STYLES)[number];

const PLAYER_KITE = { body: 0xd7263d, moon: 0xffffff, tail: 0xffffff };
const RIVAL_KITE = { body: 0x1f2a44, moon: 0xf2c14e, tail: 0x1f2a44 };

/** Which twist joins at which stage, for the banner. Built from the params. */
function unlockText(level: PatangRushClientLevel, stage: number) {
  const p = level.params;
  if (p.movingFrom > 0 && stage === p.movingFrom) return 'NEW: Sliding gaps — time your gusts';
  if (p.rivalsFrom > 0 && stage === p.rivalsFrom) return 'NEW: Rival kites — don’t get tangled';
  return undefined;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  puffs: { dx: number; dy: number; r: number }[];
}

interface Bird {
  x: number;
  y: number;
  speed: number;
  phase: number;
}

type Phase = 'countdown' | 'playing' | 'waiting' | 'over';

const TEX_W = 1440;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function createPatangRushScene(
  Phaser: PhaserLib,
  level: PatangRushClientLevel,
  onComplete: (submission: { stages: PatangRushStep[] }) => void,
  server: GameServer,
) {
  return class PatangRushScene extends Phaser.Scene {
    private run: KiteRun = createKiteRun(level.params, true);
    private phase: Phase = 'countdown';
    private stepIndex = 0;
    /** Ticks played and taps recorded in the current stage. */
    private ticks = 0;
    private taps: number[] = [];
    private tapQueued = false;
    private acc = 0;
    private scrollPx = 0;
    private g!: PhaserNS.GameObjects.Graphics;
    private fx!: PhaserNS.GameObjects.Graphics;
    private sky!: PhaserNS.GameObjects.Graphics;
    private signG!: PhaserNS.GameObjects.Graphics;
    private far!: PhaserNS.GameObjects.TileSprite;
    private mid!: PhaserNS.GameObjects.TileSprite;
    private street!: PhaserNS.GameObjects.TileSprite;
    private signHi!: PhaserNS.GameObjects.Text;
    private signEn!: PhaserNS.GameObjects.Text;
    private sign = { x: 0 };
    private scoreText!: PhaserNS.GameObjects.Text;
    private stageText!: PhaserNS.GameObjects.Text;
    private hintText!: PhaserNS.GameObjects.Text;
    private muteText!: PhaserNS.GameObjects.Text;
    private particles: Particle[] = [];
    private clouds: Cloud[] = [];
    private birds: Bird[] = [];
    private sfx = new Sfx();
    /** Visual-only fall of the kite after a crash. */
    private wreck: { y: number; vy: number; spin: number } | null = null;
    private onHidden = () => {
      if (document.hidden && (this.phase === 'playing' || this.phase === 'countdown')) void this.endRun(true);
    };

    constructor() {
      super('patang-rush');
    }

    create() {
      clearScene(this);
      this.paintSky();
      this.sky = this.add.graphics().setDepth(1);
      this.makeTextures();
      this.far = this.add.tileSprite(0, GROUND - 380, WIDTH, 380, 'pr-far').setOrigin(0, 0).setDepth(2);
      this.mid = this.add.tileSprite(0, GROUND - 300, WIDTH, 300, 'pr-mid').setOrigin(0, 0).setDepth(4);
      this.signG = this.add.graphics().setDepth(4.5);
      this.signHi = label(this, 0, 0, '', 20, { fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(4.6);
      this.signEn = label(this, 0, 0, '', 24, { fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(4.6);
      this.g = this.add.graphics().setDepth(5);
      this.street = this.add.tileSprite(0, GROUND - 60, WIDTH, HEIGHT - GROUND + 60, 'pr-street').setOrigin(0, 0).setDepth(6);
      this.fx = this.add.graphics().setDepth(7);

      const textStyle = { fontStyle: 'bold', stroke: '#1b2a3a', strokeThickness: 7 };
      this.scoreText = label(this, WIDTH / 2, 20, '0', 64, textStyle).setOrigin(0.5, 0).setDepth(10);
      this.stageText = label(this, WIDTH / 2, 98, '', 22, { ...textStyle, strokeThickness: 5 }).setOrigin(0.5, 0).setDepth(10);
      this.hintText = label(this, WIDTH / 2, HEIGHT * 0.58, '', 30, textStyle).setOrigin(0.5).setDepth(10);
      this.muteText = label(this, WIDTH - 24, 24, this.sfx.muted ? '🔇' : '🔊', 30).setOrigin(1, 0).setDepth(11);
      this.muteText.setInteractive({ useHandCursor: true }).on('pointerdown', (_p: unknown, _x: number, _y: number, ev: { stopPropagation(): void }) => {
        ev.stopPropagation();
        this.sfx.toggle();
        this.muteText.setText(this.sfx.muted ? '🔇' : '🔊');
      });

      for (let i = 0; i < 5; i++) {
        const puffs = Array.from({ length: 6 }, (_, k) => ({ dx: k * 22 - 55 + rand(-6, 6), dy: rand(-14, 4), r: rand(16, 30) }));
        this.clouds.push({ x: rand(0, WIDTH + 300), y: rand(170, 420), speed: rand(0.08, 0.2), puffs });
      }
      for (let i = 0; i < 4; i++) this.birds.push({ x: rand(0, WIDTH), y: rand(160, 460), speed: rand(0.5, 1.1), phase: rand(0, 6) });

      this.input.on('pointerdown', (p: PhaserNS.Input.Pointer) => {
        this.sfx.unlock();
        if (p.y < 90 && p.x > WIDTH - 90) return;
        this.queueTap();
      });
      const kb = this.input.keyboard;
      if (kb) {
        for (const k of ['SPACE', 'UP', 'W']) {
          kb.addKey(k, true).on('down', () => {
            this.sfx.unlock();
            this.queueTap();
          });
        }
      }
      document.addEventListener('visibilitychange', this.onHidden);
      this.events.once('shutdown', () => document.removeEventListener('visibilitychange', this.onHidden));
      this.events.once('destroy', () => document.removeEventListener('visibilitychange', this.onHidden));

      beginStage(this.run, level.firstSeed);
      this.showSign(stageNumber(this.run), WIDTH * 0.55);
      if (DEV_HOOKS) (window as unknown as { __patangRush?: unknown }).__patangRush = { scene: this, autopilot: false };
      this.hud();
      this.countdown();
    }

    private queueTap() {
      if (this.phase === 'playing') this.tapQueued = true;
    }

    /* ---------------------------------------------------------------- */
    /* Backdrop                                                          */
    /* ---------------------------------------------------------------- */

    private paintSky() {
      const bg = this.add.graphics().setDepth(0);
      bg.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyMid, COLORS.skyMid, 1).fillRect(0, 0, WIDTH, 420);
      bg.fillGradientStyle(COLORS.skyMid, COLORS.skyMid, COLORS.skyLow, COLORS.skyLow, 1).fillRect(0, 420, WIDTH, GROUND - 420);
      // The sun, softened by city haze.
      for (let r = 160; r > 44; r -= 8) bg.fillStyle(COLORS.sun, 0.035).fillCircle(575, 175, r);
      bg.fillStyle(COLORS.sun, 1).fillCircle(575, 175, 42);
    }

    /** Paints the tiling skyline, metro and street layers once. */
    private makeTextures() {
      const make = (key: string, w: number, h: number, paint: (g: PhaserNS.GameObjects.Graphics) => void) => {
        if (this.textures.exists(key)) return;
        const g = this.make.graphics({}, false);
        paint(g);
        g.generateTexture(key, w, h);
        g.destroy();
      };
      // Draws a shape at x and, if it crosses the right edge, again at x - TEX_W so the layer tiles seamlessly.
      const wrap = (x: number, w: number, draw: (x: number) => void) => {
        draw(x);
        if (x + w > TEX_W) draw(x - TEX_W);
      };

      make('pr-far', TEX_W, 380, (g) => {
        let x = 0;
        while (x < TEX_W) {
          const w = rand(42, 96);
          const h = rand(120, 360);
          const spire = Math.random() < 0.3;
          const stepped = Math.random() < 0.3;
          wrap(x, w, (bx) => {
            g.fillStyle(COLORS.farCity, 1).fillRect(bx, 380 - h, w, h);
            g.fillStyle(0xffffff, 0.12).fillRect(bx + w * 0.15, 380 - h, w * 0.12, h);
            if (stepped) g.fillStyle(COLORS.farCity, 1).fillRect(bx + w * 0.2, 380 - h - 26, w * 0.6, 26);
            if (spire) g.fillStyle(COLORS.farCity, 1).fillRect(bx + w / 2 - 1.5, 380 - h - 46, 3, 46);
          });
          x += w + rand(2, 18);
        }
      });

      make('pr-mid', TEX_W, 300, (g) => {
        let x = 0;
        while (x < TEX_W) {
          const w = rand(50, 110);
          const h = rand(70, 230);
          wrap(x, w, (bx) => {
            g.fillStyle(COLORS.midCity, 1).fillRect(bx, 300 - h, w, h);
            g.fillStyle(0xffffff, 0.18);
            for (let y = 300 - h + 10; y < 290; y += 14) {
              for (let wx = bx + 6; wx < bx + w - 8; wx += 10) g.fillRect(wx, y, 5, 7);
            }
          });
          x += w + rand(6, 30);
        }
        // Rapid Metro: an elevated viaduct on round pillars.
        const deck = 300 - 150;
        g.fillStyle(COLORS.metro, 1).fillRect(0, deck, TEX_W, 16);
        g.fillStyle(COLORS.metroShade, 1).fillRect(0, deck + 16, TEX_W, 5);
        g.fillStyle(COLORS.metroShade, 1).fillRect(0, deck - 4, TEX_W, 4);
        for (let px = 40; px < TEX_W; px += 160) {
          g.fillStyle(COLORS.metro, 1).fillRect(px, deck + 21, 16, 150 - 21);
          g.fillStyle(COLORS.metroShade, 1).fillRect(px + 11, deck + 21, 5, 150 - 21);
          g.fillStyle(COLORS.metroShade, 1).fillRect(px - 10, deck + 21, 36, 6);
        }
      });

      make('pr-street', TEX_W, HEIGHT - GROUND + 60, (g) => {
        const top = 60;
        // Footpath with paver joints, a black-and-yellow kerb, then the road.
        g.fillStyle(COLORS.footpath, 1).fillRect(0, top, TEX_W, 22);
        g.lineStyle(1, COLORS.joint, 1);
        for (let x = 0; x < TEX_W; x += 24) g.lineBetween(x, top, x, top + 22);
        g.lineBetween(0, top + 11, TEX_W, top + 11);
        for (let x = 0; x < TEX_W; x += 40) {
          g.fillStyle(COLORS.curbBlack, 1).fillRect(x, top + 22, 20, 7);
          g.fillStyle(COLORS.curbYellow, 1).fillRect(x + 20, top + 22, 20, 7);
        }
        g.fillStyle(COLORS.asphalt, 1).fillRect(0, top + 29, TEX_W, HEIGHT - GROUND - 29);
        g.fillStyle(COLORS.lane, 0.85);
        for (let x = 0; x < TEX_W; x += 80) g.fillRect(x, top + 58, 40, 4);
        // Street trees and lamp posts along the footpath.
        for (let x = 70; x < TEX_W; x += 240) {
          const tx = x + rand(-30, 30);
          g.fillStyle(COLORS.trunk, 1).fillRect(tx - 3, top - 18, 6, 30);
          for (const [dx, dy, r, c] of [
            [-12, -22, 15, COLORS.treeDark],
            [12, -22, 15, COLORS.treeDark],
            [0, -34, 17, COLORS.treeLight],
            [-6, -26, 13, COLORS.treeLight],
          ] as const) {
            g.fillStyle(c, 1).fillCircle(tx + dx, top + dy, r);
          }
        }
        for (let x = 190; x < TEX_W; x += 480) {
          g.fillStyle(0x6c737a, 1).fillRect(x, top - 52, 3, 64);
          g.fillRect(x, top - 52, 18, 3);
          g.fillStyle(0xfff3c4, 1).fillRect(x + 14, top - 50, 6, 3);
        }
      });
    }

    /** A green Indian road sign naming the stretch of Gurugram the kite is over. */
    private showSign(stage: number, x = WIDTH + 30) {
      const place = placeFor(stage);
      this.signHi.setText(place.hi);
      this.signEn.setText(place.en.toUpperCase());
      this.sign.x = x;
    }

    private drawSign() {
      const s = this.signG;
      s.clear();
      const w = Math.max(this.signHi.width, this.signEn.width) + 44;
      const h = 74;
      const x = this.sign.x;
      const y = GROUND - 240;
      const visible = x - w / 2 < WIDTH && x + w / 2 > 0;
      this.signHi.setVisible(visible);
      this.signEn.setVisible(visible);
      if (!visible) return;
      s.fillStyle(0x7d858c, 1).fillRect(x - w / 2 + 14, y + h, 6, GROUND - y - h);
      s.fillRect(x + w / 2 - 20, y + h, 6, GROUND - y - h);
      s.fillStyle(COLORS.signGreen, 1).fillRoundedRect(x - w / 2, y, w, h, 6);
      s.lineStyle(3, 0xffffff, 1).strokeRoundedRect(x - w / 2 + 5, y + 5, w - 10, h - 10, 4);
      this.signHi.setPosition(x, y + 24);
      this.signEn.setPosition(x, y + 52);
    }

    private drawSkyLife(delta: number) {
      const s = this.sky;
      s.clear();
      const k = delta / 16.67;
      const span = WIDTH + 300;
      for (const c of this.clouds) {
        c.x -= c.speed * k;
        const x = ((((c.x - this.scrollPx * 0.05) % span) + span) % span) - 150;
        for (const p of c.puffs) s.fillStyle(COLORS.cloudShade, 0.9).fillCircle(x + p.dx, c.y + p.dy + 6, p.r);
        for (const p of c.puffs) s.fillStyle(COLORS.cloud, 0.95).fillCircle(x + p.dx, c.y + p.dy, p.r * 0.92);
      }
      s.lineStyle(2, 0x2b3440, 0.7);
      for (const b of this.birds) {
        b.x -= b.speed * k;
        b.phase += 0.18 * k;
        if (b.x < -20) {
          b.x = WIDTH + rand(20, 200);
          b.y = rand(160, 460);
        }
        const wing = 4 + Math.sin(b.phase) * 4;
        s.lineBetween(b.x - 7, b.y - wing, b.x, b.y);
        s.lineBetween(b.x, b.y, b.x + 7, b.y - wing);
      }
    }

    /* ---------------------------------------------------------------- */
    /* Flow                                                              */
    /* ---------------------------------------------------------------- */

    private countdown() {
      this.phase = 'countdown';
      const stage = stageNumber(this.run);
      this.banner(placeFor(stage).en.toUpperCase(), `Stage ${stage} · Tap (or Space) for a gust of wind`);
      const n = label(this, WIDTH / 2, HEIGHT / 2 + 40, '3', 120, { fontStyle: 'bold', stroke: '#1b2a3a', strokeThickness: 10 }).setOrigin(0.5).setDepth(12);
      let left = 3;
      // A short count: retries should feel instant.
      this.time.addEvent({
        delay: 450,
        repeat: 2,
        callback: () => {
          left--;
          if (left > 0) {
            n.setText(String(left));
            this.sfx.tone(440, 120, 'triangle', 0.04);
          } else {
            n.destroy();
            this.sfx.tone(880, 180, 'triangle', 0.05);
            this.phase = 'playing';
            this.acc = 0;
          }
        },
      });
    }

    private banner(title: string, sub?: string, color = '#ffffff') {
      const t = label(this, WIDTH / 2, HEIGHT / 2 - 150, title, 58, { fontStyle: 'bold', color, stroke: '#1b2a3a', strokeThickness: 9, align: 'center', wordWrap: { width: WIDTH - 60 } })
        .setOrigin(0.5)
        .setDepth(12);
      const s = sub
        ? label(this, WIDTH / 2, HEIGHT / 2 - 82, sub, 24, { fontStyle: 'bold', color: '#ffe58a', stroke: '#1b2a3a', strokeThickness: 6, align: 'center', wordWrap: { width: WIDTH - 60 } })
            .setOrigin(0.5)
            .setDepth(12)
        : null;
      t.setScale(0.6);
      this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [t, s].filter(Boolean), alpha: 0, delay: 1500, duration: 400, onComplete: () => [t, s].forEach((o) => o?.destroy()) });
    }

    update(_time: number, delta: number) {
      if (this.phase === 'playing') {
        this.acc += Math.min(delta, 250);
        let n = 0;
        while (this.acc >= TICK_MS && n < MAX_TICKS_PER_FRAME && this.phase === 'playing') {
          this.acc -= TICK_MS;
          n++;
          this.tickOnce();
        }
        if (n === MAX_TICKS_PER_FRAME) this.acc = 0;
      }
      if (this.wreck) {
        const k = delta / 16.67;
        this.wreck.vy += 0.6 * k;
        this.wreck.y = Math.min(GROUND - 10, this.wreck.y + this.wreck.vy * k);
        this.wreck.spin += 0.12 * k;
      }
      this.updateParticles(delta);
      this.drawSkyLife(delta);
      this.draw();
    }

    private tickOnce() {
      let tap = this.tapQueued;
      this.tapQueued = false;
      if (DEV_HOOKS && (window as unknown as { __patangRush?: { autopilot: boolean } }).__patangRush?.autopilot) tap = autopilotTap(this.run);
      if (tap) this.taps.push(this.ticks);
      this.ticks++;
      const wasAlive = this.run.alive;
      tickKite(this.run, tap);
      if (wasAlive) {
        const px = scrollSpeed(level.params, stageNumber(this.run)) / FP;
        this.scrollPx += px;
        this.sign.x -= px * 0.7;
      }
      for (const e of this.run.events) this.onEvent(e);
      if (!this.run.alive) {
        void this.endRun(false);
      } else if (this.run.stageTick >= stageTicks(level.params)) {
        void this.stageCleared();
      }
      this.hud();
    }

    private onEvent(e: KiteEvent) {
      if (e.type === 'flap') {
        this.sfx.tone(520, 90, 'sine', 0.035, 760);
        for (let i = 0; i < 4; i++) {
          this.particles.push({ x: KITE.KX - 26, y: this.run.y / FP + 20, vx: -2 - Math.random() * 2, vy: 1 + Math.random() * 2, life: 260, max: 260, color: 0xffffff, size: 2 + Math.random() * 2 });
        }
      } else if (e.type === 'gate') {
        this.sfx.tone(988, 70, 'square', 0.025);
        this.scoreText.setScale(1.18);
        this.tweens.add({ targets: this.scoreText, scale: 1, duration: 160 });
      } else if (e.type === 'star') {
        this.burst(e.x / FP, e.y / FP, COLORS.star, 18, 5);
        this.popup(e.x / FP, e.y / FP - 24, `+${e.points}`, '#ffe58a', 32);
        this.sfx.tone(1175, 90, 'sine', 0.05);
        this.time.delayedCall(80, () => this.sfx.tone(1568, 140, 'sine', 0.05));
        vibrate(15);
      } else if (e.type === 'death') {
        this.burst(KITE.KX, e.y / FP, PLAYER_KITE.body, 40, 7);
        this.burst(KITE.KX, e.y / FP, 0xffffff, 16, 4);
        this.cameras.main.shake(320, 0.016);
        this.cameras.main.flash(180, 255, 255, 255);
        this.sfx.tone(300, 550, 'sawtooth', 0.07, 50);
        vibrate([80, 40, 160]);
        this.wreck = { y: e.y / FP, vy: -4, spin: 0 };
      }
    }

    private async stageCleared() {
      this.phase = 'waiting';
      const step: PatangRushStep = { ticks: this.ticks, taps: this.taps };
      finishStage(this.run);
      this.ticks = 0;
      this.taps = [];
      this.sfx.tone(523, 120, 'triangle', 0.05);
      this.time.delayedCall(120, () => this.sfx.tone(784, 160, 'triangle', 0.05));
      const next = stageNumber(this.run);
      if (this.run.ended === 'cleared') {
        this.banner('ALL OF GURUGRAM', 'Sky king.', '#ffe58a');
      } else {
        this.banner(`${placeFor(next).en.toUpperCase()}`, unlockText(level, next) ?? `Stage ${next} · bonus +${20 * (next - 1)}`);
        this.showSign(next);
      }
      this.hud();
      let verdict: Record<string, unknown>;
      try {
        [verdict] = await Promise.all([server.step(this.stepIndex++, step), new Promise((r) => setTimeout(r, 1300))]);
      } catch {
        return this.finish('Connection lost — your run so far still counts.');
      }
      if (verdict.outcome !== 'survived' || typeof verdict.nextSeed !== 'string') {
        return this.finish(this.run.ended === 'cleared' ? undefined : 'Run over.');
      }
      beginStage(this.run, verdict.nextSeed);
      this.acc = 0;
      this.tapQueued = false;
      this.phase = 'playing';
    }

    private async endRun(quit: boolean) {
      if (this.phase === 'over') return;
      const wasPlaying = this.phase === 'playing' || this.phase === 'countdown';
      this.phase = 'over';
      if (!wasPlaying) return;
      const step: PatangRushStep = { ticks: Math.max(1, this.ticks), taps: this.taps, ...(quit ? { quit: true } : {}) };
      try {
        await server.step(this.stepIndex++, step);
      } catch {
        // The stages already judged still count.
      }
      this.time.delayedCall(quit ? 0 : 1300, () => this.finish());
    }

    private finish(message?: string) {
      this.phase = 'over';
      if (message) label(this, WIDTH / 2, HEIGHT / 2, message, 28, { align: 'center', stroke: '#1b2a3a', strokeThickness: 6 }).setOrigin(0.5).setDepth(12);
      this.time.delayedCall(message ? 900 : 0, () => onComplete({ stages: [] }));
    }

    private hud() {
      this.scoreText.setText(this.run.points.toLocaleString('en-IN'));
      const left = Math.max(0, Math.ceil((stageTicks(level.params) - this.run.stageTick) / KITE.TPS));
      this.stageText.setText(`📍 ${placeFor(stageNumber(this.run)).en} · ${left}s · 🏢 ${this.run.gatesPassed}`);
      this.hintText.setText(this.phase === 'playing' && this.run.hovering && this.run.alive ? 'TAP TO FLY' : '');
    }

    private popup(x: number, y: number, text: string, color: string, size = 24) {
      const t = this.add
        .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#1b2a3a', strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(9);
      this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 700, onComplete: () => t.destroy() });
    }

    private burst(x: number, y: number, color: number, count: number, speed: number) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random());
        const max = 300 + Math.random() * 400;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, color, size: 2 + Math.random() * 3 });
      }
    }

    private updateParticles(delta: number) {
      const k = delta / 16.67;
      this.particles = this.particles.filter((p) => {
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= delta;
        return p.life > 0;
      });
    }

    /* ---------------------------------------------------------------- */
    /* Drawing                                                           */
    /* ---------------------------------------------------------------- */

    private draw() {
      const g = this.g;
      g.clear();
      this.fx.clear();
      this.far.tilePositionX = this.scrollPx * 0.15;
      this.mid.tilePositionX = this.scrollPx * 0.4;
      this.street.tilePositionX = this.scrollPx;
      this.drawSign();
      const run = this.run;
      const pulse = (Date.now() % 900) / 900;

      for (const gate of run.gates) this.drawGate(gate, pulse);
      for (const th of run.things) this.drawThing(th, pulse);

      if (run.alive) {
        const y = run.y / FP;
        // Tilt with the vertical speed: nose up on a gust, nose down when sinking.
        const tilt = Math.max(-0.4, Math.min(0.5, run.vy / FP / 24)) + (run.hovering ? Math.sin(pulse * Math.PI * 2) * 0.06 : 0);
        this.drawKite(KITE.KX, y, tilt, PLAYER_KITE, true);
      } else if (this.wreck) {
        this.drawKite(KITE.KX - 10, this.wreck.y, 0.8 + this.wreck.spin, PLAYER_KITE, false);
      }

      for (const p of this.particles) {
        this.fx.fillStyle(p.color, Math.max(0, p.life / p.max)).fillCircle(p.x, p.y, p.size);
      }
    }

    /** One block of a tower between y0 and y1: a lit face, a shaded side and its windows. */
    private drawFacade(x: number, w: number, y0: number, y1: number, style: Style) {
      const g = this.g;
      if (y1 <= y0) return;
      const side = 14;
      const face = w - side;
      g.fillGradientStyle(style.light, style.base, style.light, style.base, 1).fillRect(x, y0, face, y1 - y0);
      g.fillStyle(style.side, 1).fillRect(x + face, y0, side, y1 - y0);
      if (style.kind === 'glass') {
        g.lineStyle(1, style.line, 0.55);
        for (let y = Math.ceil(y0 / 22) * 22; y < y1; y += 22) g.lineBetween(x, y, x + w, y);
        for (let cx = x + 18; cx < x + face; cx += 18) g.lineBetween(cx, y0, cx, y1);
        // Sky reflections on the glass.
        g.fillStyle(0xffffff, 0.14).fillRect(x + face * 0.18, y0, face * 0.12, y1 - y0);
        g.fillStyle(0xffffff, 0.07).fillRect(x + face * 0.36, y0, face * 0.05, y1 - y0);
      } else {
        // Sandstone office: ribbon windows on every floor.
        for (let y = Math.ceil(y0 / 26) * 26; y + 20 < y1; y += 26) {
          g.fillStyle(style.line, 1).fillRect(x + 6, y + 6, face - 12, 14);
          g.fillStyle(0xffffff, 0.22).fillRect(x + 6, y + 6, face - 12, 3);
          g.fillStyle(0x000000, 0.12).fillRect(x + face, y + 6, side, 14);
        }
      }
      // Lobby at street level.
      if (y1 >= GROUND) {
        g.fillStyle(style.lobby, 1).fillRect(x, GROUND - 32, face, 32);
        g.fillStyle(0xffffff, 0.25).fillRect(x + face / 2 - 12, GROUND - 26, 24, 26);
      }
    }

    private drawGate(gate: KiteGate, pulse: number) {
      const g = this.g;
      const x = gate.x / FP;
      const w = gate.w / FP;
      if (x > WIDTH || x + w < 0) return;
      const top = (gate.cy - gate.gap / 2) / FP;
      const bottom = (gate.cy + gate.gap / 2) / FP;
      const style = STYLES[gate.id % STYLES.length];
      // The upper block runs off the top of the screen; the kite flies through the open sky-lobby floor.
      this.drawFacade(x, w, 0, top, style);
      this.drawFacade(x, w, bottom, GROUND, style);
      if (top > 0) {
        g.fillStyle(style.trim, 1).fillRect(x - 5, top - 12, w + 10, 12);
        g.fillStyle(0x000000, 0.15).fillRect(x - 5, top - 3, w + 10, 3);
      }
      // Roof parapet with aviation lights at the corners.
      g.fillStyle(style.trim, 1).fillRect(x - 4, bottom, w + 8, 9);
      g.fillStyle(0xffffff, 0.3).fillRect(x - 4, bottom, w + 8, 2);
      const on = pulse < 0.5;
      g.fillStyle(COLORS.beacon, on ? 1 : 0.35).fillCircle(x + 2, bottom + 4, 3).fillCircle(x + w - 2, bottom + 4, 3);
      if (gate.amp) {
        // Sliding gaps carry amber warning stripes, like a moving construction platform.
        for (let sx = x - 4; sx < x + w + 4; sx += 16) {
          g.fillStyle(COLORS.hazard, 1).fillRect(sx, bottom + 2, 8, 5);
          if (top > 0) g.fillRect(sx, top - 9, 8, 5);
        }
      }
    }

    private drawThing(th: KiteThing, pulse: number) {
      const x = th.x / FP;
      const y = th.y / FP;
      if (x < -60 || x > WIDTH + 60) return;
      if (th.kind === 'star') {
        const r = 15 + Math.sin(pulse * Math.PI * 2) * 1.5;
        this.g.fillStyle(COLORS.starLight, 0.35).fillCircle(x, y, r * 1.8);
        const star = (rr: number) => {
          const pts: PhaserNS.Math.Vector2[] = [];
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const d = i % 2 === 0 ? rr : rr * 0.45;
            pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * d, y + Math.sin(a) * d));
          }
          return pts;
        };
        this.g.fillStyle(COLORS.star, 1).fillPoints(star(r), true);
        this.g.fillStyle(COLORS.starLight, 1).fillPoints(star(r * 0.5), true);
        return;
      }
      this.g.fillStyle(COLORS.beacon, 0.12).fillCircle(x, y, 34);
      this.drawKite(x, y, Math.sin(pulse * Math.PI * 2 + th.id) * 0.2, RIVAL_KITE, false);
    }

    /** An Indian patang: a diamond sail with a moon disc, a bamboo spine and bow, and a small tail. */
    private drawKite(x: number, y: number, tilt: number, look: { body: number; moon: number; tail: number }, withString: boolean) {
      const g = this.g;
      const s = 28;
      const c = Math.cos(tilt);
      const sn = Math.sin(tilt);
      const rot = (px: number, py: number) => new Phaser.Math.Vector2(x + px * c - py * sn, y + px * sn + py * c);
      const topP = rot(0, -s * 1.05);
      const right = rot(s * 0.95, 0);
      const bottomP = rot(0, s * 1.05);
      const left = rot(-s * 0.95, 0);
      if (withString) {
        const tie = rot(0, s * 0.2);
        g.lineStyle(1.2, COLORS.string, 0.6).lineBetween(tie.x, tie.y, x - 300, HEIGHT + 40);
      }
      // Tail.
      const t1 = rot(-s * 0.28, s * 1.42);
      const t2 = rot(s * 0.28, s * 1.42);
      g.fillStyle(look.tail, 1).fillTriangle(bottomP.x, bottomP.y, t1.x, t1.y, t2.x, t2.y);
      g.lineStyle(1, 0x000000, 0.25).strokeTriangle(bottomP.x, bottomP.y, t1.x, t1.y, t2.x, t2.y);
      // Sail, shaded on one side to show its curve.
      g.fillStyle(look.body, 1).fillPoints([topP, right, bottomP, left], true);
      const moon = rot(0, -s * 0.05);
      g.fillStyle(look.moon, 1).fillCircle(moon.x, moon.y, s * 0.36);
      g.fillStyle(0x000000, 0.14).fillTriangle(topP.x, topP.y, right.x, right.y, bottomP.x, bottomP.y);
      // Bamboo spine and bow.
      g.lineStyle(2, 0x6b4a26, 0.85).lineBetween(topP.x, topP.y, bottomP.x, bottomP.y);
      const bow: PhaserNS.Math.Vector2[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = -1 + i / 4;
        bow.push(rot(t * s * 0.95, -s * 0.32 * (1 - t * t)));
      }
      g.strokePoints(bow, false);
      g.lineStyle(1, 0x000000, 0.3).strokePoints([topP, right, bottomP, left], true);
    }
  };
}
