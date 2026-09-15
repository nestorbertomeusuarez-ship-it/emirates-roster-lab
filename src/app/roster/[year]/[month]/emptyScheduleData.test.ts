import { describe, expect, it } from 'vitest';
import { hasNoScheduleDataForMonth } from './emptyScheduleData';

describe('hasNoScheduleDataForMonth', () => {
  it('is true when both flight instances and candidate pairings are zero', () => {
    expect(hasNoScheduleDataForMonth(0, 0)).toBe(true);
  });

  it('is false when flight instances exist but no pairings were generated yet', () => {
    expect(hasNoScheduleDataForMonth(12, 0)).toBe(false);
  });

  it('is false when both flight instances and candidate pairings exist', () => {
    expect(hasNoScheduleDataForMonth(12, 3)).toBe(false);
  });

  it('is false when pairings exist without a reported instance count (defensive)', () => {
    expect(hasNoScheduleDataForMonth(0, 1)).toBe(false);
  });
});
