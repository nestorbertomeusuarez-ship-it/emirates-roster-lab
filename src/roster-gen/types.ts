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
