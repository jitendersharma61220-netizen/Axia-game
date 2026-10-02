import type PhaserNS from 'phaser';
import type { CafeClientLevel, CafeFolder, CafeSubmission } from '@axia/engine';
import { FONT, HEIGHT, TimerBar, WIDTH, button, clearScene, label } from './ui';

type PhaserLib = typeof PhaserNS;
type Stage = CafeClientLevel['stages'][number];
type StageAnswer = CafeSubmission['stages'][number];

/** Windows-98-ish palette for the nostalgia. */
const R = {
  desktop: 0x008080,
  window: 0xc0c0c0,
  title: 0x000080,
  white: 0xffffff,
  dark: 0x404040,
  ink: '#000000',
  select: 0x316ac5,
};

export const CAFE_LAYOUT = {
  win: { x: 30, y: 70, w: 660, h: 860 },
  content: { x: 50, y: 180, w: 620 },
  start: { x: WIDTH / 2, y: 820 },
  submit: { x: WIDTH / 2, y: 880, w: 260, h: 60 },
  captchaCell: (grid: number, i: number) => {
    const size = Math.floor(560 / grid);
    const x0 = (WIDTH - size * grid) / 2;
    return { x: x0 + (i % grid) * size + size / 2, y: 300 + Math.floor(i / grid) * size + size / 2, size };
  },
  key: (i: number) => ({ x: 210 + (i % 3) * 150, y: 380 + Math.floor(i / 3) * 150 }),
  option: (i: number) => ({ x: WIDTH / 2, y: 560 + i * 82 }),
  row: (i: number) => ({ x: WIDTH / 2, y: 330 + i * 66 }),
};

function text(scene: PhaserNS.Scene, x: number, y: number, str: string, size = 22, style: PhaserNS.Types.GameObjects.Text.TextStyle = {}) {
  return label(scene, x, y, str, size, { color: R.ink, fontFamily: `Tahoma, Verdana, ${FONT}`, ...style });
}

function retroButton(scene: PhaserNS.Scene, x: number, y: number, w: number, h: number, str: string, onClick: () => void, size = 24) {
  const b = button(scene, x, y, w, h, str, onClick, { fill: R.window, stroke: R.dark, size, color: R.ink });
  b.text.setFontFamily(`Tahoma, Verdana, ${FONT}`);
  return b;
}

export function createInternetCafeScene(
  Phaser: PhaserLib,
  level: CafeClientLevel,
  onComplete: (submission: CafeSubmission) => void,
) {
  return class InternetCafeScene extends Phaser.Scene {
    private stageIndex = 0;
    private results: StageAnswer[] = [];
    private timer!: TimerBar;
    private done = false;

    constructor() {
      super('internet-cafe-mission');
    }

    create() {
      this.intro();
    }

    private frame(title: string) {
      clearScene(this);
      this.add.rectangle(0, 0, WIDTH, HEIGHT, R.desktop).setOrigin(0);
      const W = CAFE_LAYOUT.win;
      this.add.rectangle(W.x, W.y, W.w, W.h, R.window).setOrigin(0).setStrokeStyle(3, R.white);
      this.add.rectangle(W.x + 4, W.y + 4, W.w - 8, 40, R.title).setOrigin(0);
      label(this, W.x + 16, W.y + 24, title, 20, { fontStyle: 'bold', fontFamily: `Tahoma, Verdana, ${FONT}` }).setOrigin(0, 0.5);
      label(this, W.x + W.w - 20, W.y + 24, '✕', 20).setOrigin(1, 0.5);
      // Taskbar
      this.add.rectangle(0, HEIGHT - 28, WIDTH, 28, R.window).setOrigin(0);
      text(this, 10, HEIGHT - 14, '🪟 Start   |   CyberZone Café · ₹20/hr', 16).setOrigin(0, 0.5);
    }

    private intro() {
      this.frame('Welcome to CyberZone Café');
      text(this, WIDTH / 2, 170, '💾 Mission briefing', 30, { fontStyle: 'bold' }).setOrigin(0.5);
      text(this, WIDTH / 2, 230, level.intro, 22, { align: 'center', wordWrap: { width: 600 } }).setOrigin(0.5, 0);
      text(this, WIDTH / 2, 380, `${level.stages.length} stages · ${Math.round(level.stageTimeLimitMs / 1000)}s each`, 22).setOrigin(0.5);

      const start = () => {
        this.stageIndex = 0;
        this.showStage();
      };
      if (!level.note) {
        retroButton(this, CAFE_LAYOUT.start.x, CAFE_LAYOUT.start.y, 300, 70, 'Start mission ▶', start, 28);
        return;
      }
      const note = this.add.rectangle(WIDTH / 2, 560, 420, 200, 0xfff59d).setStrokeStyle(2, 0xe6c200).setAngle(-2);
      const noteText = text(this, WIDTH / 2, 560, `📌 Sticky note\n\n${level.note}`, 30, { align: 'center', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setAngle(-2);
      const hint = text(this, WIDTH / 2, 700, 'Remember this! It disappears soon…', 20).setOrigin(0.5);
      this.time.delayedCall(level.noteShowMs, () => {
        note.destroy();
        noteText.destroy();
        hint.setText('The note fell behind the desk.');
        retroButton(this, CAFE_LAYOUT.start.x, CAFE_LAYOUT.start.y, 300, 70, 'Start mission ▶', start, 28);
      });
    }

    private showStage() {
      this.done = false;
      const stage = level.stages[this.stageIndex];
      this.frame(`Stage ${this.stageIndex + 1}/${level.stages.length} — ${stage.title}`);
      this.timer = new TimerBar(this, 136, 620);
      switch (stage.kind) {
        case 'captcha':
          return this.captcha(stage);
        case 'sequence':
          return this.sequence(stage);
        case 'bill':
          return this.bill(stage);
        case 'files':
          return this.files(stage);
        case 'recall':
          return this.recall(stage);
      }
    }

    /** Ends the current stage with whatever the player has done so far. */
    private finish(answer: Omit<StageAnswer, 'ms'>, startedAt?: number) {
      if (this.done) return;
      this.done = true;
      this.timer.stop();
      const elapsed = startedAt === undefined ? this.timer.elapsed() : Math.round(this.time.now - startedAt);
      this.results.push({ ...answer, ms: Math.min(elapsed, level.stageTimeLimitMs) });
      this.time.delayedCall(400, () => {
        this.stageIndex++;
        if (this.stageIndex < level.stages.length) this.showStage();
        else {
          this.frame('Submitting…');
          text(this, WIDTH / 2, 480, '📨 Uploading your form…', 30, { fontStyle: 'bold' }).setOrigin(0.5);
          onComplete({ stages: this.results });
        }
      });
    }

    private captcha(stage: Extract<Stage, { kind: 'captcha' }>) {
      text(this, WIDTH / 2, 200, `Select all squares with ${stage.target}`, 28, { fontStyle: 'bold' }).setOrigin(0.5);
      text(this, WIDTH / 2, 244, 'then press Verify', 18).setOrigin(0.5);
      const selected = new Set<number>();
      stage.tiles.forEach((icon, i) => {
        const { x, y, size } = CAFE_LAYOUT.captchaCell(stage.grid, i);
        const rect = this.add.rectangle(x, y, size - 6, size - 6, R.white).setStrokeStyle(2, R.dark).setInteractive({ useHandCursor: true });
        text(this, x, y, icon, Math.floor(size * 0.5)).setOrigin(0.5);
        const tick = text(this, x + size / 2 - 22, y - size / 2 + 18, '✔', 22, { color: '#ffffff', backgroundColor: '#316ac5' }).setOrigin(0.5).setVisible(false);
        rect.on('pointerdown', () => {
          if (selected.has(i)) selected.delete(i);
          else selected.add(i);
          tick.setVisible(selected.has(i));
          rect.setFillStyle(selected.has(i) ? 0xdbe7ff : R.white);
        });
      });
      const S = CAFE_LAYOUT.submit;
      retroButton(this, S.x, S.y, S.w, S.h, 'Verify', () => this.finish({ selected: [...selected] }));
      this.timer.start(level.stageTimeLimitMs, () => this.finish({ selected: [...selected] }));
    }

    private sequence(stage: Extract<Stage, { kind: 'sequence' }>) {
      const status = text(this, WIDTH / 2, 200, '📞 Watch the modem dial…', 28, { fontStyle: 'bold' }).setOrigin(0.5);
      const progress = text(this, WIDTH / 2, 250, '', 24).setOrigin(0.5);
      const keys = stage.keys.map((k, i) => {
        const { x, y } = CAFE_LAYOUT.key(i);
        const b = retroButton(this, x, y, 130, 130, k, () => tap(i), 44);
        b.setEnabled(false);
        return b;
      });
      const taps: number[] = [];
      let inputStartedAt = 0;
      const tap = (i: number) => {
        taps.push(i);
        keys[i].setFill(0xfff59d);
        this.time.delayedCall(150, () => keys[i].setFill(R.window));
        progress.setText('● '.repeat(taps.length) + '○ '.repeat(Math.max(0, stage.order.length - taps.length)));
        if (taps.length >= stage.order.length) {
          keys.forEach((k) => k.setEnabled(false));
          this.finish({ taps: [...taps] }, inputStartedAt);
        }
      };
      // Play the sequence, then hand over to the player. The stage timer starts with their turn.
      stage.order.forEach((k, step) => {
        this.time.delayedCall(500 + step * (stage.showMs + 150), () => {
          keys[k].setFill(0xfff59d);
          this.time.delayedCall(stage.showMs, () => keys[k].setFill(R.window));
        });
      });
      this.time.delayedCall(500 + stage.order.length * (stage.showMs + 150), () => {
        status.setText('Your turn: repeat the sequence');
        progress.setText('○ '.repeat(stage.order.length));
        keys.forEach((k) => k.setEnabled(true));
        inputStartedAt = this.time.now;
        this.timer.start(level.stageTimeLimitMs, () => this.finish({ taps: [...taps] }, inputStartedAt));
      });
    }

    private bill(stage: Extract<Stage, { kind: 'bill' }>) {
      this.add.rectangle(WIDTH / 2, 340, 520, 300, R.white).setStrokeStyle(2, R.dark);
      text(this, WIDTH / 2, 215, '🧾 CYBERZONE — CASH MEMO', 22, { fontStyle: 'bold' }).setOrigin(0.5);
      stage.lines.forEach((l, i) => {
        text(this, 120, 260 + i * 44, l.label, 20);
        text(this, 600, 260 + i * 44, `${l.qty} × ₹${l.price}`, 20).setOrigin(1, 0);
      });
      text(this, WIDTH / 2, 515, 'What is the total?', 26, { fontStyle: 'bold' }).setOrigin(0.5);
      stage.options.forEach((v, i) => {
        const o = CAFE_LAYOUT.option(i);
        retroButton(this, o.x, o.y, 360, 66, `₹${v}`, () => this.finish({ choice: i }), 28);
      });
      this.timer.start(level.stageTimeLimitMs, () => this.finish({ choice: null }));
    }

    private files(stage: Extract<Stage, { kind: 'files' }>) {
      text(this, WIDTH / 2, 190, `🔍 Find:  ${stage.targetName}`, 26, { fontStyle: 'bold' }).setOrigin(0.5);
      const path: CafeFolder[] = [stage.root];
      let objects: PhaserNS.GameObjects.GameObject[] = [];
      const render = () => {
        objects.forEach((o) => o.destroy());
        objects = [];
        const here = path[path.length - 1];
        const address = path.map((f) => f.name).join(' › ');
        objects.push(this.add.rectangle(WIDTH / 2, 260, 620, 40, R.white).setStrokeStyle(2, R.dark));
        objects.push(text(this, 60, 260, `📂 ${address}`, 18).setOrigin(0, 0.5));
        const rows: { icon: string; name: string; onClick: () => void }[] = [];
        if (path.length > 1) rows.push({ icon: '⬆️', name: '.. (Up)', onClick: () => (path.pop(), render()) });
        here.folders.forEach((f) => rows.push({ icon: '📁', name: f.name, onClick: () => (path.push(f), render()) }));
        here.files.forEach((f) => rows.push({ icon: '📄', name: f.name, onClick: () => this.finish({ fileId: f.id }) }));
        rows.forEach((r, i) => {
          const { x, y } = CAFE_LAYOUT.row(i);
          const bg = this.add.rectangle(x, y, 620, 58, R.white).setStrokeStyle(1, 0x999999).setInteractive({ useHandCursor: true });
          bg.on('pointerover', () => bg.setFillStyle(0xdbe7ff));
          bg.on('pointerout', () => bg.setFillStyle(R.white));
          bg.on('pointerdown', r.onClick);
          objects.push(bg, text(this, 70, y, `${r.icon}  ${r.name}`, 22).setOrigin(0, 0.5));
        });
      };
      render();
      this.timer.start(level.stageTimeLimitMs, () => this.finish({ fileId: null }));
    }

    private recall(stage: Extract<Stage, { kind: 'recall' }>) {
      text(this, WIDTH / 2, 230, '📧 YahooMail Login', 30, { fontStyle: 'bold' }).setOrigin(0.5);
      text(this, WIDTH / 2, 300, 'Which was your password?\n(It was on the sticky note.)', 24, { align: 'center' }).setOrigin(0.5);
      stage.options.forEach((v, i) => {
        const o = CAFE_LAYOUT.option(i);
        retroButton(this, o.x, o.y, 360, 66, v, () => this.finish({ choice: i }), 30);
      });
      this.timer.start(level.stageTimeLimitMs, () => this.finish({ choice: null }));
    }
  };
}
