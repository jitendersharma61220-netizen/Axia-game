import type { ShipSkinData } from '@/lib/types';

export const DEFAULT_SHIP: ShipSkinData = { core: 0xe0fbff, glow: 0x22d3ee, trail: 0x22d3ee };
export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** CSS rendering of a Neon Dodge ship skin, matching the in-game look. */
export function ShipPreview({ skin, size = 72 }: { skin: ShipSkinData; size?: number }) {
  return (
    <div className="relative mx-auto" style={{ width: size * 1.8, height: size }} aria-hidden>
      {[0.25, 0.4, 0.55, 0.7].map((x, i) => (
        <span
          key={x}
          className="absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${x * 50 - 10}%`, width: size * (0.15 + i * 0.05), height: size * (0.15 + i * 0.05), background: hex(skin.trail), opacity: 0.15 + i * 0.12 }}
        />
      ))}
      <span
        className="absolute top-1/2 right-[10%] -translate-y-1/2 rounded-full"
        style={{
          width: size * 0.45,
          height: size * 0.45,
          background: hex(skin.core),
          border: `3px solid ${hex(skin.glow)}`,
          boxShadow: `0 0 ${size * 0.25}px ${size * 0.08}px ${hex(skin.glow)}`,
        }}
      />
    </div>
  );
}
