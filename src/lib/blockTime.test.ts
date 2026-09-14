import { describe, expect, it } from 'vitest';
import { computeBlockTimeMin } from './blockTime';

describe('computeBlockTimeMin', () => {
  it('computes block time for a same-day flight', () => {
    // DXB (06:00) -> LHR (10:35), 4h35m same UTC day
    const std = 6 * 60; // 360
    const sta = 10 * 60 + 35; // 635
    expect(computeBlockTimeMin(std, sta, 0)).toBe(635 - 360);
  });

  it('computes block time for an overnight flight (arrivalDayOffset = 1)', () => {
    // DXB (21:40) -> JFK (07:35 next day), overnight
    const std = 21 * 60 + 40; // 1300
    const sta = 7 * 60 + 35; // 455
    const offset = 1;
    expect(computeBlockTimeMin(std, sta, offset)).toBe(
      455 + 1 * 1440 - 1300
    );
    expect(computeBlockTimeMin(std, sta, offset)).toBe(595);
  });

  it('throws for a non-positive result (data error)', () => {
    // STD after STA with no day offset applied — impossible flight
    const std = 12 * 60;
    const sta = 10 * 60;
    expect(() => computeBlockTimeMin(std, sta, 0)).toThrow();
  });

  it('throws when STD equals STA with zero offset (zero block time)', () => {
    expect(() => computeBlockTimeMin(600, 600, 0)).toThrow();
  });

  it('throws for non-finite inputs', () => {
    expect(() => computeBlockTimeMin(NaN, 600, 0)).toThrow();
    expect(() => computeBlockTimeMin(600, 600, NaN)).toThrow();
  });
});
