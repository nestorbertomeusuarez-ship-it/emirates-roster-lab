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
 * - Recurrent extended recovery rest: at least 36 hours including 2 local
 *   nights, occurring at least once every 168 hours (7 days) — see
 *   `EXTENDED_RECOVERY_REST_*` constants below.
 *
 * SOURCE NOTE on the recurrent-extended-recovery-rest sub-check
 * (`gcaa-days-off-extended-recovery-rest`): added on DIRECT PILOT
 * CONFIRMATION (an actual Emirates line pilot, this app's real user,
 * confirming GCAA's rule is structurally identical to EASA's own
 * ORO.FTL.235 "recurrent extended recovery rest" provision) — the primary
 * GCAA source PDF was unreachable (gcaa.gov.ae serving a maintenance page)
 * when this was implemented, so the exact clause/numbers were NOT
 * independently re-verified against GCAA's own text the way every other
 * sub-check in this file was. Same footing as `src/ftl/operatorConfig.ts`'s
 * "confirmed no pairings cap" precedent — a real domain-expert
 * confirmation, not a re-verified document citation. Re-verify against the
 * primary source once reachable (see docs/gcaa-sources.md) and correct
 * this note (and the citation clause, if it turns out to differ) if the
 * real text says something else.
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

/** Minimum length, in hours, of a qualifying "recurrent extended recovery rest" period. */
export const EXTENDED_RECOVERY_REST_MIN_HOURS = 36;
/** Minimum distinct local nights (`src/ftl/localNight.ts`) a qualifying period must include. */
export const EXTENDED_RECOVERY_REST_MIN_LOCAL_NIGHTS = 2;
/** Maximum hours permitted between the end of one qualifying period and the start of the next. */
export const EXTENDED_RECOVERY_REST_MAX_GAP_HOURS = 168;

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
 * Returns true if a rest period qualifies as a "recurrent extended
 * recovery rest": at least `EXTENDED_RECOVERY_REST_MIN_HOURS`, including at
 * least `EXTENDED_RECOVERY_REST_MIN_LOCAL_NIGHTS` local nights.
 */
export function isQualifyingExtendedRecoveryRest(
  restMinutes: number,
  localNightsIncluded: number
): boolean {
  if (!Number.isFinite(restMinutes) || restMinutes < 0) {
    throw new Error(
      `isQualifyingExtendedRecoveryRest: restMinutes must be a non-negative finite number (got ${restMinutes})`
    );
  }
  if (!Number.isInteger(localNightsIncluded) || localNightsIncluded < 0) {
    throw new Error(
      `isQualifyingExtendedRecoveryRest: localNightsIncluded must be a non-negative integer (got ${localNightsIncluded})`
    );
  }
  return (
    restMinutes >= EXTENDED_RECOVERY_REST_MIN_HOURS * 60 &&
    localNightsIncluded >= EXTENDED_RECOVERY_REST_MIN_LOCAL_NIGHTS
  );
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

  evaluations.push({
    citation: { ...DAYS_OFF_CITATION, ruleId: 'gcaa-days-off-extended-recovery-rest' },
    severity:
      totals.hoursSinceLastQualifyingExtendedRecoveryRest <= EXTENDED_RECOVERY_REST_MAX_GAP_HOURS
        ? 'GREEN'
        : 'RED',
    message: `${totals.hoursSinceLastQualifyingExtendedRecoveryRest.toFixed(1)}h since the last qualifying recurrent extended recovery rest (>=${EXTENDED_RECOVERY_REST_MIN_HOURS}h including >=${EXTENDED_RECOVERY_REST_MIN_LOCAL_NIGHTS} local nights); maximum ${EXTENDED_RECOVERY_REST_MAX_GAP_HOURS}h between qualifying periods. NOT independently verified against the primary GCAA text yet — see this file's own module doc comment.`,
  });

  return evaluations;
}
