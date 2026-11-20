import { isOffPace, PACE } from './sessions.module';

describe('isOffPace', () => {
  const start = 1_000_000;
  it('accepts waves that arrive at the pace they were played, with breaks between waves', () => {
    expect(isOffPace([start + 15_000, start + 29_000, start + 41_500], start, [12_000, 12_000, 10_000])).toBe(false);
  });
  it('rejects a wave reported before it could have been played', () => {
    expect(isOffPace([start + 15_000, start + 19_000], start, [12_000, 12_000])).toBe(true);
  });
  it('rejects a long gap that would allow pausing or rewinding', () => {
    const tooLate = 12_000 * PACE.maxRatio + PACE.maxSlackMs + 1000;
    expect(isOffPace([start + 15_000, start + 15_000 + tooLate], start, [12_000, 12_000])).toBe(true);
  });
  it('gives the first wave extra time for loading and the countdown', () => {
    expect(isOffPace([start + 30_000], start, [12_000])).toBe(false);
  });
});
