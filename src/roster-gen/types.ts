/**
 * Shared types for the Phase 4 automatic monthly roster generator.
 *
 * Mirrors the clean-architecture discipline already established by
 * `src/pairing/` and `src/ftl/`: this file and `generateMonthlyRoster.ts`
 * have zero dependency on `@prisma/client`. `src/roster-gen/db/rosterGen.ts`
 * is the thin DB-aware layer that fetches candidate pairings + airport
 * timezones via Prisma, calls the pure generator, and persists the result
 * as `RosterEntry` rows through Phase 2's existing `src/pairing/db/roster.ts`
 * helpers (no parallel persistence model — see that file's doc comments).
 */

import type { GeneratedPairing } from '../pairing/types';
import type { OperatorSpecificOverrides, RuleEvaluation } from '../ftl/types';

/** One calendar day's automatically-generated assignment. */
export type RosterGenDayAssignment =
  | { type: 'OFF' }
  | { type: 'FLIGHT'; pairing: GeneratedPairing; dayOfPairing: number };

export interface RosterGenDay {
  /** 'YYYY-MM-DD' */
  date: string;
  assignment: RosterGenDayAssignment;
}

/**
 * One `RuleEvaluation` produced by the post-generation verification pass
 * (see generateMonthlyRoster.ts's module doc comment), tagged with the
 * calendar day it applies to.
 */
export interface DatedRuleEvaluation {
  date: string;
  evaluation: RuleEvaluation;
}

export interface GenerateMonthlyRosterInput {
  fleetType: string;
  year: number;
  month: number;
  /**
   * Candidate pairings for this month, already filtered to `fleetType` (see
   * this module's doc comment — the pure generator never calls
   * `generatePairings` itself, that's the caller's job, typically via
   * `src/pairing/db/pairings.ts#generatePairingsForMonth`).
   */
  pairings: GeneratedPairing[];
  /**
   * IATA -> IANA timezone lookup, needed to compute each duty's local
   * report time for `fdpTables.ts`'s Table A start-time bands. A code
   * missing from this map falls back to 'UTC' (documented limitation —
   * see docs/roster-gen-assumptions.md).
   */
  airportTimeZones: Record<string, string>;
  /**
   * Optional operator-configured overrides for the `OPERATOR_SPECIFIC`
   * checks (`src/ftl/rules/operatorSpecific.ts`), threaded through to every
   * `evaluateDuty()` call this generator makes (both construction-time
   * candidate screening and the final verification pass — see
   * `evaluateRosterDays`). `undefined` behaves exactly as before this field
   * existed (every operator-specific check defaults to AMBER). See
   * `src/ftl/operatorConfig.ts` for this app's actual single-user config.
   */
  operatorConfig?: OperatorSpecificOverrides;
  /**
   * Optional soft target RANGE, in minutes, the generator tries to steer
   * the month's accumulated block time into (see
   * docs/roster-gen-assumptions.md item 19, superseded/refined for the
   * range semantics). Both bounds are independently optional:
   *
   * - While the running total is BELOW `targetBlockMinutesMin`: a day's
   *   fitting candidates are tried in descending block-time order (prefer
   *   bigger) — fills toward the floor faster. Identical to the original
   *   single-floor behavior.
   * - Once the running total is AT OR ABOVE `targetBlockMinutesMin`
   *   (whether still inside `[min, max]` or already past
   *   `targetBlockMinutesMax` from a single day's jump): a day's fitting
   *   candidates are tried in ASCENDING block-time order (prefer smaller)
   *   — keeps an in-band roster from needlessly jumping back out the top,
   *   and minimizes further overshoot once already past `max` (a greedy
   *   day-by-day walk can't undo a prior day's pick, so the best it can do
   *   going forward is stop making things worse).
   * - `targetBlockMinutesMin` set, `targetBlockMinutesMax` unset: behaves
   *   exactly like the original open floor — descending while below min,
   *   reverts to the unbiased deterministic-shuffle order once at/above
   *   min (no ceiling to steer away from).
   * - `targetBlockMinutesMax` set, `targetBlockMinutesMin` unset: no floor
   *   phase to fill toward first, so candidates are always tried in
   *   ascending block-time order from day 1 — minimizes how far a single
   *   day's jump can overshoot the cap.
   * - Both `undefined`: behavior is byte-for-byte identical to no bias at
   *   all (matches the original `targetBlockMinutes` unset case).
   *
   * This never relaxes any legality check, the consecutive-duty-day cap,
   * or the days-off pacing — it only reorders which already-legal
   * candidate is tried first. It cannot guarantee landing inside
   * `[targetBlockMinutesMin, targetBlockMinutesMax]`: a single available
   * pairing might be large enough to jump past `targetBlockMinutesMax` from
   * below `targetBlockMinutesMin` in one day, or the month's legal flying
   * capacity might not reach `targetBlockMinutesMin` at all — this is a
   * soft bias, not a guarantee, and `summary.totalBlockMinutes` reports
   * whatever was actually achieved.
   */
  targetBlockMinutesMin?: number;
  /** See `targetBlockMinutesMin`'s doc comment — the paired optional ceiling. */
  targetBlockMinutesMax?: number;
}

export interface MonthlyRosterGenerationResult {
  fleetType: string;
  year: number;
  month: number;
  days: RosterGenDay[];
  /**
   * Every `RuleEvaluation` from the post-generation verification pass —
   * `src/ftl/evaluate.ts#evaluateDuty` run fresh against the FINAL
   * committed roster (not reused from construction-time candidate
   * screening). Should contain zero RED entries for a correctly-functioning
   * generator; a RED here is a real bug in this module's constraint logic,
   * never something to paper over.
   */
  evaluations: DatedRuleEvaluation[];
  summary: {
    flightDays: number;
    offDays: number;
    totalBlockMinutes: number;
    pairingsAssigned: number;
  };
}
