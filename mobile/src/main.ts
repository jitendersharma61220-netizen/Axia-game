import Phaser from 'phaser';
import { patangRush, type PatangRushParams, type PatangRushStep, type ScoreResult } from '@axia/engine';
import { HEIGHT, PatangRushScene, WIDTH, type StageJudge } from './game/PatangRushScene';
import { exitApp, setupNative } from './native';
import './style.css';

type Level = 'normal' | 'hard' | 'insane';

/** The same three presets the Axia website ships with. */
const PRESETS: Record<Level, Partial<PatangRushParams>> = {
  normal: {},
  hard: { startStage: 3, speedRamp: 0.06 },
  insane: { startStage: 6, speedRamp: 0.07, gapSize: 280, minGap: 185, rivalsFrom: 5 },
};
const LABEL: Record<Level, string> = { normal: 'Normal', hard: 'Hard', insane: 'Insane' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const startPanel = $('start');
const resultPanel = $('result');
const playBtn = $<HTMLButtonElement>('play');
let level: Level = 'normal';

function readBest(l: Level) {
  try {
    return Number(localStorage.getItem(`patang:best:${l}`)) || 0;
  } catch {
    return 0;
  }
}
function writeBest(l: Level, v: number) {
  try {
    localStorage.setItem(`patang:best:${l}`, String(v));
  } catch {
    // Storage blocked: the best score just isn't kept.
  }
}

function pick(l: Level) {
  level = l;
  document.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === l)));
  const best = readBest(l);
  $('s-best').innerHTML = best ? `Best on ${LABEL[l]}: <b>${best.toLocaleString('en-IN')}</b>` : '';
}
document.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.level as Level)));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#4f8fcf',
  // EXPAND fills any phone screen; the scene shows more sky and road around the 720×960 play area.
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [PatangRushScene],
});
const scene = () => game.scene.getScene('patang-rush') as PatangRushScene;
game.events.once('patang-ready', () => {
  playBtn.disabled = false;
  playBtn.textContent = 'Play';
  // Development only (npm run dev, then open /?autopilot): the engine's bot flies the kite.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('autopilot')) scene().autopilot = true;
});

/** Starts a run. Each stage is judged on the phone by the same engine code the Axia server uses. */
function play() {
  const params = { ...patangRush.defaultParams, ...PRESETS[level] } as PatangRushParams;
  const seed = `app-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const full = patangRush.generateLevel(params, seed);
  const steps: PatangRushStep[] = [];
  const judge: StageJudge = {
    async step(index, step) {
      const verdict = patangRush.interactive!.check(full, params, index, step, steps.slice());
      steps.push(step);
      return verdict.feedback;
    },
  };
  const runLevel = level;
  startPanel.hidden = true;
  resultPanel.hidden = true;
  scene().startRun(patangRush.toClientLevel(full, params), judge, () => {
    showResult(runLevel, patangRush.score(full, { stages: steps }, { durationMs: 0 }, params));
  });
}

function showResult(l: Level, r: ScoreResult) {
  const best = readBest(l);
  const isBest = r.score > best;
  if (isBest) writeBest(l, r.score);
  $('r-level').textContent = `${LABEL[l]} · run over`;
  $('r-score').textContent = r.score.toLocaleString('en-IN');
  $('r-best').innerHTML = isBest && r.score > 0 ? '<b>New best!</b>' : `Best on ${LABEL[l]}: <b>${Math.max(best, r.score).toLocaleString('en-IN')}</b>`;
  const stats = $('r-stats');
  stats.replaceChildren(
    ...r.highlights.map((h) => {
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = h.label;
      const dd = document.createElement('dd');
      dd.textContent = h.value;
      d.append(dt, dd);
      return d;
    }),
  );
  $('r-note').textContent = r.notes?.[0] ?? '';
  resultPanel.hidden = false;
}

function showStart() {
  resultPanel.hidden = true;
  startPanel.hidden = false;
  pick(level);
  scene().showMenu();
}

playBtn.addEventListener('click', play);
$('again').addEventListener('click', play);

setupNative({
  onPause: () => scene()?.pauseRun(),
  // Back: pause a run, quit a paused run, leave the results, then leave the app.
  onBack: () => {
    const s = scene();
    if (s.isRunning && !s.isPaused) s.pauseRun();
    else if (s.isRunning) s.quitRun();
    else if (!resultPanel.hidden) showStart();
    else exitApp();
  },
});

pick('normal');
