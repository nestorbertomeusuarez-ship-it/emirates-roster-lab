import { describe, expect, it } from 'vitest';
import { evaluateDaysOff, isValidDayOffPeriod } from './daysOff';
import type { CumulativeTotals } from '../types';

const baseTotals: CumulativeTotals = {
  blockMinutes28d: 0,
  blockMinutes12mo: 0,
  dutyMinutes7d: 0,
  dutyMinutes14d: 0,
  dutyMinutes28d: 0,
  consecutiveDutyDays: 5,
  daysOffLast14: 2,
  daysOffLast28: 7,
  avgDaysOffPer28dOver3Periods: 8,
};

function find(totals: CumulativeTotals, ruleId: string) {
  return evaluateDaysOff(totals).find((e) => e.citation.ruleId === ruleId)!;
}

describe('evaluateDaysOff — consecutive duty days', () => {
  it('passes at exactly 7 consecutive duty days', () => {
    expect(
      find({ ...baseTotals, consecutiveDutyDays: 7 }, 'gcaa-days-off-consecutive-duty')
        .severity
    ).toBe('GREEN');
  });

  it('fails at 8 consecutive days without unforeseen-circumstances justification', () => {
    expect(
      find(
        {
          ...baseTotals,
          consecutiveDutyDays: 8,
          eighthConsecutiveDayJustifiedByUnforeseenCircumstances: false,
        },
        'gcaa-days-off-consecutive-duty'
      ).severity
    ).toBe('RED');
  });

  it('is AMBER at 8 justified consecutive days pending confirmation of 2 days off after', () => {
    expect(
      find(
        {
          ...baseTotals,
          consecutiveDutyDays: 8,
          eighthConsecutiveDayJustifiedByUnforeseenCircumstances: true,
        },
        'gcaa-days-off-consecutive-duty'
      ).severity
    ).toBe('AMBER');
  });

  it('is GREEN at 8 justified consecutive days followed by >=2 days off', () => {
    expect(
      find(
        {
          ...baseTotals,
          consecutiveDutyDays: 8,
          eighthConsecutiveDayJustifiedByUnforeseenCircumstances: true,
          followedByAtLeastTwoConsecutiveDaysOff: true,
        },
        'gcaa-days-off-consecutive-duty'
      ).severity
    ).toBe('GREEN');
  });

  it('fails at 9 consecutive duty days regardless of justification', () => {
    expect(
      find(
        {
          ...baseTotals,
          consecutiveDutyDays: 9,
          eighthConsecutiveDayJustifiedByUnforeseenCircumstances: true,
          followedByAtLeastTwoConsecutiveDaysOff: true,
        },
        'gcaa-days-off-consecutive-duty'
      ).severity
    ).toBe('RED');
  });
});

describe('evaluateDaysOff — other sub-checks', () => {
  it('passes at exactly 2 days off in 14 and fails at 1', () => {
    expect(find({ ...baseTotals, daysOffLast14: 2 }, 'gcaa-days-off-2-in-14').severity).toBe(
      'GREEN'
    );
    expect(find({ ...baseTotals, daysOffLast14: 1 }, 'gcaa-days-off-2-in-14').severity).toBe(
      'RED'
    );
  });

  it('passes at exactly 7 days off in 28 and fails at 6', () => {
    expect(find({ ...baseTotals, daysOffLast28: 7 }, 'gcaa-days-off-7-in-28').severity).toBe(
      'GREEN'
    );
    expect(find({ ...baseTotals, daysOffLast28: 6 }, 'gcaa-days-off-7-in-28').severity).toBe(
      'RED'
    );
  });

  it('passes at exactly an average of 8 days off and fails below it', () => {
    expect(
      find({ ...baseTotals, avgDaysOffPer28dOver3Periods: 8 }, 'gcaa-days-off-avg-8-per-28-over-3')
        .severity
    ).toBe('GREEN');
    expect(
      find(
        { ...baseTotals, avgDaysOffPer28dOver3Periods: 7.9 },
        'gcaa-days-off-avg-8-per-28-over-3'
      ).severity
    ).toBe('RED');
  });
});

describe('isValidDayOffPeriod', () => {
  it('is valid at exactly 34h with 2 local nights', () => {
    expect(isValidDayOffPeriod(34, true)).toBe(true);
  });

  it('is invalid just under 34h even with 2 local nights', () => {
    expect(isValidDayOffPeriod(33.9, true)).toBe(false);
  });

  it('is invalid at 34h+ without 2 local nights', () => {
    expect(isValidDayOffPeriod(40, false)).toBe(false);
  });

  it('throws for a negative period', () => {
    expect(() => isValidDayOffPeriod(-1, true)).toThrow();
  });
});
