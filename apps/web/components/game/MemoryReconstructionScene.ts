import type PhaserNS from 'phaser';
import type { MemoryClientLevel, MemoryPlacement, MemorySubmission } from '@axia/engine';

type PhaserLib = typeof PhaserNS;

export const WIDTH = 720;
export const HEIGHT = 960;

const COLORS = {
  cell: 0x141a2e,
  cellLine: 0x262f4d,
  cellHover: 0x1d2542,
  selected: 0x7c5cff,
  bar: 0x22d3ee,
  barLow: 0xf87171,
  text: '#e8ecff',
  muted: '#8b95b7',
};

/** Grid geometry, shared with tests/automation so clicks land on the right cell. */
export function gridLayout(rows: number, cols: number) {
  const size = Math.floor(Math.min(640 / cols, 540 / rows));
  const x0 = (WIDTH - size * cols) / 2;
  const y0 = 130 + (540 - size * rows) / 2;
  const center = (cell: number) => ({
    x: x0 + (cell % cols) * size + size / 2,
    y: y0 + Math.floor(cell / cols) * size + size / 2,
  });
  return { size, x0, y0, center };
}

export function trayLayout(count: number) {
  const perRow = Math.min(count, 8);
  const rows = Math.ceil(count / perRow);
  const slot = Math.min(84, Math.floor(680 / perRow));
  const size = Math.min(slot - 8, Math.floor(200 / rows) - 8);
  const y0 = 700;
  const center = (i: number) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const x0 = (WIDTH - inRow * slot) / 2;
    return { x: x0 + (i % perRow) * slot + slot / 2, y: y0 + row * (size + 8) + size / 2 };
  };
  return { size, center };
}

export const DONE_BUTTON = { x: WIDTH / 2, y: 920 };

/**
 * Memory Reconstruction: objects flash on a grid, disappear, and the player
 * rebuilds the grid from a tray that also contains distractors. All tuning
 * (grid size, object count, timings, rounds) comes from the server-provided level.
 */
export function createMemoryScene(
  Phaser: PhaserLib,
  level: MemoryClientLevel,
  onComplete: (submission: MemorySubmission) => void,
) {
  return class MemoryReconstructionScene extends Phaser.Scene {
    private roundIndex = 0;
    private results: MemorySubmission['rounds'] = [];
    private placed = new Map<number, { icon: string; text: PhaserNS.GameObjects.Text }>();
    private selected: number | null = null;
    private trayItems: { icon: string; bg: PhaserNS.GameObjects.Rectangle; text: PhaserNS.GameObjects.Text; used: boolean }[] = [];
    private cells: PhaserNS.GameObjects.Rectangle[] = [];
    private recallStartedAt = 0;
    private finished = false;
    private phase: 'memorize' | 'recall' | 'between' = 'memorize';
    private status!: PhaserNS.GameObjects.Text;
    private timerBar!: PhaserNS.GameObjects.Rectangle;
    private timerTween?: PhaserNS.Tweens.Tween;
    private roundTimer?: PhaserNS.Time.TimerEvent;

    constructor() {
      super('memory-reconstruction');
    }

    create() {
      this.startRound(0);
    }

    private reset() {
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.children.removeAll(true);
      this.placed.clear();
      this.trayItems = [];
      this.cells = [];
      this.selected = null;
      this.finished = false;
    }

    private header(title: string, subtitle: string) {
      this.add.text(WIDTH / 2, 32, title, { fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: COLORS.muted }).setOrigin(0.5);
      this.status = this.add
        .text(WIDTH / 2, 72, subtitle, { fontFamily: 'system-ui, sans-serif', fontSize: '34px', fontStyle: 'bold', color: COLORS.text })
        .setOrigin(0.5);
      this.add.rectangle(WIDTH / 2, 110, 640, 10, COLORS.cellLine).setOrigin(0.5);
      this.timerBar = this.add.rectangle(40, 110, 640, 10, COLORS.bar).setOrigin(0, 0.5);
    }

    private runTimer(ms: number, onDone: () => void) {
      this.timerBar.width = 640;
      this.timerTween = this.tweens.add({
        targets: this.timerBar,
        width: 0,
        duration: ms,
        onUpdate: () => {
          if (this.timerBar.width < 640 * 0.2) this.timerBar.fillColor = COLORS.barLow;
        },
      });
      this.roundTimer = this.time.delayedCall(ms, onDone);
    }

    private startRound(index: number) {
      this.reset();
      this.roundIndex = index;
      this.phase = 'memorize';
      const round = level.rounds[index];
      const { size, center } = gridLayout(level.rows, level.cols);
      this.header(`Round ${index + 1} of ${level.rounds.length}`, 'Memorize!');

      for (let cell = 0; cell < level.rows * level.cols; cell++) {
        const { x, y } = center(cell);
        const rect = this.add.rectangle(x, y, size - 8, size - 8, COLORS.cell).setStrokeStyle(2, COLORS.cellLine);
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => this.onCellClick(cell));
        rect.on('pointerover', () => this.phase === 'recall' && rect.setFillStyle(COLORS.cellHover));
        rect.on('pointerout', () => rect.setFillStyle(COLORS.cell));
        this.cells.push(rect);
      }

      const shown = round.placements.map((p) => this.iconText(center(p.cell), p.icon, size));
      this.runTimer(level.showDurationMs, () => {
        shown.forEach((t) => t.destroy());
        this.beginRecall();
      });
    }

    private iconText(at: { x: number; y: number }, icon: string, size: number) {
      return this.add.text(at.x, at.y, icon, { fontSize: `${Math.floor(size * 0.55)}px` }).setOrigin(0.5);
    }

    private beginRecall() {
      this.phase = 'recall';
      this.status.setText('Rebuild the grid');
      this.timerBar.fillColor = COLORS.bar;
      const round = level.rounds[this.roundIndex];
      const { size, center } = trayLayout(round.tray.length);

      round.tray.forEach((icon, i) => {
        const at = center(i);
        const bg = this.add.rectangle(at.x, at.y, size, size, COLORS.cell).setStrokeStyle(2, COLORS.cellLine);
        bg.setInteractive({ useHandCursor: true });
        const text = this.iconText(at, icon, size * 1.2);
        const item = { icon, bg, text, used: false };
        bg.on('pointerdown', () => this.onTrayClick(i));
        this.trayItems.push(item);
      });

      const done = this.add
        .text(DONE_BUTTON.x, DONE_BUTTON.y, 'Done ✓', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: '#7c5cff',
          padding: { x: 36, y: 12 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      done.on('pointerdown', () => this.finishRound());

      this.recallStartedAt = this.time.now;
      this.runTimer(level.recallTimeLimitMs, () => this.finishRound());
    }

    private onTrayClick(i: number) {
      if (this.phase !== 'recall' || this.trayItems[i].used) return;
      this.selected = this.selected === i ? null : i;
      this.trayItems.forEach((t, j) =>
        t.bg.setStrokeStyle(j === this.selected ? 4 : 2, j === this.selected ? COLORS.selected : COLORS.cellLine),
      );
    }

    private onCellClick(cell: number) {
      if (this.phase !== 'recall') return;
      const existing = this.placed.get(cell);
      if (existing) {
        // Return the icon to the tray.
        existing.text.destroy();
        this.placed.delete(cell);
        const item = this.trayItems.find((t) => t.icon === existing.icon);
        if (item) {
          item.used = false;
          item.text.setAlpha(1);
          item.bg.setAlpha(1);
        }
      }
      if (this.selected === null) return;
      const item = this.trayItems[this.selected];
      const { size, center } = gridLayout(level.rows, level.cols);
      this.placed.set(cell, { icon: item.icon, text: this.iconText(center(cell), item.icon, size) });
      item.used = true;
      item.text.setAlpha(0.25);
      item.bg.setAlpha(0.4);
      item.bg.setStrokeStyle(2, COLORS.cellLine);
      this.selected = null;
    }

    private finishRound() {
      if (this.finished || this.phase !== 'recall') return;
      this.finished = true;
      this.phase = 'between';
      this.timerTween?.stop();
      this.roundTimer?.remove();
      const placements: MemoryPlacement[] = [...this.placed.entries()].map(([cell, p]) => ({ cell, icon: p.icon }));
      this.results.push({ placements, recallMs: Math.round(this.time.now - this.recallStartedAt) });

      const last = this.roundIndex + 1 >= level.rounds.length;
      this.status.setText(last ? 'Scoring…' : 'Nice! Next round…');
      if (last) onComplete({ rounds: this.results });
      else this.time.delayedCall(900, () => this.startRound(this.roundIndex + 1));
    }
  };
}
