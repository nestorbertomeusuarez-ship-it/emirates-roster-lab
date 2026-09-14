/**
 * ORO.FTL.115.G(1) — Acclimatisation.
 *
 * A crew member is "acclimatised" after 3 consecutive local nights on the
 * ground within a local time zone band 2 hours wide, with uninterrupted
 * night sleep possible. They remain acclimatised until a duty period
 * finishes where local time differs by more than 2 hours from the
 * departure point.
 *
 * Modeled as two independent, pure checks rather than one function, since
 * "becoming acclimatised" and "remaining acclimatised" are evaluated at
 * different points in a roster and a caller may only need one of them.
 */

import { gcaaCitation } from '../citation';

export const ACCLIMATISATION_CITATION = gcaaCitation(
  'gcaa-acclimatisation',
  'ORO.FTL.115.G(1)'
);

/**
 * Returns true if the 3-consecutive-local-nights acclimatisation threshold
 * has been achieved.
 *
 * @param consecutiveLocalNightsOnGround number of consecutive local nights
 *   spent on the ground within `timeZoneBandHours`.
 * @param timeZoneBandHours width, in hours, of the local time zone band
 *   those nights were spent in (must be <= 2 to qualify).
 * @param uninterruptedSleepPossible whether uninterrupted night sleep was
 *   possible during those nights.
 */
export function hasAchievedAcclimatisation(
  consecutiveLocalNightsOnGround: number,
  timeZoneBandHours: number,
  uninterruptedSleepPossible: boolean
): boolean {
  if (
    !Number.isFinite(consecutiveLocalNightsOnGround) ||
    !Number.isFinite(timeZoneBandHours)
  ) {
    throw new Error(
      `hasAchievedAcclimatisation: consecutiveLocalNightsOnGround and timeZoneBandHours must be finite numbers (got ${consecutiveLocalNightsOnGround}, ${timeZoneBandHours})`
    );
  }

  return (
    consecutiveLocalNightsOnGround >= 3 &&
    timeZoneBandHours <= 2 &&
    uninterruptedSleepPossible
  );
}

/**
 * Returns whether acclimatisation status carries forward once a duty
 * period finishes. Acclimatisation is lost (returns false) if the local
 * time at the end of that duty differs by more than 2 hours from the
 * departure point's local time, regardless of prior status.
 *
 * @param wasAcclimatised acclimatisation status going into the duty.
 * @param localTimeDifferenceAtDutyEndHours absolute difference, in hours,
 *   between local time at the duty's finishing point and local time at the
 *   departure point.
 */
export function remainsAcclimatised(
  wasAcclimatised: boolean,
  localTimeDifferenceAtDutyEndHours: number
): boolean {
  if (!Number.isFinite(localTimeDifferenceAtDutyEndHours)) {
    throw new Error(
      `remainsAcclimatised: localTimeDifferenceAtDutyEndHours must be a finite number (got ${localTimeDifferenceAtDutyEndHours})`
    );
  }

  if (Math.abs(localTimeDifferenceAtDutyEndHours) > 2) {
    return false;
  }

  return wasAcclimatised;
}
