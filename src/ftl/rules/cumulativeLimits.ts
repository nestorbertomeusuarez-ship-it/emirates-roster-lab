/**
 * ORO.FTL.200.G — Cumulative limits.
 *
 * Flight time: <=100 block hours/28 consecutive days; <=900 block
 * hours/12 consecutive months.
 * Duty hours: <=55h/7 consecutive days (may extend to 60h if a rostered
 * series of duties, once commenced, is disrupted by unforeseen delay);
 * <=95h/14 consecutive days; <=190h/28 consecutive days.
 *
 * The public text given to this build states these limits without
 * distinguishing flight crew from cabin crew, so they are applied
 * regardless of role — see `docs/gcaa-sources.md`.
 */

import type { CumulativeTotals, RuleEvaluation } from '../types';
import { gcaaCitation } from '../citation';

export const CUMULATIVE_LIMITS_CITATION = gcaaCitation(
  'gcaa-cumulative-limits',
  'ORO.FTL.200.G'
);

const LIMITS_MIN = {
  blockMinutes28d: 100 * 60,
  blockMinutes12mo: 900 * 60,
  dutyMinutes7dNormal: 55 * 60,
  dutyMinutes7dDisrupted: 60 * 60,
  dutyMinutes14d: 95 * 60,
  dutyMinutes28d: 190 * 60,
} as const;

export interface CumulativeLimitsOptions {
  /**
   * True if the 7-day duty-hours figure is allowed to use the extended 60h
   * ceiling because a rostered series of duties, once commenced, was
   * disrupted by unforeseen delay. Defaults to false (55h ceiling).
   */
  sevenDayUnforeseenDisruption?: boolean;
}

function checkLimit(
  ruleId: string,
  label: string,
  actualMinutes: number,
  limitMinutes: number
): RuleEvaluation {
  if (!Number.isFinite(actualMinutes) || actualMinutes < 0) {
    throw new Error(
      `evaluateCumulativeLimits: ${label} must be a non-negative finite number (got ${actualMinutes})`
    );
  }

  const marginMinutes = limitMinutes - actualMinutes;
  return {
    citation: { ...CUMULATIVE_LIMITS_CITATION, ruleId },
    severity: marginMinutes < 0 ? 'RED' : 'GREEN',
    message: `${label}: ${actualMinutes} min against a limit of ${limitMinutes} min.`,
    marginMinutes,
  };
}

/**
 * Evaluates every ORO.FTL.200.G cumulative limit against the supplied
 * totals, returning one `RuleEvaluation` per sub-limit.
 */
export function evaluateCumulativeLimits(
  totals: CumulativeTotals,
  options: CumulativeLimitsOptions = {}
): RuleEvaluation[] {
  const dutyMinutes7dLimit = options.sevenDayUnforeseenDisruption
    ? LIMITS_MIN.dutyMinutes7dDisrupted
    : LIMITS_MIN.dutyMinutes7dNormal;

  return [
    checkLimit(
      'gcaa-cumulative-block-28d',
      '100h/28-day block time',
      totals.blockMinutes28d,
      LIMITS_MIN.blockMinutes28d
    ),
    checkLimit(
      'gcaa-cumulative-block-12mo',
      '900h/12-month block time',
      totals.blockMinutes12mo,
      LIMITS_MIN.blockMinutes12mo
    ),
    checkLimit(
      'gcaa-cumulative-duty-7d',
      `${options.sevenDayUnforeseenDisruption ? '60h (disrupted-series)' : '55h'}/7-day duty time`,
      totals.dutyMinutes7d,
      dutyMinutes7dLimit
    ),
    checkLimit(
      'gcaa-cumulative-duty-14d',
      '95h/14-day duty time',
      totals.dutyMinutes14d,
      LIMITS_MIN.dutyMinutes14d
    ),
    checkLimit(
      'gcaa-cumulative-duty-28d',
      '190h/28-day duty time',
      totals.dutyMinutes28d,
      LIMITS_MIN.dutyMinutes28d
    ),
  ];
}
