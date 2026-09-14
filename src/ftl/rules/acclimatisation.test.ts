import { describe, expect, it } from 'vitest';
import { hasAchievedAcclimatisation, remainsAcclimatised } from './acclimatisation';

describe('hasAchievedAcclimatisation', () => {
  it('is true at exactly 3 consecutive nights within a 2h band with uninterrupted sleep', () => {
    expect(hasAchievedAcclimatisation(3, 2, true)).toBe(true);
  });

  it('is false at exactly 2 consecutive nights (one short of the threshold)', () => {
    expect(hasAchievedAcclimatisation(2, 2, true)).toBe(false);
  });

  it('is true for more than 3 nights within band', () => {
    expect(hasAchievedAcclimatisation(5, 1, true)).toBe(true);
  });

  it('is false when the time zone band exceeds 2h even with enough nights', () => {
    expect(hasAchievedAcclimatisation(3, 2.5, true)).toBe(false);
  });

  it('is false when uninterrupted sleep was not possible', () => {
    expect(hasAchievedAcclimatisation(3, 2, false)).toBe(false);
  });

  it('throws for non-finite inputs', () => {
    expect(() => hasAchievedAcclimatisation(NaN, 2, true)).toThrow();
    expect(() => hasAchievedAcclimatisation(3, NaN, true)).toThrow();
  });
});

describe('remainsAcclimatised', () => {
  it('remains acclimatised at exactly 2h local time difference', () => {
    expect(remainsAcclimatised(true, 2)).toBe(true);
  });

  it('loses acclimatisation just over 2h local time difference', () => {
    expect(remainsAcclimatised(true, 2.01)).toBe(false);
  });

  it('loses acclimatisation for a large time difference regardless of sign', () => {
    expect(remainsAcclimatised(true, -5)).toBe(false);
  });

  it('cannot become acclimatised just by staying within 2h if not already acclimatised', () => {
    expect(remainsAcclimatised(false, 1)).toBe(false);
  });

  it('throws for a non-finite time difference', () => {
    expect(() => remainsAcclimatised(true, NaN)).toThrow();
  });
});
