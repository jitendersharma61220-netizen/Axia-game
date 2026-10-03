import type PhaserNS from 'phaser';
import {
  DODGE,
  autopilotTarget,
  beginWave,
  comboOf,
  createRun,
  finishWave,
  isBossWave,
  tickRun,
  waveNumber,
  waveTicks,
  type DodgeEvent,
  type DodgeHazard,
  type DodgeInput,
  type DodgeRun,
  type NeonDodgeClientLevel,
  type NeonDodgeStep,
} from '@axia/engine';
import type { GameServer } from './scenes';
import { C, FONT, HEIGHT, WIDTH, clearScene, label } from './ui';

type PhaserLib = typeof PhaserNS;

/** Ship colours. Purely visual: skins never touch the simulation. */
export interface ShipSkin {
  core: number;
  glow: number;
  trail: number;
}
export const DEFAULT_SKIN: ShipSkin = { core: 0xe0fbff, glow: 0x22d3ee, trail: 0x22d3ee };

const COLORS = {
  orb: 0xff4fa3,
  shot: 0xfbbf24,
  laser: 0xff3b5c,
  burst: 0xff8a3d,
  spark: 0xff8a3d,
  mine: 0xa855f7,
  core: 0xff2bd6,
  shard: 0x5eead4,
  grid: 0x1a2140,
};

/** Which hazard joins at which wave, for the "NEW:" banner. */
const UNLOCKS: Record<number, string> = { 2: 'Aimed shots', 3: 'Lasers — watch the warning line', 4: 'Bursts', 7: 'Homing mines' };

const FP = DODGE.FP;
/** Dev/test builds only: lets automated browser tests drive the ship with the engine's autopilot. */
const DEV_HOOKS = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === 'true';
const TICK_MS = 1000 / DODGE.TPS;
const MAX_TICKS_PER_FRAME = 8;

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

type Phase = 'countdown' | 'playing' | 'waiting' | 'over';

/** Tiny WebAudio synth: no audio files to download. */
class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;
  constructor() {
    try {
      this.muted = localStorage.getItem('axia:muted') === '1';
    } catch {
      // Storage blocked: default to sound on.
    }
  }
  unlock() {
    if (this.ctx || typeof window === 'undefined') return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) this.ctx = new Ctor();
  }
  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('axia:muted', this.muted ? '1' : '0');
    } catch {
      // Ignore.
    }
  }
  tone(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.06, slideTo?: number) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + ms / 1000);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
  }
}

function vibrate(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported.
  }
}

export function createNeonDodgeScene(
  Phaser: PhaserLib,
  level: NeonDodgeClientLevel,
  onComplete: (submission: { waves: NeonDodgeStep[] }) => void,
  server: GameServer,
  cosmetics: { ship?: ShipSkin } = {},
) {
  const skin = cosmetics.ship ?? DEFAULT_SKIN;

  return class NeonDodgeScene extends Phaser.Scene {
    private run: DodgeRun = createRun(level.params, true);
    private phase: Phase = 'countdown';
    private stepIndex = 0;
    private inputs: DodgeInput[] = [];
    private acc = 0;
    private g!: PhaserNS.GameObjects.Graphics;
    private glow!: PhaserNS.GameObjects.Graphics;
    private scoreText!: PhaserNS.GameObjects.Text;
    private waveText!: PhaserNS.GameObjects.Text;
    private comboText!: PhaserNS.GameObjects.Text;
    private muteText!: PhaserNS.GameObjects.Text;
    private trail: { x: number; y: number }[] = [];
    private particles: Particle[] = [];
    private sfx = new Sfx();
    // Controls: relative drag on touch, arrows/WASD on keyboards.
    private drag: { px: number; py: number; sx: number; sy: number } | null = null;
    private pointer = { x: 0, y: 0 };
    private keys: Record<string, PhaserNS.Input.Keyboard.Key> = {};
    private onHidden = () => {
      if (document.hidden && (this.phase === 'playing' || this.phase === 'countdown')) void this.endRun(true);
    };

    constructor() {
      super('neon-dodge');
    }

    create() {
      clearScene(this);
      this.drawBackdrop();
      this.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.g = this.add.graphics();
      this.scoreText = label(this, 24, 18, '0', 40, { fontStyle: 'bold' }).setDepth(10);
      this.waveText = label(this, WIDTH / 2, 30, '', 22, { color: C.muted, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(10);
      this.comboText = label(this, WIDTH - 90, 24, '', 30, { color: '#5eead4', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(10);
      this.muteText = label(this, WIDTH - 24, 24, this.sfx.muted ? '🔇' : '🔊', 30).setOrigin(1, 0).setDepth(11);
      this.muteText.setInteractive({ useHandCursor: true }).on('pointerdown', (_p: unknown, _x: number, _y: number, ev: { stopPropagation(): void }) => {
        ev.stopPropagation();
        this.sfx.toggle();
        this.muteText.setText(this.sfx.muted ? '🔇' : '🔊');
      });

      this.input.on('pointerdown', (p: PhaserNS.Input.Pointer) => {
        this.sfx.unlock();
        if (p.y < 90 && p.x > WIDTH - 90) return;
        this.drag = { px: p.x, py: p.y, sx: this.run.px / FP, sy: this.run.py / FP };
        this.pointer = { x: p.x, y: p.y };
      });
      this.input.on('pointermove', (p: PhaserNS.Input.Pointer) => {
        if (p.isDown) this.pointer = { x: p.x, y: p.y };
      });
      this.input.on('pointerup', () => (this.drag = null));
      this.input.on('gameout', () => (this.drag = null));
      const kb = this.input.keyboard;
      if (kb) {
        for (const k of ['UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D']) this.keys[k] = kb.addKey(k, true);
      }
      document.addEventListener('visibilitychange', this.onHidden);
      this.events.once('shutdown', () => document.removeEventListener('visibilitychange', this.onHidden));
      this.events.once('destroy', () => document.removeEventListener('visibilitychange', this.onHidden));

      beginWave(this.run, level.firstSeed);
      if (DEV_HOOKS) (window as unknown as { __neonDodge?: unknown }).__neonDodge = { scene: this, autopilot: false };
      this.hud();
      this.countdown();
    }

    private drawBackdrop() {
      const bg = this.add.graphics();
      bg.fillStyle(0x070a16, 1).fillRect(0, 0, WIDTH, HEIGHT);
      bg.lineStyle(1, COLORS.grid, 0.8);
      for (let x = 0; x <= WIDTH; x += 60) bg.lineBetween(x, 0, x, HEIGHT);
      for (let y = 0; y <= HEIGHT; y += 60) bg.lineBetween(0, y, WIDTH, y);
      bg.lineStyle(3, 0x7c5cff, 0.35).strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
    }

    private countdown() {
      this.phase = 'countdown';
      this.banner(`WAVE ${waveNumber(this.run)}`, 'Drag anywhere to steer · keys work too');
      const n = label(this, WIDTH / 2, HEIGHT / 2 + 40, '3', 120, { fontStyle: 'bold' }).setOrigin(0.5).setDepth(12);
      let left = 3;
      this.time.addEvent({
        delay: 700,
        repeat: 2,
        callback: () => {
          left--;
          if (left > 0) {
            n.setText(String(left));
            this.sfx.tone(440, 120, 'square', 0.04);
          } else {
            n.destroy();
            this.sfx.tone(880, 180, 'square', 0.05);
            this.phase = 'playing';
            this.acc = 0;
          }
        },
      });
    }

    private banner(title: string, sub?: string, color = '#e8ecff') {
      const t = label(this, WIDTH / 2, HEIGHT / 2 - 120, title, 64, { fontStyle: 'bold', color }).setOrigin(0.5).setDepth(12);
      const s = sub ? label(this, WIDTH / 2, HEIGHT / 2 - 60, sub, 24, { color: C.muted }).setOrigin(0.5).setDepth(12) : null;
      t.setScale(0.6);
      this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [t, s].filter(Boolean), alpha: 0, delay: 1300, duration: 400, onComplete: () => [t, s].forEach((o) => o?.destroy()) });
    }

    /** The finger/keyboard target for this tick, in px, or -1 when not steering. */
    private target(): [number, number] {
      if (DEV_HOOKS && (window as unknown as { __neonDodge?: { autopilot: boolean } }).__neonDodge?.autopilot) return autopilotTarget(this.run);
      const k = this.keys;
      const dx = (k.RIGHT?.isDown || k.D?.isDown ? 1 : 0) - (k.LEFT?.isDown || k.A?.isDown ? 1 : 0);
      const dy = (k.DOWN?.isDown || k.S?.isDown ? 1 : 0) - (k.UP?.isDown || k.W?.isDown ? 1 : 0);
      const clampX = (v: number) => Math.max(0, Math.min(DODGE.W, Math.round(v)));
      const clampY = (v: number) => Math.max(0, Math.min(DODGE.H, Math.round(v)));
      if (dx || dy) return [clampX(this.run.px / FP + dx * 200), clampY(this.run.py / FP + dy * 200)];
      if (!this.drag) return [-1, -1];
      return [clampX(this.drag.sx + (this.pointer.x - this.drag.px) * 1.25), clampY(this.drag.sy + (this.pointer.y - this.drag.py) * 1.25)];
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
      this.updateParticles(delta);
      this.draw();
    }

    private tickOnce() {
      const [tx, ty] = this.target();
      const last = this.inputs[this.inputs.length - 1];
      if (last && last[1] === tx && last[2] === ty) last[0]++;
      else this.inputs.push([1, tx, ty]);
      tickRun(this.run, tx, ty);
      for (const e of this.run.events) this.onEvent(e);
      this.trail.push({ x: this.run.px / FP, y: this.run.py / FP });
      if (this.trail.length > 14) this.trail.shift();
      if (!this.run.alive) {
        void this.endRun(false);
      } else if (this.run.waveTick >= waveTicks(level.params)) {
        void this.waveCleared();
      }
      this.hud();
    }

    private onEvent(e: DodgeEvent) {
      if (e.type === 'graze') {
        this.burst(e.x / FP, e.y / FP, 0xffffff, 5, 3);
        this.popup(e.x / FP, e.y / FP - 20, `+${e.points}${e.combo > 1 ? ` ×${e.combo}` : ''}`, '#5eead4');
        this.sfx.tone(600 + e.combo * 120, 70, 'triangle', 0.03);
      } else if (e.type === 'shard') {
        this.burst(e.x / FP, e.y / FP, COLORS.shard, 16, 5);
        this.popup(e.x / FP, e.y / FP - 24, `+${e.points}`, '#5eead4', 34);
        this.sfx.tone(988, 90, 'sine', 0.05);
        this.time.delayedCall(80, () => this.sfx.tone(1319, 140, 'sine', 0.05));
        vibrate(15);
      } else if (e.type === 'death') {
        this.burst(e.x / FP, e.y / FP, skin.glow, 50, 9);
        this.burst(e.x / FP, e.y / FP, 0xffffff, 20, 5);
        this.cameras.main.shake(350, 0.018);
        this.cameras.main.flash(200, 255, 60, 90);
        this.sfx.tone(220, 600, 'sawtooth', 0.08, 40);
        vibrate([80, 40, 160]);
      } else if (e.type === 'fire' && e.kind === 'laser') {
        this.sfx.tone(160, 200, 'square', 0.02);
      }
    }

    private async waveCleared() {
      this.phase = 'waiting';
      const step: NeonDodgeStep = { inputs: this.inputs };
      finishWave(this.run);
      this.inputs = [];
      this.sfx.tone(523, 120, 'square', 0.04);
      this.time.delayedCall(120, () => this.sfx.tone(784, 160, 'square', 0.04));
      const next = waveNumber(this.run);
      if (this.run.ended === 'cleared') {
        this.banner('ALL WAVES CLEARED', 'Legend.', '#5eead4');
      } else {
        const boss = isBossWave(level.params, next);
        this.banner(boss ? `BOSS · WAVE ${next}` : `WAVE ${next}`, boss ? 'Destroy nothing. Survive everything.' : UNLOCKS[next] ? `NEW: ${UNLOCKS[next]}` : undefined, boss ? '#ff2bd6' : '#e8ecff');
        if (boss) this.cameras.main.flash(250, 255, 43, 214);
      }
      this.hud();
      let verdict: Record<string, unknown>;
      try {
        [verdict] = await Promise.all([server.step(this.stepIndex++, step), new Promise((r) => setTimeout(r, 1500))]);
      } catch {
        return this.finish('Connection lost — your run so far still counts.');
      }
      if (verdict.outcome !== 'survived' || typeof verdict.nextSeed !== 'string') {
        return this.finish(this.run.ended === 'cleared' ? undefined : 'Run over.');
      }
      beginWave(this.run, verdict.nextSeed);
      this.acc = 0;
      this.phase = 'playing';
    }

    private async endRun(quit: boolean) {
      if (this.phase === 'over') return;
      const wasPlaying = this.phase === 'playing' || this.phase === 'countdown';
      this.phase = 'over';
      if (!wasPlaying) return;
      const step: NeonDodgeStep = quit ? { inputs: this.inputs, quit: true } : { inputs: this.inputs };
      try {
        await server.step(this.stepIndex++, step);
      } catch {
        // The waves already judged still count.
      }
      this.time.delayedCall(quit ? 0 : 1300, () => this.finish());
    }

    private finish(message?: string) {
      this.phase = 'over';
      if (message) label(this, WIDTH / 2, HEIGHT / 2, message, 28, { align: 'center' }).setOrigin(0.5).setDepth(12);
      this.time.delayedCall(message ? 900 : 0, () => onComplete({ waves: [] }));
    }

    private hud() {
      this.scoreText.setText(this.run.points.toLocaleString('en-IN'));
      const wave = waveNumber(this.run);
      const left = Math.max(0, Math.ceil((waveTicks(level.params) - this.run.waveTick) / DODGE.TPS));
      this.waveText.setText(`WAVE ${wave}${isBossWave(level.params, wave) ? ' · BOSS' : ''} · ${left}s`);
      const combo = comboOf(this.run.chain);
      this.comboText.setText(combo > 1 ? `×${combo}` : '');
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
      const run = this.run;
      const pulse = (Date.now() % 600) / 600;

      for (const s of run.pickups) {
        const x = s.x / FP;
        const y = s.y / FP;
        const r = 12 + Math.sin(pulse * Math.PI * 2) * 2;
        glow.fillStyle(COLORS.shard, s.life < 60 && s.life % 10 < 5 ? 0.05 : 0.25).fillCircle(x, y, r * 2.2);
        g.fillStyle(COLORS.shard, 1).fillPoints(
          [new Phaser.Math.Vector2(x, y - r), new Phaser.Math.Vector2(x + r * 0.7, y), new Phaser.Math.Vector2(x, y + r), new Phaser.Math.Vector2(x - r * 0.7, y)],
          true,
        );
      }

      for (const h of run.hazards) this.drawHazard(h, pulse);

      // Ship + trail.
      if (run.alive) {
        this.trail.forEach((t, i) => {
          const a = (i + 1) / this.trail.length;
          glow.fillStyle(skin.trail, 0.18 * a).fillCircle(t.x, t.y, 6 + 8 * a);
        });
        const x = run.px / FP;
        const y = run.py / FP;
        glow.fillStyle(skin.glow, 0.22).fillCircle(x, y, 30);
        glow.fillStyle(skin.glow, 0.35).fillCircle(x, y, 19);
        g.fillStyle(skin.core, 1).fillCircle(x, y, level.params.playerRadius + 3);
        g.lineStyle(2, skin.glow, 1).strokeCircle(x, y, level.params.playerRadius + 7);
      }

      for (const p of this.particles) {
        glow.fillStyle(p.color, Math.max(0, p.life / p.max)).fillCircle(p.x, p.y, p.size);
      }
    }

    private drawHazard(h: DodgeHazard, pulse: number) {
      const g = this.g;
      const glow = this.glow;
      const x = h.x / FP;
      const y = h.y / FP;
      const r = h.r / FP;
      if (h.kind === 'laser') {
        const horizontal = h.axis === 0;
        if (h.warn > 0) {
          const blink = Math.floor(h.warn / 5) % 2 === 0 ? 0.65 : 0.25;
          g.lineStyle(2, COLORS.laser, blink);
          if (horizontal) g.lineBetween(0, y, WIDTH, y);
          else g.lineBetween(x, 0, x, HEIGHT);
          g.fillStyle(COLORS.laser, blink);
          if (horizontal) {
            g.fillTriangle(0, y - 12, 0, y + 12, 18, y);
            g.fillTriangle(WIDTH, y - 12, WIDTH, y + 12, WIDTH - 18, y);
          } else {
            g.fillTriangle(x - 12, 0, x + 12, 0, x, 18);
            g.fillTriangle(x - 12, HEIGHT, x + 12, HEIGHT, x, HEIGHT - 18);
          }
        } else {
          glow.fillStyle(COLORS.laser, 0.3);
          if (horizontal) glow.fillRect(0, y - r * 3, WIDTH, r * 6);
          else glow.fillRect(x - r * 3, 0, r * 6, HEIGHT);
          g.fillStyle(0xffe4ea, 1);
          if (horizontal) g.fillRect(0, y - r * 0.6, WIDTH, r * 1.2);
          else g.fillRect(x - r * 0.6, 0, r * 1.2, HEIGHT);
        }
        return;
      }
      if (h.kind === 'burst') {
        const k = h.warn / 45;
        g.lineStyle(3, COLORS.burst, 0.9).strokeCircle(x, y, 16 + 50 * k);
        glow.fillStyle(COLORS.burst, 0.35).fillCircle(x, y, 18);
        g.fillStyle(0xffffff, 1).fillCircle(x, y, 5);
        return;
      }
      if (h.kind === 'core') {
        const alpha = h.warn > 0 ? 0.3 : 1;
        glow.fillStyle(COLORS.core, 0.25 * alpha).fillCircle(x, y, r * 2.2);
        g.fillStyle(COLORS.core, alpha).fillCircle(x, y, r);
        g.fillStyle(0x16031a, alpha).fillCircle(x, y, r * (0.45 + 0.1 * Math.sin(pulse * Math.PI * 2)));
        g.lineStyle(3, 0xffffff, 0.6 * alpha).strokeCircle(x, y, r + 8);
        return;
      }
      const color = COLORS[h.kind];
      glow.fillStyle(color, 0.28).fillCircle(x, y, r * 2.1);
      g.fillStyle(color, 1).fillCircle(x, y, r);
      g.fillStyle(0xffffff, 0.85).fillCircle(x, y, r * 0.45);
      if (h.kind === 'mine') {
        g.lineStyle(2, color, 1);
        const a0 = pulse * Math.PI * 2;
        for (let i = 0; i < 4; i++) {
          const a = a0 + (i * Math.PI) / 2;
          g.lineBetween(x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
        }
      }
    }
  };
}
