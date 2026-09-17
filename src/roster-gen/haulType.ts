/**
 * Haul-type classification for a generated pairing (Phase 4 generator
 * extension — see docs/roster-gen-assumptions.md item 20).
 *
 * This is this generator's OWN scheduling heuristic, not a GCAA regulatory
 * value — mirrors the framing of `CONSECUTIVE_DUTY_DAYS_SOFT_CAP`/
 * `TARGET_DAYS_OFF_PER_MONTH` in `generateMonthlyRoster.ts` (see
 * docs/roster-gen-assumptions.md item 3: this generator's own tunable
 * scheduling constants, never a new GCAA number).
 *
 * A pairing's haul type is defined by its LONGEST individual leg's block
 * time, not an average or total across the whole (possibly multi-day) trip
 * — a real "long-haul pairing" is defined by having at least one long
 * sector, not by accumulated multi-day total (a 3-day trip made of three
 * short hops is not "long-haul" just because its total block time is large).
 *
 * Boundaries (an industry-standard-ish convention, not sourced from any
 * specific regulator or Emirates-specific fleet document):
 *
 *   SHORT  — longest leg block time <  180 min (3h)
 *   MEDIUM — longest leg block time 180-360 min (3h-6h), inclusive
 *   LONG   — longest leg block time >  360 min (6h+)
 */

import type { GeneratedPairing } from '../pairing/types';

export type HaulType = 'SHORT' | 'MEDIUM' | 'LONG';

/** Below this many minutes, the pairing's longest leg is SHORT-haul. */
const SHORT_HAUL_MAX_LEG_BLOCK_MINUTES = 180;
/** At or below this many minutes (and at/above the SHORT boundary), MEDIUM-haul. Above it, LONG-haul. */
const MEDIUM_HAUL_MAX_LEG_BLOCK_MINUTES = 360;

/**
 * Classifies a generated pairing's haul type by its single longest leg's
 * `blockTimeMin`. An empty `legs` array (never expected in practice — every
 * real `GeneratedPairing` has at least one leg) degrades to `SHORT` rather
 * than throwing.
 */
export function classifyHaulType(pairing: GeneratedPairing): HaulType {
  const longestLegBlockMinutes = pairing.legs.reduce(
    (max, leg) => Math.max(max, leg.instance.blockTimeMin),
    0
  );
  if (longestLegBlockMinutes < SHORT_HAUL_MAX_LEG_BLOCK_MINUTES) return 'SHORT';
  if (longestLegBlockMinutes <= MEDIUM_HAUL_MAX_LEG_BLOCK_MINUTES) return 'MEDIUM';
  return 'LONG';
}
