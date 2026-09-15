/**
 * Phase 5 Slice 3 — pure per-day presentation helpers for the calendar grid:
 * a 3-way day category (FLIGHT / DXB_OFF / LAYOVER) and a worst-severity
 * lookup, both derived entirely from data `page.tsx` already computes
 * (Slice 1's `loadRosterGenDaysForMonth` output and Slice 2's
 * `evaluateRosterDays` output) — no new evaluation, no new data source.
 *
 * See docs/roster-gen-assumptions.md item 12 for the LAYOVER classification
 * rule and why it is presentational only (it does NOT change how
 * `evaluateRosterDays` treats the day — a LAYOVER day is still duty for
 * `consecutiveDutyDays`/`ORO.FTL.205.G` purposes, per item 4).
 *
 * Kept separate from `page.tsx`/`DayCard.tsx` per this project's
 * established precedent (see `complianceGrouping.ts`'s doc comment) — unit
 * test pure logic, not the page/component.
 */

import type { DatedRuleEvaluation, RosterGenDay } from '@/roster-gen/types';
import type { Severity } from '@/ftl/types';
import { groupEvaluationsByDate } from './complianceGrouping';

/**
 * Three-way calendar-day category for the roster grid UI, per explicit user
 * request to distinguish flying days, DXB home days off, and outstation
 * layover days (see docs/roster-gen-assumptions.md item 12).
 */
export type DayCategory = 'FLIGHT' | 'DXB_OFF' | 'LAYOVER';

/**
 * Classifies one `RosterGenDay`:
 * - `{ type: 'OFF' }` -> `DXB_OFF` (a real regulatory day off, crew at home base).
 * - `{ type: 'FLIGHT' }` with at least one leg whose `instance.serviceDate`
 *   equals this day's own date -> `FLIGHT` (an actual flying leg operates
 *   this day).
 * - `{ type: 'FLIGHT' }` with no leg on this specific date -> `LAYOVER` (a
 *   pure rest day within an active multi-day pairing, at an outstation —
 *   still duty per item 4, just not a flying day).
 *
 * Mirrors `generateMonthlyRoster.ts`'s internal (unexported) `legsOnDay`
 * same-date leg lookup — deliberately re-derived here rather than importing
 * an unexported helper, since `generateMonthlyRoster.ts` is frozen/done
 * from Phase 4.
 */
export function classifyDayCategory(day: RosterGenDay): DayCategory {
  if (day.assignment.type === 'OFF') return 'DXB_OFF';

  const hasLegToday = day.assignment.pairing.legs.some(
    (leg) => leg.instance.serviceDate === day.date
  );
  return hasLegToday ? 'FLIGHT' : 'LAYOVER';
}

/** Builds a date ('YYYY-MM-DD') -> `DayCategory` lookup for a whole month's `RosterGenDay[]`. */
export function buildDayCategoryMap(days: RosterGenDay[]): Map<string, DayCategory> {
  const map = new Map<string, DayCategory>();
  for (const day of days) {
    map.set(day.date, classifyDayCategory(day));
  }
  return map;
}

/**
 * Builds a date -> worst `Severity` lookup from the same evaluations
 * `CompliancePanel` already renders. `groupEvaluationsByDate` already sorts
 * each day worst-severity-first (RED, then AMBER, then GREEN — see
 * `complianceGrouping.ts`), so the worst entry is simply the first one per
 * day.
 *
 * A date absent from the result had no evaluations that day — this is
 * expected and normal for LAYOVER and DXB_OFF days, since
 * `evaluateRosterDays` only produces evaluations for days with an actual
 * flying leg (see `generateMonthlyRoster.ts`'s `evaluateRosterDays`).
 */
export function buildWorstSeverityMap(
  evaluations: DatedRuleEvaluation[]
): Map<string, Severity> {
  const grouped = groupEvaluationsByDate(evaluations);
  const map = new Map<string, Severity>();
  for (const day of grouped) {
    const worst = day.evaluations[0];
    if (worst) map.set(day.date, worst.severity);
  }
  return map;
}
