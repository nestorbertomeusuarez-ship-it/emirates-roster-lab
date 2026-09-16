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
import type { DutyType } from '@/pairing/types';
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

/**
 * Calendar badge category, widening `DayCategory` with the 4 non-FLIGHT/OFF
 * `DutyType`s (STANDBY/SIM/GROUND_SCHOOL/VACATION) for DISPLAY purposes only.
 */
export type CalendarBadgeCategory = DayCategory | 'STANDBY' | 'SIM' | 'GROUND_SCHOOL' | 'VACATION';

/**
 * Resolves the badge a calendar day cell should actually show.
 *
 * `classifyDayCategory` derives its category from `RosterGenDay`, which —
 * per item 11's OFF-equivalent evaluation mapping — has already collapsed
 * every non-FLIGHT `RosterEntry.dutyType` (STANDBY/SIM/GROUND_SCHOOL/
 * VACATION), and an unassigned day, down to `{type:'OFF'}`. That collapse
 * is correct for GCAA evaluation purposes, but taken at face value for the
 * calendar badge it would show "Off · DXB" for a pilot who is actually on
 * standby, in the simulator, in ground school, or on vacation — misleading,
 * since those are real distinct duty types, not a day off at home base.
 *
 * This widens the DXB_OFF case back out using the real `RosterEntry.dutyType`
 * (already available wherever a day has an `entry`), without touching
 * `classifyDayCategory`/`RosterGenDay`/the evaluator — this is presentation
 * only, exactly like item 12's LAYOVER classification.
 */
export function resolveCalendarBadgeCategory(
  category: DayCategory | null,
  dutyType: DutyType | undefined
): CalendarBadgeCategory | null {
  if (category === 'DXB_OFF' && dutyType && dutyType !== 'OFF' && dutyType !== 'FLIGHT') {
    return dutyType;
  }
  return category;
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
 * day, once operator-specific findings are set aside (see below).
 *
 * Direct user feedback (2026-09-16): the 2 remaining `OPERATOR_SPECIFIC`
 * placeholders (`operator-ulr-ftl-variation-scheme`,
 * `operator-augmented-crew-rest-facility-table` — see
 * `src/ftl/rules/operatorSpecific.ts`) fire on essentially every flying day
 * with near-identical AMBER text, since they are per-duty checks with no
 * day-specific content. Left in the "worst severity" calculation, they drown
 * out real per-day signal — every flying day shows AMBER even when nothing
 * is actually wrong. This is presentation-layer filtering only: every
 * operator-specific finding is still fully surfaced, in full, by
 * `CompliancePanel`'s separate deduplicated section (see
 * `complianceGrouping.ts#groupOperatorSpecificFindings`) — this function
 * only decides what the CALENDAR BADGE headlines.
 *
 * For each day: the worst NON-operator-specific severity wins, if any exist.
 * When a day's only findings are operator-specific (no real GCAA-sourced
 * concern was raised for that day), the badge reports GREEN rather than
 * AMBER — there is no known compliance issue from public data, and the
 * operator-specific caveat remains fully visible below, just not repeated as
 * a false-alarm headline on every single day.
 *
 * A date absent from the result had no evaluations that day at all — this is
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
    if (day.evaluations.length === 0) continue;
    const nonOperatorSpecific = day.evaluations.filter((e) => !e.isOperatorSpecific);
    const worst = nonOperatorSpecific[0];
    map.set(day.date, worst ? worst.severity : 'GREEN');
  }
  return map;
}
