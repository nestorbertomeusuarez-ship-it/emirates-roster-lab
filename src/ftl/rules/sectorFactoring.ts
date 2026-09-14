/**
 * ORO.FTL.260.G — Two-pilot sector-length factoring.
 *
 * Only applies to a 2-flight-crew operation. Does NOT apply if an
 * additional current type-rated pilot is carried (3 or 4 pilots) — in that
 * case the actual sector count is used directly against Table A/B.
 *
 * | Scheduled sector length | Acclimatised | Not acclimatised |
 * |---|---|---|
 * | >7h and <=9h  | 2 sectors | 4 sectors |
 * | >9h and <=11h | 3 sectors | 4 sectors |
 * | >11h          | 4 sectors | not permitted (2-pilot crew) |
 *
 * Judgment call (surfaced, not silent): the public text illustrates this
 * rule in a single-long-sector context. This implementation generalises it
 * to a multi-sector FDP by factoring each sector independently and summing
 * the results, so the sum can be used directly as the "sectors" lookup
 * column for `fdpTables.maxFdpMinutes`. A sector scheduled at 7h or less is
 * unaffected by this rule and contributes 1 (its own, unfactored count).
 * See `docs/gcaa-sources.md`.
 */

import { gcaaCitation } from '../citation';

export const SECTOR_FACTORING_CITATION = gcaaCitation(
  'gcaa-two-pilot-sector-factoring',
  'ORO.FTL.260.G'
);

const SEVEN_HOURS_MIN = 7 * 60;
const NINE_HOURS_MIN = 9 * 60;
const ELEVEN_HOURS_MIN = 11 * 60;

/**
 * Error thrown when a single sector's scheduled length exceeds 11h for a
 * not-acclimatised 2-pilot crew — the table has no value for this
 * combination ("not permitted").
 */
export class SectorFactoringNotPermittedError extends Error {}

function factorOneSector(
  scheduledLengthMin: number,
  acclimatised: boolean
): number {
  if (!Number.isFinite(scheduledLengthMin) || scheduledLengthMin < 0) {
    throw new Error(
      `factoredSectors: each scheduled sector length must be a non-negative finite number (got ${scheduledLengthMin})`
    );
  }

  if (scheduledLengthMin <= SEVEN_HOURS_MIN) {
    return 1;
  }
  if (scheduledLengthMin <= NINE_HOURS_MIN) {
    return acclimatised ? 2 : 4;
  }
  if (scheduledLengthMin <= ELEVEN_HOURS_MIN) {
    return acclimatised ? 3 : 4;
  }
  // > 11h
  if (acclimatised) {
    return 4;
  }
  throw new SectorFactoringNotPermittedError(
    `factoredSectors: a scheduled sector length over 11h (${scheduledLengthMin} min) is not permitted for a not-acclimatised 2-pilot crew (ORO.FTL.260.G)`
  );
}

/**
 * Computes the sector count to use for the Table A/B lookup.
 *
 * @param scheduledSectorLengthsMin each sector's scheduled length, minutes.
 * @param crewCount flight-crew headcount for this duty. Factoring only
 *   applies when this is exactly 2; for 3 or 4 it returns the actual
 *   sector count unchanged.
 * @param acclimatised whether the crew member is acclimatised.
 * @throws {SectorFactoringNotPermittedError} if any sector exceeds 11h for
 *   a not-acclimatised 2-pilot crew.
 */
export function factoredSectors(
  scheduledSectorLengthsMin: number[],
  crewCount: number,
  acclimatised: boolean
): number {
  if (
    !Array.isArray(scheduledSectorLengthsMin) ||
    scheduledSectorLengthsMin.length < 1
  ) {
    throw new Error(
      'factoredSectors: scheduledSectorLengthsMin must be a non-empty array'
    );
  }

  if (crewCount !== 2) {
    return scheduledSectorLengthsMin.length;
  }

  return scheduledSectorLengthsMin.reduce(
    (sum, length) => sum + factorOneSector(length, acclimatised),
    0
  );
}
