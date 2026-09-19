/**
 * ORO.FTL.205.G — Duty cycle and days off.
 *
 * - Not on duty more than 7 consecutive days without a day off (an 8th day
 *   only under unforeseen circumstances, followed by >=2 consecutive days
 *   off).
 * - 2 consecutive days off in any 14 consecutive days.
 * - Minimum 7 days off in any 28 consecutive days.
 * - Average >=8 days off per 28-day period, averaged over 3 such periods.
 * - A "day off" = a period including 2 local nights, minimum 34 hours.
 *
 * NOTE: an earlier version of this file also implemented a "recurrent
 * extended recovery rest" sub-check (>=36h including >=2 local nights, at
 * least once every 168h) under this same clause, added on direct pilot
 * confirmation while the primary GCAA source PDF was unreachable. Once the
 * primary source came back online, independent re-verification found GCAA's
 * actual ORO.FTL.205.G text does NOT contain that provision — it was
 * EASA's ORO.FTL.235 (a differently-numbered clause GCAA does not mirror
 * here; GCAA's own ORO.FTL.235.G is "Mixed duties", unrelated). Removed —
 * see docs/roster-gen-assumptions.md item 28 for the correction and
 * docs/gcaa-sources.md for the resolved citation history.
 */

import type { CumulativeTotals, RuleEvaluation } from '../types';
import { gcaaCitation } from '../citation';

export const DAYS_OFF_CITATION = gcaaCitation('gcaa-days-off', 'ORO.FTL.205.G');

const MAX_CONSECUTIVE_DUTY_DAYS_NORMAL = 7;
const MAX_CONSECUTIVE_DUTY_DAYS_WITH_EXCEPTION = 8;
const MIN_CONSECUTIVE_DAYS_OFF_IN_14 = 2;
const MIN_DAYS_OFF_IN_28 = 7;
const MIN_AVG_DAYS_OFF_PER_28D_OVER_3_PERIODS = 8;
const DAY_OFF_MIN_HOURS = 34;

/**
 * Returns true if a candidate "day off" period qualifies under
 * ORO.FTL.205.G: at least 34 hours, including 2 local nights.
 */
export function isValidDayOffPeriod(
  periodHours: number,
  includesTwoLocalNights: boolean
): boolean {
  if (!Number.isFinite(periodHours) || periodHours < 0) {
    throw new Error(
      `isValidDayOffPeriod: periodHours must be a non-negative finite number (got ${periodHours})`
    );
  }
  return periodHours >= DAY_OFF_MIN_HOURS && includesTwoLocalNights;
}

/**
 * Evaluates every ORO.FTL.205.G duty-cycle/days-off check against the
 * supplied totals, returning one `RuleEvaluation` per sub-check.
 */
export function evaluateDaysOff(totals: CumulativeTotals): RuleEvaluation[] {
  if (
    !Number.isInteger(totals.consecutiveDutyDays) ||
    totals.consecutiveDutyDays < 0
  ) {
    throw new Error(
      `evaluateDaysOff: consecutiveDutyDays must be a non-negative integer (got ${totals.consecutiveDutyDays})`
    );
  }

  const evaluations: RuleEvaluation[] = [];

  if (totals.consecutiveDutyDays > MAX_CONSECUTIVE_DUTY_DAYS_WITH_EXCEPTION) {
    evaluations.push({
      citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-consecutive-duty' },
      severity: 'RED',
      message: `${totals.consecutiveDutyDays} consecutive duty days exceeds the absolute 8-day ceiling.`,
    });
  } else if (
    totals.consecutiveDutyDays === MAX_CONSECUTIVE_DUTY_DAYS_WITH_EXCEPTION
  ) {
    if (!totals.eighthConsecutiveDayJustifiedByUnforeseenCircumstances) {
      evaluations.push({
        citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-consecutive-duty' },
        severity: 'RED',
        message:
          'An 8th consecutive duty day is only permitted under unforeseen circumstances; none were recorded.',
      });
    } else if (totals.followedByAtLeastTwoConsecutiveDaysOff === false) {
      evaluations.push({
        citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-consecutive-duty' },
        severity: 'RED',
        message:
          'An 8th consecutive duty day (justified by unforeseen circumstances) must be followed by at least 2 consecutive days off; this was not observed.',
      });
    } else if (totals.followedByAtLeastTwoConsecutiveDaysOff === undefined) {
      evaluations.push({
        citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-consecutive-duty' },
        severity: 'AMBER',
        message:
          '8th consecutive duty day justified by unforeseen circumstances; still requires >=2 consecutive days off to follow (not yet confirmed).',
      });
    } else {
      evaluations.push({
        citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-consecutive-duty' },
        severity: 'GREEN',
        message:
          '8th consecutive duty day justified by unforeseen circumstances and followed by >=2 consecutive days off.',
      });
    }
  } else if (totals.consecutiveDutyDays > MAX_CONSECUTIVE_DUTY_DAYS_NORMAL) {
    // Unreachable given the branches above, kept for clarity/defensiveness.
    evaluations.push({
      citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-consecutive-duty' },
      severity: 'RED',
      message: `${totals.consecutiveDutyDays} consecutive duty days exceeds 7 without qualifying for the 8th-day exception.`,
    });
  } else {
    evaluations.push({
      citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-consecutive-duty' },
      severity: 'GREEN',
      message: `${totals.consecutiveDutyDays} consecutive duty days is within the 7-day limit.`,
    });
  }

  evaluations.push({
    citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-2-in-14' },
    severity: totals.daysOffLast14 >= MIN_CONSECUTIVE_DAYS_OFF_IN_14 ? 'GREEN' : 'RED',
    message: `${totals.daysOffLast14} days off in the last 14 days (minimum ${MIN_CONSECUTIVE_DAYS_OFF_IN_14} consecutive required).`,
  });

  evaluations.push({
    citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-7-in-28' },
    severity: totals.daysOffLast28 >= MIN_DAYS_OFF_IN_28 ? 'GREEN' : 'RED',
    message: `${totals.daysOffLast28} days off in the last 28 days (minimum ${MIN_DAYS_OFF_IN_28} required).`,
  });

  evaluations.push({
    citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-avg-8-per-28-over-3' },
    severity:
      totals.avgDaysOffPer28dOver3Periods >= MIN_AVG_DAYS_OFF_PER_28D_OVER_3_PERIODS
        ? 'GREEN'
        : 'RED',
    message: `Average of ${totals.avgDaysOffPer28dOver3Periods} days off per 28-day period over 3 periods (minimum ${MIN_AVG_DAYS_OFF_PER_28D_OVER_3_PERIODS} required).`,
  });

  return evaluations;
}
