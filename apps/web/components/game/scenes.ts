import type PhaserNS from 'phaser';
import { createDigitalDetectiveScene } from './DigitalDetectiveScene';
import { createInternetCafeScene } from './InternetCafeScene';
import { createMemoryScene } from './MemoryReconstructionScene';
import { createNeuralBossScene } from './NeuralBossScene';
import { createRuleShiftScene } from './RuleShiftScene';

type PhaserLib = typeof PhaserNS;
/** Lets instant-feedback games ask the server to judge each move. */
export interface GameServer {
  step(index: number, step: object): Promise<Record<string, unknown>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SceneFactory = (Phaser: PhaserLib, level: any, onComplete: (submission: any) => void, server: GameServer) => new () => PhaserNS.Scene;

/** Client half of the engine registry: template key → Phaser scene. */
export const sceneFactories: Record<string, SceneFactory> = {
  'memory-reconstruction': createMemoryScene,
  'rule-shift': createRuleShiftScene,
  'digital-detective': createDigitalDetectiveScene,
  'neural-boss': createNeuralBossScene,
  'internet-cafe-mission': createInternetCafeScene,
};
