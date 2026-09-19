/**
 * ORO.FTL.225.G — Minimum rest, flight crew, and ORO.FTL.265.G(b) —
 * Minimum rest, cabin crew.
 *
 * Flight crew (ORO.FTL.225.G): the greater of (a) as long as the preceding
 * duty period, or (b) 12h.
 * - Away from base, if earned rest = 12h and suitable accommodation is
 *   provided, may reduce by 1h (to 11h) — but if travel time
 *   aerodrome<->accommodation exceeds 30 min each way, rest must increase
 *   by the excess over 1 hour total travel; room must be available for
 *   >=10h; this reduction never applies once earned rest exceeds 12h.
 * - At home base, discretion may reduce rest by up to 1h but never below
 *   12h.
 * - ORO.FTL.225.G(e): "If the preceding duty period, which includes any
 *   time spent on positioning, exceeded 18 hours, then the ensuing rest
 *   period must include a local night." A local night is an 8-hour period
 *   falling between 2200 and 0800 local time (see `src/ftl/localNight.ts`).
 *   Independently verified against the primary GCAA source PDF (CAR-AIR
 *   OPS Part-ORO Issue 03) — see docs/gcaa-sources.md and
 *   docs/roster-gen-assumptions.md item 28. No cabin-crew equivalent was
 *   found in the verified text, so this sub-check is flight-crew only (see
 *   `evaluateLocalNightAfterExtendedDuty` below).
 *
 * Cabin crew (ORO.FTL.265.G(b)): the greater of (a) preceding duty period
 * minus 1h, or (b) 11h. At-base discretion floor: 11h. (The public text
 * given to this build does not specify an away-from-base reduction for
 * cabin crew analogous to the flight-crew one above, so this module does
 * not model one — see `docs/gcaa-sources.md`.)
 */

import type { CrewRole, RuleEvaluation } from '../types';
import { gcaaCitation } from '../citation';

export const MIN_REST_FLIGHT_CREW_CITATION = gcaaCitation(
  'gcaa-min-rest-flight-crew',
  'ORO.FTL.225.G'
);

export const MIN_REST_CABIN_CREW_CITATION = gcaaCitation(
  'gcaa-min-rest-cabin-crew',
  'ORO.FTL.265.G(b)'
);

export const MIN_REST_LOCAL_NIGHT_CITATION = gcaaCitation(
  'gcaa-min-rest-local-night-after-extended-duty',
  'ORO.FTL.225.G(e)'
);

const TWELVE_HOURS_MIN = 12 * 60;
const ELEVEN_HOURS_MIN = 11 * 60;
const AWAY_FROM_BASE_TRAVEL_ALLOWANCE_EACH_WAY_MIN = 30;
const AWAY_FROM_BASE_TOTAL_TRAVEL_ALLOWANCE_MIN = 60;
const AWAY_FROM_BASE_REDUCTION_MIN = 60;
/** ORO.FTL.225.G(e)'s trigger: a preceding duty exceeding this requires the ensuing rest to include a local night. */
const EXTENDED_DUTY_LOCAL_NIGHT_TRIGGER_MINUTES = 18 * 60;

export interface MinRestInput {
  precedingDutyMinutes: number;
  role: CrewRole;
  awayFromBase: boolean;
  suitableAccommodationProvided?: boolean;
  travelTimeEachWayMinutes?: number;
  /** The rest period actually planned/given, to check against the minimum. */
  earnedRestMinutes: number;
  /** Minutes of home-base discretion reduction applied (flight crew only). */
  atBaseDiscretionAppliedMinutes?: number;
  /**
   * Whether the rest period given actually includes a local night (see
   * `src/ftl/localNight.ts`'s `restPeriodIncludesLocalNight`) — only
   * relevant when `precedingDutyMinutes` exceeds 18h (ORO.FTL.225.G(e)).
   * `undefined` = not yet computed/known.
   */
  restIncludesLocalNight?: boolean;
}

function requiredMinRestFlightCrewMinutes(input: MinRestInput): number {
  const baseMinRestMinutes = Math.max(
    input.precedingDutyMinutes,
    TWELVE_HOURS_MIN
  );

  if (input.awayFromBase) {
    // The 1h reduction is only available when the greater-of formula
    // produced exactly the 12h floor (i.e. preceding duty <= 12h) — "never
    // applies once earned rest exceeds 12h".
    if (baseMinRestMinutes !== TWELVE_HOURS_MIN) {
      return baseMinRestMinutes;
    }
    if (!input.suitableAccommodationProvided) {
      return baseMinRestMinutes;
    }

    let required = TWELVE_HOURS_MIN - AWAY_FROM_BASE_REDUCTION_MIN; // 11h
    const travelEachWay = input.travelTimeEachWayMinutes ?? 0;
    if (travelEachWay > AWAY_FROM_BASE_TRAVEL_ALLOWANCE_EACH_WAY_MIN) {
      const totalTravel = travelEachWay * 2;
      const excessOverOneHour = Math.max(
        totalTravel - AWAY_FROM_BASE_TOTAL_TRAVEL_ALLOWANCE_MIN,
        0
      );
      required += excessOverOneHour;
    }
    return required;
  }

  // At home base: discretion may reduce by up to 1h but never below 12h.
  const discretionApplied = Math.min(
    input.atBaseDiscretionAppliedMinutes ?? 0,
    AWAY_FROM_BASE_REDUCTION_MIN
  );
  return Math.max(baseMinRestMinutes - discretionApplied, TWELVE_HOURS_MIN);
}

function requiredMinRestCabinCrewMinutes(input: MinRestInput): number {
  const baseMinRestMinutes = Math.max(
    input.precedingDutyMinutes - 60,
    ELEVEN_HOURS_MIN
  );

  if (input.awayFromBase) {
    return baseMinRestMinutes;
  }

  // At-base discretion floor: never below 11h.
  const discretionApplied = input.atBaseDiscretionAppliedMinutes ?? 0;
  return Math.max(baseMinRestMinutes - discretionApplied, ELEVEN_HOURS_MIN);
}

/**
 * Evaluates a rest period against the applicable minimum-rest rule for the
 * crew member's role.
 */
export function evaluateMinRest(input: MinRestInput): RuleEvaluation {
  if (
    !Number.isFinite(input.precedingDutyMinutes) ||
    input.precedingDutyMinutes < 0
  ) {
    throw new Error(
      `evaluateMinRest: precedingDutyMinutes must be a non-negative finite number (got ${input.precedingDutyMinutes})`
    );
  }
  if (
    !Number.isFinite(input.earnedRestMinutes) ||
    input.earnedRestMinutes < 0
  ) {
    throw new Error(
      `evaluateMinRest: earnedRestMinutes must be a non-negative finite number (got ${input.earnedRestMinutes})`
    );
  }

  const isFlightCrew = input.role === 'FLIGHT_CREW';
  const requiredMinutes = isFlightCrew
    ? requiredMinRestFlightCrewMinutes(input)
    : requiredMinRestCabinCrewMinutes(input);
  const citation = isFlightCrew
    ? MIN_REST_FLIGHT_CREW_CITATION
    : MIN_REST_CABIN_CREW_CITATION;
  const marginMinutes = input.earnedRestMinutes - requiredMinutes;

  if (marginMinutes < 0) {
    return {
      citation,
      severity: 'RED',
      message: `Earned rest (${input.earnedRestMinutes} min) is below the required minimum (${requiredMinutes} min) for ${input.role}.`,
      marginMinutes,
    };
  }

  return {
    citation,
    severity: 'GREEN',
    message: `Earned rest (${input.earnedRestMinutes} min) meets the required minimum (${requiredMinutes} min) for ${input.role}.`,
    marginMinutes,
  };
}

/**
 * ORO.FTL.225.G(e): if the preceding duty period exceeded 18h, the ensuing
 * rest period must include a local night. Flight crew only — no cabin-crew
 * equivalent was found in the verified primary text.
 *
 * Returns `null` when the trigger doesn't apply (preceding duty <=18h, or
 * cabin crew) — callers only surface a result when this returns non-null,
 * the same conditional-push pattern `src/ftl/evaluate.ts` already uses for
 * the in-flight-rest extension.
 */
export function evaluateLocalNightAfterExtendedDuty(
  input: MinRestInput
): RuleEvaluation | null {
  if (input.role !== 'FLIGHT_CREW') return null;
  if (input.precedingDutyMinutes <= EXTENDED_DUTY_LOCAL_NIGHT_TRIGGER_MINUTES) {
    return null;
  }

  if (input.restIncludesLocalNight === undefined) {
    return {
      citation: MIN_REST_LOCAL_NIGHT_CITATION,
      severity: 'AMBER',
      message: `Preceding duty (${input.precedingDutyMinutes} min) exceeded 18h, so the ensuing rest must include a local night — not yet confirmed whether it does.`,
    };
  }

  if (!input.restIncludesLocalNight) {
    return {
      citation: MIN_REST_LOCAL_NIGHT_CITATION,
      severity: 'RED',
      message: `Preceding duty (${input.precedingDutyMinutes} min) exceeded 18h; the ensuing rest does not include a local night, as required.`,
    };
  }

  return {
    citation: MIN_REST_LOCAL_NIGHT_CITATION,
    severity: 'GREEN',
    message: `Preceding duty (${input.precedingDutyMinutes} min) exceeded 18h; the ensuing rest includes a local night, as required.`,
  };
}
