'use client';

import { useEffect, useRef } from 'react';
import type PhaserNS from 'phaser';
import { sceneFactories, type GameServer } from './scenes';
import { HEIGHT, WIDTH } from './ui';

interface Props {
  templateKey: string;
  level: unknown;
  onComplete: (submission: unknown) => void;
  server: GameServer;
}

export function PhaserGame({ templateKey, level, onComplete, server }: Props) {
  const parent = useRef<HTMLDivElement>(null);
  const done = useRef(onComplete);
  done.current = onComplete;
  const srv = useRef(server);
  srv.current = server;

  useEffect(() => {
    let game: PhaserNS.Game | undefined;
    let cancelled = false;
    (async () => {
      const mod = await import('phaser');
      const Phaser = ((mod as unknown as { default?: typeof PhaserNS }).default ?? mod) as typeof PhaserNS;
      const factory = sceneFactories[templateKey];
      if (cancelled || !parent.current || !factory) return;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: parent.current,
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: '#0b1020',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: factory(Phaser, level, (s) => done.current(s), { step: (i, st) => srv.current.step(i, st) }),
      });
    })();
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [templateKey, level]);

  if (!sceneFactories[templateKey]) return <p className="text-bad">This game can’t be played in this version of the app.</p>;
  return <div ref={parent} data-testid="game-canvas" className="mx-auto aspect-[3/4] w-full max-w-[540px]" />;
}
