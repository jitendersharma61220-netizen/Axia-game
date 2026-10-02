import type PhaserNS from 'phaser';

export const WIDTH = 720;
export const HEIGHT = 960;
export const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

export const C = {
  ink: 0x0b1020,
  panel: 0x141a2e,
  panelHi: 0x1d2542,
  line: 0x262f4d,
  brand: 0x7c5cff,
  cyan: 0x22d3ee,
  good: 0x34d399,
  bad: 0xf87171,
  warn: 0xfbbf24,
  text: '#e8ecff',
  muted: '#8b95b7',
};

export function label(
  scene: PhaserNS.Scene,
  x: number,
  y: number,
  str: string,
  size = 24,
  style: PhaserNS.Types.GameObjects.Text.TextStyle = {},
) {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color: C.text, ...style });
}

export interface Button {
  bg: PhaserNS.GameObjects.Rectangle;
  text: PhaserNS.GameObjects.Text;
  setEnabled(on: boolean): void;
  setFill(color: number): void;
  destroy(): void;
}

/** Rectangle + centred label that reacts to taps. */
export function button(
  scene: PhaserNS.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  str: string,
  onClick: () => void,
  opts: { fill?: number; size?: number; stroke?: number; color?: string } = {},
): Button {
  const fill = opts.fill ?? C.panel;
  const bg = scene.add.rectangle(x, y, w, h, fill).setStrokeStyle(2, opts.stroke ?? C.line);
  const text = label(scene, x, y, str, opts.size ?? 26, { color: opts.color ?? C.text, align: 'center', wordWrap: { width: w - 16 } }).setOrigin(0.5);
  let enabled = true;
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => enabled && onClick());
  return {
    bg,
    text,
    setEnabled(on) {
      enabled = on;
      bg.setAlpha(on ? 1 : 0.4);
      text.setAlpha(on ? 1 : 0.5);
    },
    setFill(color) {
      bg.setFillStyle(color);
    },
    destroy() {
      bg.destroy();
      text.destroy();
    },
  };
}

/** Countdown bar; calls onDone when it runs out. */
export class TimerBar {
  private bg: PhaserNS.GameObjects.Rectangle;
  private bar: PhaserNS.GameObjects.Rectangle;
  private tween?: PhaserNS.Tweens.Tween;
  private timer?: PhaserNS.Time.TimerEvent;
  private startedAt = 0;

  constructor(
    private scene: PhaserNS.Scene,
    y: number,
    private width = 640,
  ) {
    const x = (WIDTH - width) / 2;
    this.bg = scene.add.rectangle(x, y, width, 10, C.line).setOrigin(0, 0.5);
    this.bar = scene.add.rectangle(x, y, width, 10, C.cyan).setOrigin(0, 0.5);
  }

  start(ms: number, onDone: () => void) {
    this.stop();
    this.startedAt = this.scene.time.now;
    this.bar.width = this.width;
    this.bar.fillColor = C.cyan;
    this.tween = this.scene.tweens.add({
      targets: this.bar,
      width: 0,
      duration: ms,
      onUpdate: () => {
        if (this.bar.width < this.width * 0.2) this.bar.fillColor = C.bad;
      },
    });
    this.timer = this.scene.time.delayedCall(ms, onDone);
  }

  /** Milliseconds since start(). */
  elapsed() {
    return Math.round(this.scene.time.now - this.startedAt);
  }

  stop() {
    this.tween?.stop();
    this.timer?.remove();
  }

  destroy() {
    this.stop();
    this.bg.destroy();
    this.bar.destroy();
  }
}

/** Clears everything a scene drew for the previous step. */
export function clearScene(scene: PhaserNS.Scene) {
  scene.tweens.killAll();
  scene.time.removeAllEvents();
  scene.children.removeAll(true);
}
