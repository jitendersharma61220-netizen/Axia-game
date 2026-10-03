import type PhaserNS from 'phaser';
import { createDigitalDetectiveScene } from './DigitalDetectiveScene';
import { createInternetCafeScene } from './InternetCafeScene';
import { createMemoryScene } from './MemoryReconstructionScene';
import { createNeonDodgeScene, type ShipSkin } from './NeonDodgeScene';
import { createNeuralBossScene } from './NeuralBossScene';
import { createRuleShiftScene } from './RuleShiftScene';

type PhaserLib = typeof PhaserNS;
/** Lets instant-feedback games ask the server to judge each move. */
export interface GameServer {
  step(index: number, step: object): Promise<Record<string, unknown>>;
}

/** Purely visual extras the player has unlocked (never part of the game logic). */
export interface Cosmetics {
  ship?: ShipSkin;
}

type SceneFactory = (
  Phaser: PhaserLib,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  level: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onComplete: (submission: any) => void,
  server: GameServer,
  cosmetics?: Cosmetics,
) => new () => PhaserNS.Scene;

/** Client half of the engine registry: template key → Phaser scene. */
export const sceneFactories: Record<string, SceneFactory> = {
  'neon-dodge': createNeonDodgeScene,
  'memory-reconstruction': createMemoryScene,
  'rule-shift': createRuleShiftScene,
  'digital-detective': createDigitalDetectiveScene,
  'neural-boss': createNeuralBossScene,
  'internet-cafe-mission': createInternetCafeScene,
};
