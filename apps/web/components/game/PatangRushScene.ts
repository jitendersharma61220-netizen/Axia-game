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
import { C, FONT, HEIGHT, WIDTH, clearScene, label } from './ui';

type PhaserLib = typeof PhaserNS;

const FP = KITE.FP;
const TICK_MS = 1000 / KITE.TPS;
const MAX_TICKS_PER_FRAME = 8;
/** Dev/test builds only: lets automated browser tests fly the kite with the engine's autopilot. */
const DEV_HOOKS = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === 'true';

const COLORS = {
  skyTop: 0x0b0a2a,
  skyBottom: 0x3a1c4d,
  haze: 0xff7a59,
  farCity: 0x1b1840,
  tower: 0x15193a,
  towerEdge: 0x2b3170,
  window: 0xffd27a,
  windowOff: 0x262b55,
  beacon: 0xff3b5c,
  street: 0x0d0f22,
  streetLine: 0xffc857,
  kite: 0xff6b1a,
  kiteAlt: 0xffd23f,
  kiteSpar: 0x6b2d0a,
  string: 0xf5e6c8,
  rival: 0x22d3ee,
  rivalAlt: 0x7c5cff,
  star: 0xffe066,
};

/** Which twist joins at which stage, for the "NEW:" banner. Built from the params. */
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

interface FarBuilding {
  x: number;
  w: number;
  h: number;
}

type Phase = 'countdown' | 'playing' | 'waiting' | 'over';

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
    private glow!: PhaserNS.GameObjects.Graphics;
    private far!: PhaserNS.GameObjects.Graphics;
    private scoreText!: PhaserNS.GameObjects.Text;
    private stageText!: PhaserNS.GameObjects.Text;
    private hintText!: PhaserNS.GameObjects.Text;
    private muteText!: PhaserNS.GameObjects.Text;
    private particles: Particle[] = [];
    private farCity: FarBuilding[] = [];
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
      this.drawSky();
      this.far = this.add.graphics();
      this.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.g = this.add.graphics();
      this.scoreText = label(this, WIDTH / 2, 22, '0', 64, { fontStyle: 'bold', stroke: '#0b0a2a', strokeThickness: 8 }).setOrigin(0.5, 0).setDepth(10);
      this.stageText = label(this, WIDTH / 2, 100, '', 22, { color: C.muted, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(10);
      this.hintText = label(this, WIDTH / 2, HEIGHT * 0.58, '', 28, { fontStyle: 'bold', color: '#ffd27a' }).setOrigin(0.5).setDepth(10);
      this.muteText = label(this, WIDTH - 24, 24, this.sfx.muted ? '🔇' : '🔊', 30).setOrigin(1, 0).setDepth(11);
      this.muteText.setInteractive({ useHandCursor: true }).on('pointerdown', (_p: unknown, _x: number, _y: number, ev: { stopPropagation(): void }) => {
        ev.stopPropagation();
        this.sfx.toggle();
        this.muteText.setText(this.sfx.muted ? '🔇' : '🔊');
      });

      let x = 0;
      while (x < WIDTH + 200) {
        const w = 40 + Math.random() * 70;
        this.farCity.push({ x, w, h: 90 + Math.random() * 230 });
        x += w + Math.random() * 14;
      }

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
      if (DEV_HOOKS) (window as unknown as { __patangRush?: unknown }).__patangRush = { scene: this, autopilot: false };
      this.hud();
      this.countdown();
    }

    private queueTap() {
      if (this.phase === 'playing') this.tapQueued = true;
    }

    private drawSky() {
      const bg = this.add.graphics();
      bg.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyBottom, COLORS.skyBottom, 1).fillRect(0, 0, WIDTH, KITE.GROUND);
      // A warm city glow along the horizon.
      bg.fillGradientStyle(COLORS.haze, COLORS.haze, COLORS.haze, COLORS.haze, 0, 0, 0.22, 0.22).fillRect(0, KITE.GROUND - 260, WIDTH, 260);
      for (let i = 0; i < 70; i++) {
        bg.fillStyle(0xffffff, 0.2 + Math.random() * 0.6).fillCircle(Math.random() * WIDTH, Math.random() * (KITE.GROUND - 380), Math.random() < 0.15 ? 1.8 : 1);
      }
      // The moon.
      bg.fillStyle(0xfff4d6, 0.08).fillCircle(560, 170, 90);
      bg.fillStyle(0xfff4d6, 0.9).fillCircle(560, 170, 46);
      bg.fillStyle(COLORS.skyTop, 0.9).fillCircle(578, 158, 40);
    }

    private countdown() {
      this.phase = 'countdown';
      this.banner(`STAGE ${stageNumber(this.run)}`, 'Tap (or Space) for a gust of wind');
      const n = label(this, WIDTH / 2, HEIGHT / 2 + 40, '3', 120, { fontStyle: 'bold' }).setOrigin(0.5).setDepth(12);
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

    private banner(title: string, sub?: string, color = '#e8ecff') {
      const t = label(this, WIDTH / 2, HEIGHT / 2 - 150, title, 60, { fontStyle: 'bold', color, stroke: '#0b0a2a', strokeThickness: 8 }).setOrigin(0.5).setDepth(12);
      const s = sub ? label(this, WIDTH / 2, HEIGHT / 2 - 90, sub, 24, { color: '#ffd27a', stroke: '#0b0a2a', strokeThickness: 5 }).setOrigin(0.5).setDepth(12) : null;
      t.setScale(0.6);
      this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [t, s].filter(Boolean), alpha: 0, delay: 1400, duration: 400, onComplete: () => [t, s].forEach((o) => o?.destroy()) });
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
        this.wreck.y = Math.min(KITE.GROUND - 10, this.wreck.y + this.wreck.vy * k);
        this.wreck.spin += 0.12 * k;
      }
      this.updateParticles(delta);
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
      if (wasAlive) this.scrollPx += scrollSpeed(level.params, stageNumber(this.run)) / FP;
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
        this.popup(e.x / FP, e.y / FP - 24, `+${e.points}`, '#ffe066', 32);
        this.sfx.tone(1175, 90, 'sine', 0.05);
        this.time.delayedCall(80, () => this.sfx.tone(1568, 140, 'sine', 0.05));
        vibrate(15);
      } else if (e.type === 'death') {
        this.burst(KITE.KX, e.y / FP, COLORS.kite, 40, 7);
        this.burst(KITE.KX, e.y / FP, 0xffffff, 16, 4);
        this.cameras.main.shake(320, 0.016);
        this.cameras.main.flash(180, 255, 90, 60);
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
      if (this.run.ended === 'cleared') this.banner('ALL STAGES CLEARED', 'Sky king.', '#ffd27a');
      else this.banner(`STAGE ${next}`, unlockText(level, next) ?? `Stage bonus +${20 * (next - 1)}`);
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
      if (message) label(this, WIDTH / 2, HEIGHT / 2, message, 28, { align: 'center' }).setOrigin(0.5).setDepth(12);
      this.time.delayedCall(message ? 900 : 0, () => onComplete({ stages: [] }));
    }

    private hud() {
      this.scoreText.setText(this.run.points.toLocaleString('en-IN'));
      const left = Math.max(0, Math.ceil((stageTicks(level.params) - this.run.stageTick) / KITE.TPS));
      this.stageText.setText(`STAGE ${stageNumber(this.run)} · ${left}s · 🏢 ${this.run.gatesPassed}`);
      this.hintText.setText(this.phase === 'playing' && this.run.hovering && this.run.alive ? 'TAP TO FLY' : '');
    }

    private popup(x: number, y: number, text: string, color: string, size = 24) {
      const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(9);
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

    private draw() {
      const g = this.g;
      const glow = this.glow;
      g.clear();
      glow.clear();
      this.drawFarCity();
      const run = this.run;
      const pulse = (Date.now() % 900) / 900;

      for (const gate of run.gates) this.drawGate(gate);
      for (const th of run.things) this.drawThing(th, pulse);
      this.drawStreet();

      if (run.alive) {
        const y = run.y / FP;
        // Tilt with the vertical speed: nose up on a gust, nose down when sinking.
        const tilt = Math.max(-0.45, Math.min(0.6, run.vy / FP / 22)) + (run.hovering ? Math.sin(pulse * Math.PI * 2) * 0.08 : 0);
        this.drawKite(KITE.KX, y, tilt, COLORS.kite, COLORS.kiteAlt, true);
      } else if (this.wreck) {
        this.drawKite(KITE.KX - 10, this.wreck.y, 0.8 + this.wreck.spin, COLORS.kite, COLORS.kiteAlt, false);
      }

      for (const p of this.particles) {
        glow.fillStyle(p.color, Math.max(0, p.life / p.max)).fillCircle(p.x, p.y, p.size);
      }
    }

    private drawFarCity() {
      const f = this.far;
      f.clear();
      const span = WIDTH + 200;
      const off = (this.scrollPx * 0.25) % span;
      f.fillStyle(COLORS.farCity, 1);
      for (const b of this.farCity) {
        let x = b.x - off;
        if (x + b.w < 0) x += span;
        f.fillRect(x, KITE.GROUND - b.h, b.w, b.h);
      }
    }

    private drawStreet() {
      const g = this.g;
      g.fillStyle(COLORS.street, 1).fillRect(0, KITE.GROUND, WIDTH, HEIGHT - KITE.GROUND);
      g.fillStyle(0x2b3170, 1).fillRect(0, KITE.GROUND, WIDTH, 4);
      const off = this.scrollPx % 80;
      g.fillStyle(COLORS.streetLine, 0.7);
      for (let x = -off; x < WIDTH; x += 80) g.fillRect(x, KITE.GROUND + 42, 40, 5);
    }

    private drawGate(gate: KiteGate) {
      const g = this.g;
      const glow = this.glow;
      const x = gate.x / FP;
      const w = gate.w / FP;
      const top = (gate.cy - gate.gap / 2) / FP;
      const bottom = (gate.cy + gate.gap / 2) / FP;
      if (x > WIDTH || x + w < 0) return;
      // Hanging tower block (from the sky) and a tower rising from the street.
      for (const [y0, y1, fromTop] of [
        [0, top, true],
        [bottom, KITE.GROUND, false],
      ] as const) {
        if (y1 <= y0) continue;
        g.fillStyle(COLORS.tower, 1).fillRect(x, y0, w, y1 - y0);
        g.lineStyle(3, gate.amp ? 0xff8a3d : COLORS.towerEdge, 1).strokeRect(x, y0, w, y1 - y0);
        // Lit windows; the pattern is fixed per tower so it doesn't flicker.
        const cols = Math.max(2, Math.floor((w - 16) / 22));
        const cw = (w - 16) / cols;
        const rowsStart = fromTop ? y1 - 26 : y0 + 18;
        for (let row = 0; row < 40; row++) {
          const wy = fromTop ? rowsStart - row * 30 : rowsStart + row * 30;
          if (fromTop ? wy < y0 + 4 : wy > y1 - 20) break;
          for (let c = 0; c < cols; c++) {
            const lit = ((gate.id * 7 + row * 3 + c * 5) % 7) < 4;
            g.fillStyle(lit ? COLORS.window : COLORS.windowOff, lit ? 0.85 : 1).fillRect(x + 8 + c * cw + 3, wy, cw - 6, 14);
          }
        }
        // Edge cap and a red aviation light at the tip that faces the gap.
        const capY = fromTop ? y1 - 10 : y0;
        g.fillStyle(COLORS.towerEdge, 1).fillRect(x - 6, capY, w + 12, 10);
        const ly = fromTop ? y1 + 2 : y0 - 2;
        glow.fillStyle(COLORS.beacon, 0.35).fillCircle(x + w / 2, ly, 10);
        g.fillStyle(COLORS.beacon, 1).fillCircle(x + w / 2, ly, 3.5);
      }
    }

    private drawThing(th: KiteThing, pulse: number) {
      const x = th.x / FP;
      const y = th.y / FP;
      if (x < -60 || x > WIDTH + 60) return;
      if (th.kind === 'star') {
        const r = 16 + Math.sin(pulse * Math.PI * 2) * 2;
        this.glow.fillStyle(COLORS.star, 0.28).fillCircle(x, y, r * 2);
        const pts: PhaserNS.Math.Vector2[] = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 === 0 ? r : r * 0.45;
          pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
        }
        this.g.fillStyle(COLORS.star, 1).fillPoints(pts, true);
        return;
      }
      this.glow.fillStyle(0xff3b5c, 0.18).fillCircle(x, y, 36);
      this.drawKite(x, y, Math.sin(pulse * Math.PI * 2 + th.id) * 0.25, COLORS.rival, COLORS.rivalAlt, true);
    }

    /** A diamond kite with a cross spar, a bowed tail and (for the player) a string. */
    private drawKite(x: number, y: number, tilt: number, main: number, alt: number, withString: boolean) {
      const g = this.g;
      const s = 30;
      const rot = (px: number, py: number) => {
        const c = Math.cos(tilt);
        const sn = Math.sin(tilt);
        return new Phaser.Math.Vector2(x + px * c - py * sn, y + px * sn + py * c);
      };
      const topP = rot(0, -s);
      const right = rot(s * 0.78, -s * 0.15);
      const bottomP = rot(0, s * 1.15);
      const left = rot(-s * 0.78, -s * 0.15);
      const mid = rot(0, -s * 0.15);
      if (withString && main === COLORS.kite) {
        g.lineStyle(1.5, COLORS.string, 0.6).lineBetween(bottomP.x, bottomP.y, x - 260, HEIGHT + 40);
      }
      // Tail with little bows.
      const wave = (Date.now() % 1000) / 1000;
      let tx = bottomP.x;
      let ty = bottomP.y;
      g.lineStyle(2, alt, 0.9);
      for (let i = 1; i <= 4; i++) {
        const nx = bottomP.x - i * 12;
        const ny = bottomP.y + i * 14 + Math.sin(wave * Math.PI * 2 + i) * 6;
        g.lineBetween(tx, ty, nx, ny);
        g.fillStyle(i % 2 ? alt : main, 1).fillTriangle(nx - 6, ny - 4, nx + 6, ny - 4, nx, ny + 4);
        tx = nx;
        ty = ny;
      }
      // Two-tone sail.
      g.fillStyle(main, 1).fillTriangle(topP.x, topP.y, right.x, right.y, mid.x, mid.y);
      g.fillStyle(main, 1).fillTriangle(topP.x, topP.y, left.x, left.y, mid.x, mid.y);
      g.fillStyle(alt, 1).fillTriangle(left.x, left.y, bottomP.x, bottomP.y, mid.x, mid.y);
      g.fillStyle(alt, 1).fillTriangle(right.x, right.y, bottomP.x, bottomP.y, mid.x, mid.y);
      g.lineStyle(2, COLORS.kiteSpar, 0.9);
      g.lineBetween(topP.x, topP.y, bottomP.x, bottomP.y);
      g.lineBetween(left.x, left.y, right.x, right.y);
      g.lineStyle(2, 0xffffff, 0.35).strokePoints([topP, right, bottomP, left], true);
    }
  };
}
