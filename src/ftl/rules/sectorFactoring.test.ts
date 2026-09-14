import { describe, expect, it } from 'vitest';
import {
  factoredSectors,
  SectorFactoringNotPermittedError,
} from './sectorFactoring';

describe('factoredSectors — 2-pilot crew, single-sector boundaries', () => {
  it('exactly 7h is unfactored (1 sector)', () => {
    expect(factoredSectors([7 * 60], 2, true)).toBe(1);
    expect(factoredSectors([7 * 60], 2, false)).toBe(1);
  });

  it('just over 7h factors to 2 (acclimatised) / 4 (not)', () => {
    expect(factoredSectors([7 * 60 + 1], 2, true)).toBe(2);
    expect(factoredSectors([7 * 60 + 1], 2, false)).toBe(4);
  });

  it('exactly 9h stays in the >7h-<=9h band', () => {
    expect(factoredSectors([9 * 60], 2, true)).toBe(2);
    expect(factoredSectors([9 * 60], 2, false)).toBe(4);
  });

  it('just over 9h factors to 3 (acclimatised) / 4 (not)', () => {
    expect(factoredSectors([9 * 60 + 1], 2, true)).toBe(3);
    expect(factoredSectors([9 * 60 + 1], 2, false)).toBe(4);
  });

  it('exactly 11h stays in the >9h-<=11h band', () => {
    expect(factoredSectors([11 * 60], 2, true)).toBe(3);
    expect(factoredSectors([11 * 60], 2, false)).toBe(4);
  });

  it('just over 11h factors to 4 (acclimatised); not permitted when not acclimatised', () => {
    expect(factoredSectors([11 * 60 + 1], 2, true)).toBe(4);
    expect(() => factoredSectors([11 * 60 + 1], 2, false)).toThrow(
      SectorFactoringNotPermittedError
    );
  });
});

describe('factoredSectors — multi-sector sums', () => {
  it('sums the factored contribution of each sector', () => {
    // one 8h sector (factor 2 acclimatised) + one 6h sector (factor 1)
    expect(factoredSectors([8 * 60, 6 * 60], 2, true)).toBe(3);
  });
});

describe('factoredSectors — crew-count exception', () => {
  it('with a 3rd pilot, factoring does not apply: returns actual sector count', () => {
    expect(factoredSectors([12 * 60, 12 * 60], 3, false)).toBe(2);
  });

  it('with a 4th pilot, factoring does not apply either', () => {
    expect(factoredSectors([12 * 60], 4, false)).toBe(1);
  });

  it('a >11h sector does not throw for a 3-pilot crew even when not acclimatised', () => {
    expect(() => factoredSectors([12 * 60], 3, false)).not.toThrow();
  });
});

describe('factoredSectors — validation', () => {
  it('throws for an empty sector list', () => {
    expect(() => factoredSectors([], 2, true)).toThrow();
  });

  it('throws for a negative sector length', () => {
    expect(() => factoredSectors([-1], 2, true)).toThrow();
  });
});
