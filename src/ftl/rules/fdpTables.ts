/**
 * ORO.FTL.255.G(c) — Maximum flight duty period (FDP) tables.
 *
 * Table A applies to an acclimatised crew member, keyed by local
 * report-time band x number of sectors. Table B applies to a crew member
 * who is not acclimatised, keyed by length of preceding rest x number of
 * sectors.
 *
 * All published values are HH:MM; this module stores them as minutes.
 *
 * Judgment call (surfaced, not silent): Table B's rest-length rows are
 * published as "Up to 18h, or over 30h" and "Between 18h and 30h", which
 * leaves the exact boundary handling for rest values of precisely 18h and
 * precisely 30h implicit. This implementation treats `restHours <= 18` and
 * `restHours > 30` as the first row (matching "up to 18h" being inclusive,
 * and "over 30h" being exclusive of 30h itself), and `18 < restHours <= 30`
 * as the second row. See `docs/gcaa-sources.md`.
 */

import { gcaaCitation } from '../citation';

export const FDP_TABLE_CITATION = gcaaCitation(
  'gcaa-fdp-table-a-b',
  'ORO.FTL.255.G(c)'
);

/** Sector-count columns as published: 1..8, where 8 means "8 or more". */
const MAX_TABLE_A_SECTOR_COLUMN = 8;
/** Sector-count columns as published: 1..7, where 7 means "7 or more". */
const MAX_TABLE_B_SECTOR_COLUMN = 7;

interface TimeBand {
  label: string;
  /** Inclusive start, minutes since local midnight. */
  startMin: number;
  /** Inclusive end, minutes since local midnight. May wrap past midnight. */
  endMin: number;
}

/**
 * Table A start-time bands. The last band (22:00-05:59) wraps past
 * midnight, handled explicitly in `isWithinBand`.
 */
const TABLE_A_BANDS: TimeBand[] = [
  { label: '06:00-07:59', startMin: 6 * 60, endMin: 7 * 60 + 59 },
  { label: '08:00-12:59', startMin: 8 * 60, endMin: 12 * 60 + 59 },
  { label: '13:00-17:59', startMin: 13 * 60, endMin: 17 * 60 + 59 },
  { label: '18:00-21:59', startMin: 18 * 60, endMin: 21 * 60 + 59 },
  { label: '22:00-05:59', startMin: 22 * 60, endMin: 5 * 60 + 59 },
];

function isWithinBand(minutesSinceMidnight: number, band: TimeBand): boolean {
  if (band.startMin <= band.endMin) {
    return (
      minutesSinceMidnight >= band.startMin &&
      minutesSinceMidnight <= band.endMin
    );
  }
  // Wraps past midnight (e.g. 22:00-05:59).
  return (
    minutesSinceMidnight >= band.startMin ||
    minutesSinceMidnight <= band.endMin
  );
}

/** Table A values in minutes, by band label, sector columns 1..8. */
const TABLE_A_MINUTES: Readonly<Record<string, readonly number[]>> = {
  '06:00-07:59': [780, 735, 690, 645, 600, 570, 540, 540],
  '08:00-12:59': [840, 795, 750, 705, 660, 630, 600, 570],
  '13:00-17:59': [780, 735, 690, 645, 600, 570, 540, 540],
  '18:00-21:59': [720, 675, 630, 585, 540, 540, 540, 540],
  '22:00-05:59': [660, 615, 570, 540, 540, 540, 540, 540],
};

/** Table B row keys. */
export type TableBRestBand = 'UP_TO_18H_OR_OVER_30H' | 'BETWEEN_18H_AND_30H';

/** Table B values in minutes, by rest band, sector columns 1..7. */
const TABLE_B_MINUTES: Readonly<Record<TableBRestBand, readonly number[]>> = {
  UP_TO_18H_OR_OVER_30H: [780, 735, 690, 645, 600, 555, 540],
  BETWEEN_18H_AND_30H: [690, 660, 630, 585, 540, 540, 540],
};

function parseLocalTimeToMinutes(localTime: string): number {
  const match = /^([0-1]\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  if (!match) {
    throw new Error(
      `parseLocalTimeToMinutes: expected 'HH:MM' 24h local time, got "${localTime}"`
    );
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function tableBRestBand(precedingRestHours: number): TableBRestBand {
  if (!Number.isFinite(precedingRestHours) || precedingRestHours < 0) {
    throw new Error(
      `tableBRestBand: precedingRestHours must be a non-negative finite number (got ${precedingRestHours})`
    );
  }
  if (precedingRestHours <= 18 || precedingRestHours > 30) {
    return 'UP_TO_18H_OR_OVER_30H';
  }
  return 'BETWEEN_18H_AND_30H';
}

/**
 * Looks up the maximum permitted FDP, in minutes, from Table A
 * (acclimatised) or Table B (not acclimatised).
 *
 * @param startLocalTime report/FDP start time, 'HH:MM' 24h local.
 * @param sectors number of sectors (or factored-sector count from
 *   `sectorFactoring.ts` for a 2-pilot crew) — a positive integer.
 * @param acclimatised whether the crew member is acclimatised.
 * @param precedingRestHours required, and only used, when `acclimatised`
 *   is false (Table B lookup).
 * @throws if `sectors` is not a positive integer, `startLocalTime` is
 *   malformed, or `acclimatised` is false and `precedingRestHours` is
 *   missing/invalid.
 */
export function maxFdpMinutes(
  startLocalTime: string,
  sectors: number,
  acclimatised: boolean,
  precedingRestHours?: number
): number {
  if (!Number.isInteger(sectors) || sectors < 1) {
    throw new Error(
      `maxFdpMinutes: sectors must be a positive integer (got ${sectors})`
    );
  }

  const startMinutes = parseLocalTimeToMinutes(startLocalTime);

  if (acclimatised) {
    const band = TABLE_A_BANDS.find((b) => isWithinBand(startMinutes, b));
    if (!band) {
      // Unreachable given the 5 bands cover all 24h, but keep this
      // explicit rather than silently falling through.
      throw new Error(
        `maxFdpMinutes: no Table A band matched start time "${startLocalTime}"`
      );
    }
    const column = Math.min(sectors, MAX_TABLE_A_SECTOR_COLUMN) - 1;
    return TABLE_A_MINUTES[band.label][column];
  }

  if (precedingRestHours === undefined) {
    throw new Error(
      'maxFdpMinutes: precedingRestHours is required when acclimatised is false (Table B lookup)'
    );
  }
  const restBand = tableBRestBand(precedingRestHours);
  const column = Math.min(sectors, MAX_TABLE_B_SECTOR_COLUMN) - 1;
  return TABLE_B_MINUTES[restBand][column];
}

/**
 * Anti-avoidance note (ORO.FTL.255.G(c), doc comment only — not
 * enforceable logic): deliberately inserting a short duty into an 18-30h
 * rest period to artificially produce a <18h rest (and thus qualify for
 * Table B's better first row) is not permitted. This library has no way to
 * detect scheduling *intent*; a future pairing engine (Phase 2) is the
 * right place to flag a suspicious short-duty insertion pattern for human
 * review, not this pure rules engine.
 */
export const ANTI_AVOIDANCE_NOTE =
  'Inserting a short duty into an 18-30h rest period to artificially produce <18h rest is not permitted (ORO.FTL.255.G(c)).';
