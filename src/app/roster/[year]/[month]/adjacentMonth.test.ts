import { describe, expect, it } from 'vitest';
import { nextMonth, previousMonth } from './adjacentMonth';

describe('previousMonth', () => {
  it('steps back within the same year', () => {
    expect(previousMonth({ year: 2026, month: 10 })).toEqual({ year: 2026, month: 9 });
  });

  it('rolls over from January to December of the previous year', () => {
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
  });
});

describe('nextMonth', () => {
  it('steps forward within the same year', () => {
    expect(nextMonth({ year: 2026, month: 9 })).toEqual({ year: 2026, month: 10 });
  });

  it('rolls over from December to January of the next year', () => {
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
  });
});
