import type PhaserNS from 'phaser';
import { createMemoryScene } from './MemoryReconstructionScene';

type PhaserLib = typeof PhaserNS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SceneFactory = (Phaser: PhaserLib, level: any, onComplete: (submission: any) => void) => new () => PhaserNS.Scene;

/** Client half of the engine registry: template key → Phaser scene. */
export const sceneFactories: Record<string, SceneFactory> = {
  'memory-reconstruction': createMemoryScene,
};
