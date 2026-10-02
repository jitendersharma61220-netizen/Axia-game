import type PhaserNS from 'phaser';
import type { DetectiveClientLevel, DetectiveSubmission } from '@axia/engine';
import { C, TimerBar, WIDTH, button, clearScene, label, type Button } from './ui';

type PhaserLib = typeof PhaserNS;

export const DETECTIVE_LAYOUT = {
  accuse: { x: WIDTH / 2, y: 915, w: 320, h: 64 },
  cardW: 320,
  cardH: (attributeCount: number) => (attributeCount > 2 ? 84 : 66),
  /** Suspect cards are anchored above the Accuse button; clues fill the space above them. */
  suspect(i: number, count: number, attributeCount: number) {
    const h = this.cardH(attributeCount);
    const rows = Math.ceil(count / 2);
    const top = 870 - rows * (h + 10);
    return { x: 40 + (i % 2) * 340 + 160, y: top + Math.floor(i / 2) * (h + 10) + h / 2, top };
  },
};

export function createDigitalDetectiveScene(
  Phaser: PhaserLib,
  level: DetectiveClientLevel,
  onComplete: (submission: DetectiveSubmission) => void,
) {
  return class DigitalDetectiveScene extends Phaser.Scene {
    private caseIndex = 0;
    private results: DetectiveSubmission['cases'] = [];
    private selected: number | null = null;
    private cards: PhaserNS.GameObjects.Rectangle[] = [];
    private accuse!: Button;
    private timer!: TimerBar;
    private done = false;

    constructor() {
      super('digital-detective');
    }

    create() {
      this.showCase();
    }

    private showCase() {
      clearScene(this);
      this.selected = null;
      this.cards = [];
      this.done = false;
      const c = level.cases[this.caseIndex];

      label(this, WIDTH / 2, 30, `🕵️ Case ${this.caseIndex + 1} of ${level.cases.length}`, 22, { color: C.muted }).setOrigin(0.5);
      const crime = label(this, WIDTH / 2, 58, `Someone ${c.crime}.`, 26, {
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 660 },
      }).setOrigin(0.5, 0);
      let y = crime.y + crime.height + 18;
      this.timer = new TimerBar(this, y);
      y += 22;

      const L = DETECTIVE_LAYOUT;
      const cardH = L.cardH(level.attributes.length);
      const suspectsTop = L.suspect(0, c.suspects.length, level.attributes.length).top;
      label(this, 40, suspectsTop - 30, 'SUSPECTS — tap one', 16, { color: C.muted, fontStyle: 'bold' });

      // Evidence: shrink the font until every clue fits above the suspects.
      label(this, 40, y, 'EVIDENCE', 16, { color: C.muted, fontStyle: 'bold' });
      y += 26;
      for (const size of [21, 19, 17, 15, 13]) {
        const lines: PhaserNS.GameObjects.Text[] = [];
        let cy = y;
        for (const clue of c.clues) {
          const t = label(this, 40, cy, clue, size, { wordWrap: { width: 640 } });
          lines.push(t);
          cy += t.height + 4;
        }
        if (cy <= suspectsTop - 40 || size === 13) break;
        lines.forEach((t) => t.destroy());
      }

      c.suspects.forEach((s, i) => {
        const { x, y: cy } = L.suspect(i, c.suspects.length, level.attributes.length);
        const rect = this.add.rectangle(x, cy, L.cardW, cardH, C.panel).setStrokeStyle(2, C.line);
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => this.select(i));
        label(this, x - 148, cy - cardH / 2 + 8, s.name, 22, { fontStyle: 'bold' });
        const facts = level.attributes.map((a) => s.facts[a.key]).join(' · ');
        label(this, x - 148, cy - cardH / 2 + 38, facts, 16, { color: C.muted, wordWrap: { width: 296 } });
        this.cards.push(rect);
      });

      const A = DETECTIVE_LAYOUT.accuse;
      this.accuse = button(this, A.x, A.y, A.w, A.h, 'Accuse', () => this.finish(this.selected), { fill: C.brand, stroke: C.brand, size: 28 });
      this.accuse.setEnabled(false);
      this.timer.start(level.caseTimeLimitMs, () => this.finish(this.selected));
    }

    private select(i: number) {
      if (this.done) return;
      this.selected = i;
      this.cards.forEach((r, j) => r.setStrokeStyle(j === i ? 4 : 2, j === i ? C.brand : C.line).setFillStyle(j === i ? C.panelHi : C.panel));
      this.accuse.setEnabled(true);
      this.accuse.text.setText(`Accuse ${level.cases[this.caseIndex].suspects[i].name}`);
    }

    private finish(accused: number | null) {
      if (this.done) return;
      this.done = true;
      this.timer.stop();
      this.results.push({ accused, ms: Math.min(this.timer.elapsed(), level.caseTimeLimitMs) });
      this.accuse.setEnabled(false);
      this.accuse.text.setText(accused === null ? '⏱ Time up' : 'Case closed');
      this.time.delayedCall(700, () => {
        this.caseIndex++;
        if (this.caseIndex < level.cases.length) this.showCase();
        else {
          clearScene(this);
          label(this, WIDTH / 2, 480, 'Checking the evidence…', 32, { fontStyle: 'bold' }).setOrigin(0.5);
          onComplete({ cases: this.results });
        }
      });
    }
  };
}
