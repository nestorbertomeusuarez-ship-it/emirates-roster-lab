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

/**
 * Selectable construction-loop candidate-ordering strategy (see
 * docs/roster-gen-assumptions.md item 20, superseding item 19's soft
 * min/max bias). All three strategies share the same hard
 * `targetBlockMinutesMax` budget filter and the same underlying
 * legality/pacing checks — they only differ in which already-eligible
 * candidate a day prefers:
 *
 *   MIX          — default. Prefers whichever haul type
 *                  (`haulType.ts#classifyHaulType`) is currently
 *                  least-represented among pairings assigned so far this
 *                  month.
 *   MAX_FLYING   — prefers the SMALLER block-time candidate, packing more
 *                  distinct flying days into the same budget.
 *   MAX_DAYS_OFF — prefers the BIGGER block-time candidate, reaching the
 *                  target range with fewer, longer trips (more days off).
 */
export type GenerationStrategy = 'MIX' | 'MAX_FLYING' | 'MAX_DAYS_OFF';

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
   * Optional target RANGE, in minutes, for the month's accumulated block
   * time (see docs/roster-gen-assumptions.md item 20, superseding item 19's
   * soft bias). `targetBlockMinutesMax` is now a HARD ceiling, not a
   * preference:
   *
   * - `targetBlockMinutesMax`, when set, is enforced as a hard eligibility
   *   filter BEFORE any strategy-based ordering runs (see
   *   `generationStrategy` above and `generateMonthlyRoster.ts`'s
   *   `filterCandidatesWithinBudget`): a candidate is only eligible for a
   *   day if `runningBlockMinutesSoFar + candidateBlockMinutes <=
   *   targetBlockMinutesMax`. If no candidate is eligible for a day (either
   *   none fit legally, or none fit the remaining budget), the day is OFF —
   *   this ceiling is never exceeded by construction, except in the
   *   degenerate case where a single available pairing's own block time
   *   already exceeds the entire configured range (nothing smaller exists
   *   to offer instead).
   * - `targetBlockMinutesMin` IS enforced, but only as a best-effort floor
   *   (docs/roster-gen-assumptions.md item 23, superseding the
   *   informational-only design below): while
   *   `runningBlockMinutesSoFar < targetBlockMinutesMin`, this generator's
   *   own cosmetic pacing/spacing heuristics (the weekly block-budget
   *   filter, the weekly-pacing OFF trigger, and the natural-variation
   *   streak extension) are suppressed so flying resumes wherever legally
   *   possible. It never overrides an actual legality check, the
   *   consecutive-duty-day cap, or the days-off pacing that proxies a real
   *   GCAA floor — so the month can still legitimately land under
   *   `targetBlockMinutesMin` if those leave no room, which remains an
   *   accepted outcome, never an error. (Original text, preserved: it used
   *   to be purely aspirational context for the human reading a generated
   *   summary, with no effect on construction at all.)
   * - Both `undefined`: no budget filtering at all — every day's eligible
   *   candidate set is just whatever is legal (matches pre-hard-range
   *   behavior when `targetBlockMinutesMax` is unset).
   *
   * This never relaxes any legality check, the consecutive-duty-day cap, or
   * the days-off pacing — the budget filter only narrows which already-
   * legal candidates are eligible, and `generationStrategy` only reorders
   * among the eligible/legal set. `summary.totalBlockMinutes` reports
   * whatever was actually achieved, which may be below
   * `targetBlockMinutesMin`, but is never above `targetBlockMinutesMax`
   * (short of the single-pairing-too-big degenerate case above).
   */
  targetBlockMinutesMin?: number;
  /** See `targetBlockMinutesMin`'s doc comment — the hard ceiling, enforced as a construction-time eligibility filter. */
  targetBlockMinutesMax?: number;
  /** See `GenerationStrategy`'s doc comment above. Defaults to `'MIX'` when unset. */
  generationStrategy?: GenerationStrategy;
  /**
   * Optional: the previous calendar month's ACTUAL persisted roster (as many
   * trailing days as the caller has — the whole month is fine, negligible
   * cost), used ONLY to seed day 1's minimum-rest check and continue a
   * consecutive-duty-day run into this month (docs/roster-gen-assumptions.md
   * item 24, see `generateMonthlyRoster.ts`'s "CROSS-MONTH REST +
   * CONSECUTIVE-DUTY-DAY CARRY-OVER" module doc section for the full
   * design). `undefined` (default) reproduces this generator's pre-item-24
   * behavior exactly — day 1 of the month is never rest-checked against a
   * "previous" duty, matching every existing caller/test unchanged.
   */
  priorMonthTailDays?: RosterGenDay[];
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
