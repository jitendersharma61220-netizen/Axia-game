import type PhaserNS from 'phaser';
import type { RuleShiftCard, RuleShiftClientLevel, RuleShiftSubmission } from '@axia/engine';
import type { GameServer } from './scenes';
import { C, TimerBar, WIDTH, clearScene, label } from './ui';

type PhaserLib = typeof PhaserNS;

const SYMBOL_COLORS = [0xef4444, 0x22c55e, 0xfacc15, 0x3b82f6];
const RULE_LABEL = { color: 'COLOUR', shape: 'SHAPE', count: 'NUMBER' } as const;

/** Layout, exported so browser automation can tap the right pile. */
export const RULE_SHIFT_LAYOUT = {
  card: { x: WIDTH / 2, y: 330, w: 260, h: 300 },
  pileY: 770,
  pileX: (i: number) => 90 + i * 180,
  pile: { w: 160, h: 200 },
};

function drawSymbol(g: PhaserNS.GameObjects.Graphics, shape: number, x: number, y: number, s: number) {
  if (shape === 0) {
    g.fillTriangle(x, y - s / 2, x - s / 2, y + s / 2, x + s / 2, y + s / 2);
  } else if (shape === 1) {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? s / 2 : s / 4.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push({ x: x + r * Math.cos(a), y: y + r * Math.sin(a) });
    }
    g.fillPoints(pts, true);
  } else if (shape === 2) {
    g.fillRect(x - s / 2, y - s / 6, s, s / 3);
    g.fillRect(x - s / 6, y - s / 2, s / 3, s);
  } else {
    g.fillCircle(x, y, s / 2);
  }
}

/** Draws a card (background + 1–4 symbols) centred at (x, y). */
export function drawCard(scene: PhaserNS.Scene, card: RuleShiftCard, x: number, y: number, w: number, h: number) {
  const g = scene.add.graphics();
  g.fillStyle(C.panelHi, 1);
  g.lineStyle(3, C.line, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 16);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 16);
  g.fillStyle(SYMBOL_COLORS[card.color], 1);
  const s = Math.min(w, h) * 0.3;
  const offsets: [number, number][][] = [
    [[0, 0]],
    [[0, -0.22], [0, 0.22]],
    [[0, -0.28], [-0.22, 0.18], [0.22, 0.18]],
    [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]],
  ];
  for (const [dx, dy] of offsets[card.count - 1]) drawSymbol(g, card.shape, x + dx * w, y + dy * h, s);
  return g;
}

export function createRuleShiftScene(
  Phaser: PhaserLib,
  level: RuleShiftClientLevel,
  onComplete: (submission: RuleShiftSubmission) => void,
  server: GameServer,
) {
  return class RuleShiftScene extends Phaser.Scene {
    private index = 0;
    private answers: RuleShiftSubmission['answers'] = [];
    private timer!: TimerBar;
    private locked = false;
    private streak = 0;

    constructor() {
      super('rule-shift');
    }

    create() {
      this.showTrial();
    }

    private showTrial() {
      clearScene(this);
      this.locked = false;
      const trial = level.trials[this.index];
      const L = RULE_SHIFT_LAYOUT;
      label(this, WIDTH / 2, 36, `Card ${this.index + 1} of ${level.trials.length}`, 24, { color: C.muted }).setOrigin(0.5);
      label(this, WIDTH / 2, 76, trial.rule ? `Sort by ${RULE_LABEL[trial.rule]}` : 'Find the rule', 32, { fontStyle: 'bold' }).setOrigin(0.5);
      if (this.streak >= 3) label(this, WIDTH - 40, 36, `🔥 ${this.streak}`, 24).setOrigin(1, 0.5);
      this.timer = new TimerBar(this, 112);
      drawCard(this, trial, L.card.x, L.card.y, L.card.w, L.card.h);
      label(this, WIDTH / 2, 610, 'Which pile does it go on?', 22, { color: C.muted }).setOrigin(0.5);

      level.piles.forEach((pile, i) => {
        const x = L.pileX(i);
        drawCard(this, pile, x, L.pileY, L.pile.w, L.pile.h);
        const hit = this.add.rectangle(x, L.pileY, L.pile.w, L.pile.h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.answer(i));
      });
      this.timer.start(level.trialTimeLimitMs, () => this.answer(null));
    }

    private async answer(pile: number | null) {
      if (this.locked) return;
      this.locked = true;
      const ms = Math.min(this.timer.elapsed(), level.trialTimeLimitMs + (pile === null ? 0 : 1));
      this.timer.stop();
      const step = { pile, ms };
      this.answers.push(step);

      const L = RULE_SHIFT_LAYOUT;
      const highlight = pile !== null ? this.add.rectangle(L.pileX(pile), L.pileY, L.pile.w + 10, L.pile.h + 10).setStrokeStyle(6, 0x8b95b7) : null;
      const status = label(this, WIDTH / 2, 545, pile === null ? '⏱ Too slow' : '…', 40, { fontStyle: 'bold', color: '#8b95b7' }).setOrigin(0.5);

      // The server knows the hidden rule and judges the move.
      let correct = false;
      try {
        const verdict = await server.step(this.index, step);
        correct = verdict.correct === true;
      } catch {
        status.setText('Connection problem').setColor('#fbbf24');
        this.time.delayedCall(1200, () => this.finish());
        return;
      }
      this.streak = correct ? this.streak + 1 : 0;
      highlight?.setStrokeStyle(6, correct ? C.good : C.bad);
      if (pile !== null) status.setText(correct ? '✓ Correct' : '✗ Wrong');
      status.setColor(correct ? '#34d399' : '#f87171');

      this.time.delayedCall(450, () => {
        this.index++;
        if (this.index < level.trials.length) this.showTrial();
        else this.finish();
      });
    }

    private finish() {
      clearScene(this);
      label(this, WIDTH / 2, 480, 'Scoring…', 36, { fontStyle: 'bold' }).setOrigin(0.5);
      // The server scores the moves it already judged; this payload is informational only.
      onComplete({ answers: this.answers });
    }
  };
}
