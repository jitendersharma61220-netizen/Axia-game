import type PhaserNS from 'phaser';
import { bossPhase, fightStep, initialFight, questionTimeFor, type FightState, type NeuralBossClientLevel, type NeuralBossSubmission } from '@axia/engine';
import { C, TimerBar, WIDTH, button, clearScene, label, type Button } from './ui';

type PhaserLib = typeof PhaserNS;

export const BOSS_LAYOUT = {
  option: (i: number) => ({ x: i % 2 === 0 ? 195 : 525, y: i < 2 ? 660 : 800, w: 300, h: 116 }),
};

export function createNeuralBossScene(
  Phaser: PhaserLib,
  level: NeuralBossClientLevel,
  onComplete: (submission: NeuralBossSubmission) => void,
) {
  return class NeuralBossScene extends Phaser.Scene {
    private state: FightState = initialFight(level);
    private qIndex = 0;
    private answers: NeuralBossSubmission['answers'] = [];
    private boss!: PhaserNS.GameObjects.Text;
    private hpBar!: PhaserNS.GameObjects.Rectangle;
    private hpText!: PhaserNS.GameObjects.Text;
    private hearts!: PhaserNS.GameObjects.Text;
    private phaseText!: PhaserNS.GameObjects.Text;
    private prompt!: PhaserNS.GameObjects.Text;
    private options: Button[] = [];
    private timer!: TimerBar;
    private locked = true;

    constructor() {
      super('neural-boss');
    }

    create() {
      clearScene(this);
      this.add.circle(WIDTH / 2, 190, 120, C.brand, 0.18);
      this.boss = label(this, WIDTH / 2, 190, '🧠', 150).setOrigin(0.5);
      this.tweens.add({ targets: this.boss, scale: 1.06, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
      this.phaseText = label(this, WIDTH / 2, 36, '', 22, { color: C.muted }).setOrigin(0.5);
      this.add.rectangle(80, 340, 560, 22, C.line).setOrigin(0, 0.5);
      this.hpBar = this.add.rectangle(80, 340, 560, 22, C.bad).setOrigin(0, 0.5);
      this.hpText = label(this, WIDTH / 2, 340, '', 16, { fontStyle: 'bold' }).setOrigin(0.5);
      this.hearts = label(this, WIDTH / 2, 392, '', 30).setOrigin(0.5);
      this.prompt = label(this, WIDTH / 2, 480, '', 40, { fontStyle: 'bold', align: 'center', wordWrap: { width: 660 } }).setOrigin(0.5);
      this.timer = new TimerBar(this, 556);
      for (let i = 0; i < 4; i++) {
        const o = BOSS_LAYOUT.option(i);
        this.options.push(button(this, o.x, o.y, o.w, o.h, '', () => this.answer(i), { size: 34 }));
      }
      this.refreshHud();
      this.nextQuestion();
    }

    private refreshHud() {
      const phase = bossPhase(this.state.bossHp, level.bossHp);
      this.phaseText.setText(`NEURAL BOSS · phase ${phase + 1}/3`);
      this.hpBar.width = 560 * (this.state.bossHp / level.bossHp);
      this.hpText.setText(`${this.state.bossHp} / ${level.bossHp}`);
      this.hearts.setText('❤️'.repeat(this.state.playerHp) + '🖤'.repeat(level.playerHp - this.state.playerHp));
    }

    private allowed() {
      return questionTimeFor(bossPhase(this.state.bossHp, level.bossHp), level);
    }

    private nextQuestion() {
      const q = level.questions[this.qIndex];
      this.prompt.setText(q.prompt);
      this.options.forEach((b, i) => {
        b.text.setText(q.options[i]);
        b.setFill(C.panel);
        b.setEnabled(true);
      });
      this.locked = false;
      this.timer.start(this.allowed(), () => this.answer(null));
    }

    private answer(choice: number | null) {
      if (this.locked) return;
      this.locked = true;
      const allowed = this.allowed();
      const ms = choice === null ? allowed + 1 : Math.min(this.timer.elapsed(), allowed);
      this.timer.stop();
      const q = level.questions[this.qIndex];
      const answer = { choice, ms };
      this.answers.push(answer);
      const { state, hit } = fightStep(this.state, q, answer, level, level.questions.length);
      this.state = state;

      this.options[q.answer].setFill(0x14532d);
      if (choice !== null && !hit) this.options[choice].setFill(0x7f1d1d);
      if (hit) {
        this.tweens.add({ targets: this.boss, x: WIDTH / 2 + 14, yoyo: true, repeat: 3, duration: 50 });
        const dmg = label(this, WIDTH / 2 + 120, 150, `-${level.damagePerHit}`, 40, { color: '#f87171', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({ targets: dmg, y: 90, alpha: 0, duration: 700, onComplete: () => dmg.destroy() });
      } else {
        this.cameras.main.flash(200, 120, 0, 0);
        this.cameras.main.shake(200, 0.01);
      }
      this.refreshHud();

      this.time.delayedCall(550, () => {
        this.qIndex++;
        if (!this.state.over) return this.nextQuestion();
        this.options.forEach((b) => b.setEnabled(false));
        this.prompt.setText(this.state.won ? 'BOSS DEFEATED!' : 'YOU WERE DEFEATED');
        this.prompt.setColor(this.state.won ? '#34d399' : '#f87171');
        if (this.state.won) this.tweens.add({ targets: this.boss, alpha: 0, scale: 0.2, angle: 180, duration: 800 });
        this.time.delayedCall(1100, () => onComplete({ answers: this.answers }));
      });
    }
  };
}
