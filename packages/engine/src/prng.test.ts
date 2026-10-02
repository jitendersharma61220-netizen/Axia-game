import { describe, expect, it } from 'vitest';
import { createRng } from './prng';

describe('createRng', () => {
  it('is deterministic per seed', () => {
    const a = createRng('s');
    const b = createRng('s');
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('keeps int within bounds and sample distinct', () => {
    const r = createRng('bounds');
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
    const s = r.sample([1, 2, 3, 4, 5, 6], 4);
    expect(new Set(s).size).toBe(4);
  });
});
