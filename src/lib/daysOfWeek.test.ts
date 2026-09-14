import { describe, expect, it } from 'vitest';
import {
  booleansToDaysOfWeek,
  daysOfWeekToBooleans,
  daysOfWeekToLabel,
  daysOfWeekToLabels,
  isValidDaysOfWeek,
} from './daysOfWeek';

describe('isValidDaysOfWeek', () => {
  it('accepts a valid 7-char string of 0s and 1s', () => {
    expect(isValidDaysOfWeek('1111100')).toBe(true);
    expect(isValidDaysOfWeek('0000000')).toBe(true);
    expect(isValidDaysOfWeek('1111111')).toBe(true);
  });

  it('rejects strings that are too short or too long', () => {
    expect(isValidDaysOfWeek('111110')).toBe(false);
    expect(isValidDaysOfWeek('11111000')).toBe(false);
    expect(isValidDaysOfWeek('')).toBe(false);
  });

  it('rejects strings with invalid characters', () => {
    expect(isValidDaysOfWeek('111110x')).toBe(false);
    expect(isValidDaysOfWeek('1111 00')).toBe(false);
    expect(isValidDaysOfWeek('222222')).toBe(false);
  });
});

describe('daysOfWeekToBooleans / booleansToDaysOfWeek', () => {
  it('round-trips a Mon-Fri pattern', () => {
    const bools = daysOfWeekToBooleans('1111100');
    expect(bools).toEqual([true, true, true, true, true, false, false]);
    expect(booleansToDaysOfWeek(bools)).toBe('1111100');
  });

  it('round-trips an all-off pattern', () => {
    expect(daysOfWeekToBooleans('0000000')).toEqual(new Array(7).fill(false));
  });

  it('round-trips a single-day pattern', () => {
    expect(daysOfWeekToBooleans('0000001')).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('throws for an invalid string', () => {
    expect(() => daysOfWeekToBooleans('bad')).toThrow();
  });

  it('throws when encoding an array with the wrong length', () => {
    expect(() => booleansToDaysOfWeek([true, false])).toThrow();
  });
});

describe('daysOfWeekToLabels', () => {
  it('returns only the active weekday labels', () => {
    expect(daysOfWeekToLabels('1010001')).toEqual(['Mon', 'Wed', 'Sun']);
  });
});

describe('daysOfWeekToLabel', () => {
  it('returns "Daily" for all days set', () => {
    expect(daysOfWeekToLabel('1111111')).toBe('Daily');
  });

  it('returns "None" for all days off', () => {
    expect(daysOfWeekToLabel('0000000')).toBe('None');
  });

  it('returns a range label for a contiguous run', () => {
    expect(daysOfWeekToLabel('1111100')).toBe('Mon-Fri');
  });

  it('returns a single day label for a single day (no dash)', () => {
    expect(daysOfWeekToLabel('0000001')).toBe('Sun');
  });

  it('returns a comma list for a non-contiguous set', () => {
    expect(daysOfWeekToLabel('1010100')).toBe('Mon, Wed, Fri');
  });

  it('throws for an invalid daysOfWeek string', () => {
    expect(() => daysOfWeekToLabel('nope')).toThrow();
  });
});
