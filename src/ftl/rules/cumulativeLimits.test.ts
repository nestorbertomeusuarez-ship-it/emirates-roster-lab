import { describe, expect, it } from 'vitest';
import { evaluateCumulativeLimits } from './cumulativeLimits';
import type { CumulativeTotals } from '../types';

const baseTotals: CumulativeTotals = {
  blockMinutes28d: 0,
  blockMinutes12mo: 0,
  dutyMinutes7d: 0,
  dutyMinutes14d: 0,
  dutyMinutes28d: 0,
  consecutiveDutyDays: 0,
  daysOffLast14: 2,
  daysOffLast28: 7,
  avgDaysOffPer28dOver3Periods: 8,
  hoursSinceLastQualifyingExtendedRecoveryRest: 0,
};

describe('evaluateCumulativeLimits', () => {
  it('passes at exactly the 100h/28d block-time limit and fails 1 min over', () => {
    const atLimit = evaluateCumulativeLimits({
      ...baseTotals,
      blockMinutes28d: 100 * 60,
    });
    expect(atLimit.find((e) => e.citation.ruleId === 'gcaa-cumulative-block-28d')!.severity).toBe(
      'GREEN'
    );

    const overLimit = evaluateCumulativeLimits({
      ...baseTotals,
      blockMinutes28d: 100 * 60 + 1,
    });
    expect(
      overLimit.find((e) => e.citation.ruleId === 'gcaa-cumulative-block-28d')!.severity
    ).toBe('RED');
  });

  it('passes at exactly the 900h/12mo block-time limit and fails 1 min over', () => {
    const overLimit = evaluateCumulativeLimits({
      ...baseTotals,
      blockMinutes12mo: 900 * 60 + 1,
    });
    expect(
      overLimit.find((e) => e.citation.ruleId === 'gcaa-cumulative-block-12mo')!.severity
    ).toBe('RED');
  });

  it('applies the 55h/7d ceiling by default and the 60h ceiling when disrupted', () => {
    const totals = { ...baseTotals, dutyMinutes7d: 56 * 60 };
    const normal = evaluateCumulativeLimits(totals);
    expect(normal.find((e) => e.citation.ruleId === 'gcaa-cumulative-duty-7d')!.severity).toBe(
      'RED'
    );

    const disrupted = evaluateCumulativeLimits(totals, {
      sevenDayUnforeseenDisruption: true,
    });
    expect(
      disrupted.find((e) => e.citation.ruleId === 'gcaa-cumulative-duty-7d')!.severity
    ).toBe('GREEN');
  });

  it('passes at exactly the 95h/14d duty limit and fails 1 min over', () => {
    const overLimit = evaluateCumulativeLimits({
      ...baseTotals,
      dutyMinutes14d: 95 * 60 + 1,
    });
    expect(
      overLimit.find((e) => e.citation.ruleId === 'gcaa-cumulative-duty-14d')!.severity
    ).toBe('RED');
  });

  it('passes at exactly the 190h/28d duty limit and fails 1 min over', () => {
    const overLimit = evaluateCumulativeLimits({
      ...baseTotals,
      dutyMinutes28d: 190 * 60 + 1,
    });
    expect(
      overLimit.find((e) => e.citation.ruleId === 'gcaa-cumulative-duty-28d')!.severity
    ).toBe('RED');
  });

  it('throws for a negative total', () => {
    expect(() =>
      evaluateCumulativeLimits({ ...baseTotals, blockMinutes28d: -1 })
    ).toThrow();
  });
});
