/**
 * ORO.FTL.230.G — Commander's discretion, and ORO.FTL.220.G — Split duty
 * extension.
 *
 * These are situational, pilot/dispatcher-initiated checks rather than a
 * background check every duty needs, so they are exposed as standalone
 * functions (not wired into `evaluate.ts`'s default `evaluateDuty` run) for
 * a caller — a future pairing engine or a UI action — to invoke explicitly
 * when discretion or split duty actually applies to a specific duty.
 */

import type { RuleEvaluation } from '../types';
import { gcaaCitation } from '../citation';

export const COMMANDER_DISCRETION_CITATION = gcaaCitation(
  'gcaa-commander-discretion',
  'ORO.FTL.230.G'
);

export const SPLIT_DUTY_CITATION = gcaaCitation(
  'gcaa-split-duty-extension',
  'ORO.FTL.220.G'
);

const MAX_DISCRETION_MIN = 3 * 60;
const MAX_MID_DUTY_DISCRETION_MIN = 2 * 60;
const REPORT_REQUIRED_THRESHOLD_MIN = 2 * 60;
const REPORT_DEADLINE_DAYS = 14;

export interface CommanderDiscretionInput {
  extensionMinutesRequested: number;
  isEmergency: boolean;
  /**
   * True if this is a single-sector flight, or this discretion is being
   * exercised immediately before the last sector of a multi-sector flight
   * — the only cases where the full 3h may be used. False means it is
   * before the first/a subsequent (non-last) sector of a multi-sector FDP,
   * where at most 2h may be used.
   */
  isSingleSectorOrLastSectorOfMultiSector: boolean;
  /**
   * True if this discretion extension would be combined with another
   * rest-reduction/duty-extension provision in the same Subpart in the
   * same FDP — never permitted.
   */
  combinedWithOtherReductionProvision: boolean;
  /** True if this FDP was preceded by a reduced rest period. */
  precededByReducedRest: boolean;
}

/**
 * Evaluates a commander's-discretion extension request against
 * ORO.FTL.230.G: the 3h cap (unlimited only for a genuine emergency), the
 * 2h mid-duty sub-cap, the never-combine-with-other-reductions rule, and
 * the >2h / post-reduced-rest written-report-within-14-days obligation.
 */
export function evaluateCommanderDiscretion(
  input: CommanderDiscretionInput
): RuleEvaluation {
  const {
    extensionMinutesRequested,
    isEmergency,
    isSingleSectorOrLastSectorOfMultiSector,
    combinedWithOtherReductionProvision,
    precededByReducedRest,
  } = input;

  if (
    !Number.isFinite(extensionMinutesRequested) ||
    extensionMinutesRequested < 0
  ) {
    throw new Error(
      `evaluateCommanderDiscretion: extensionMinutesRequested must be a non-negative finite number (got ${extensionMinutesRequested})`
    );
  }

  if (combinedWithOtherReductionProvision) {
    return {
      citation: COMMANDER_DISCRETION_CITATION,
      severity: 'RED',
      message:
        'Commander\'s discretion may never be combined with another rest-reduction/duty-extension provision in the same Subpart within the same FDP.',
    };
  }

  const applicableCapMin = isSingleSectorOrLastSectorOfMultiSector
    ? MAX_DISCRETION_MIN
    : MAX_MID_DUTY_DISCRETION_MIN;

  if (!isEmergency && extensionMinutesRequested > MAX_DISCRETION_MIN) {
    return {
      citation: COMMANDER_DISCRETION_CITATION,
      severity: 'RED',
      message: `Requested extension (${extensionMinutesRequested} min) exceeds the absolute 3h commander's-discretion cap (non-emergency).`,
      marginMinutes: MAX_DISCRETION_MIN - extensionMinutesRequested,
    };
  }

  if (
    !isEmergency &&
    !isSingleSectorOrLastSectorOfMultiSector &&
    extensionMinutesRequested > MAX_MID_DUTY_DISCRETION_MIN
  ) {
    return {
      citation: COMMANDER_DISCRETION_CITATION,
      severity: 'RED',
      message: `Requested extension (${extensionMinutesRequested} min) exceeds the 2h cap that applies before the first/a subsequent (non-last) sector of a multi-sector FDP. Full 3h discretion is only available for a single-sector flight or immediately before the last sector.`,
      marginMinutes: MAX_MID_DUTY_DISCRETION_MIN - extensionMinutesRequested,
    };
  }

  const requiresReport =
    extensionMinutesRequested > REPORT_REQUIRED_THRESHOLD_MIN ||
    precededByReducedRest;

  if (requiresReport) {
    return {
      citation: COMMANDER_DISCRETION_CITATION,
      severity: 'AMBER',
      message: `Discretion extension permitted (${extensionMinutesRequested} min, cap ${applicableCapMin} min), but a written report to GCAA is required within ${REPORT_DEADLINE_DAYS} days (extension >2h, or exercised after a reduced rest period).`,
      marginMinutes: applicableCapMin - extensionMinutesRequested,
    };
  }

  return {
    citation: COMMANDER_DISCRETION_CITATION,
    severity: 'GREEN',
    message: `Discretion extension permitted (${extensionMinutesRequested} min, cap ${applicableCapMin} min). No GCAA report required.`,
    marginMinutes: applicableCapMin - extensionMinutesRequested,
  };
}

const SPLIT_DUTY_MIN_REST_FOR_ANY_EXTENSION_MIN = 3 * 60;
const SPLIT_DUTY_MAX_TABLE_REST_MIN = 10 * 60;
const SPLIT_DUTY_SHORT_REST_FACILITY_THRESHOLD_MIN = 6 * 60;

export interface SplitDutyInput {
  /**
   * Consecutive rest actually taken during the split, excluding the
   * minimum 30-minute immediate pre/post-flight-duty allowance (which is
   * not creditable rest time).
   */
  consecutiveRestMinutesTaken: number;
  restFacility: 'RECLINING_SEAT' | 'BUNK' | 'NONE';
}

/**
 * Evaluates a split-duty extension against ORO.FTL.220.G.
 *
 * | Consecutive rest taken | Max FDP extension |
 * |---|---|
 * | <3h    | Nil |
 * | 3-10h  | half of the rest hours taken |
 *
 * The published table tops out at 10h; this implementation caps the
 * extension at the 10h-row value for any rest beyond 10h rather than
 * extrapolating past the public table (a judgment call — see
 * `docs/gcaa-sources.md`).
 *
 * Facility requirement: rest <=6h needs a reclining seat (>40 deg recline)
 * or bunk; rest >6h needs suitable accommodation (modeled here as any
 * facility other than 'NONE').
 */
export function evaluateSplitDutyExtension(
  input: SplitDutyInput
): RuleEvaluation {
  const { consecutiveRestMinutesTaken, restFacility } = input;

  if (
    !Number.isFinite(consecutiveRestMinutesTaken) ||
    consecutiveRestMinutesTaken < 0
  ) {
    throw new Error(
      `evaluateSplitDutyExtension: consecutiveRestMinutesTaken must be a non-negative finite number (got ${consecutiveRestMinutesTaken})`
    );
  }

  if (consecutiveRestMinutesTaken < SPLIT_DUTY_MIN_REST_FOR_ANY_EXTENSION_MIN) {
    return {
      citation: SPLIT_DUTY_CITATION,
      severity: 'GREEN',
      message: `Rest taken (${consecutiveRestMinutesTaken} min) is under 3h: no FDP extension applies (Nil).`,
      marginMinutes: 0,
    };
  }

  if (
    consecutiveRestMinutesTaken <= SPLIT_DUTY_SHORT_REST_FACILITY_THRESHOLD_MIN &&
    restFacility === 'NONE'
  ) {
    return {
      citation: SPLIT_DUTY_CITATION,
      severity: 'RED',
      message: `A split-duty rest of <=6h (${consecutiveRestMinutesTaken} min) requires a reclining seat (>40deg recline) or bunk; none was provided.`,
    };
  }

  if (
    consecutiveRestMinutesTaken > SPLIT_DUTY_SHORT_REST_FACILITY_THRESHOLD_MIN &&
    restFacility === 'NONE'
  ) {
    return {
      citation: SPLIT_DUTY_CITATION,
      severity: 'RED',
      message: `A split-duty rest of >6h (${consecutiveRestMinutesTaken} min) requires suitable accommodation; none was provided.`,
    };
  }

  const cappedRestMinutes = Math.min(
    consecutiveRestMinutesTaken,
    SPLIT_DUTY_MAX_TABLE_REST_MIN
  );
  const extensionMinutes = cappedRestMinutes / 2;
  const cappedNote =
    consecutiveRestMinutesTaken > SPLIT_DUTY_MAX_TABLE_REST_MIN
      ? ' (capped at the published 10h-row value; the public table does not extend beyond 10h)'
      : '';

  return {
    citation: SPLIT_DUTY_CITATION,
    severity: 'GREEN',
    message: `Split-duty rest of ${consecutiveRestMinutesTaken} min permits a max FDP extension of ${extensionMinutes} min (half the rest taken)${cappedNote}.`,
    marginMinutes: extensionMinutes,
  };
}
