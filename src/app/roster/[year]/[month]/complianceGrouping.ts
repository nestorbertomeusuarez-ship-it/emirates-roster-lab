/**
 * Pure grouping/sorting logic for `CompliancePanel.tsx` (named
 * `complianceGrouping.ts`, not `compliancePanel.ts`, to avoid a
 * case-only filename collision with `CompliancePanel.tsx` on
 * case-insensitive filesystems) — kept separate from
 * the component so it can be unit-tested without a component-testing layer
 * (this project's established precedent: unit-test pure logic, not
 * `page.tsx`/`DayCard.tsx`-style components — see e.g.
 * `src/roster-gen/generateMonthlyRoster.test.ts`).
 */

import type { DatedRuleEvaluation } from '@/roster-gen/types';
import type { RuleEvaluation, Severity } from '@/ftl/types';

export interface DayEvaluations {
  /** 'YYYY-MM-DD' */
  date: string;
  evaluations: RuleEvaluation[];
}

/** Worst-first ordering within a single day's evaluation list. */
const SEVERITY_RANK: Record<Severity, number> = {
  RED: 0,
  AMBER: 1,
  GREEN: 2,
};

function compareEvaluations(a: RuleEvaluation, b: RuleEvaluation): number {
  const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (rankDiff !== 0) return rankDiff;
  return a.citation.clause.localeCompare(b.citation.clause);
}

/**
 * Groups a flat `DatedRuleEvaluation[]` (as produced by
 * `src/roster-gen/generateMonthlyRoster.ts#evaluateRosterDays`) by calendar
 * date, sorts the groups chronologically, and sorts each day's evaluations
 * worst-severity-first (RED, then AMBER, then GREEN; ties broken by clause).
 */
export function groupEvaluationsByDate(evaluations: DatedRuleEvaluation[]): DayEvaluations[] {
  const byDate = new Map<string, RuleEvaluation[]>();

  for (const { date, evaluation } of evaluations) {
    const bucket = byDate.get(date) ?? [];
    bucket.push(evaluation);
    byDate.set(date, bucket);
  }

  return Array.from(byDate.entries())
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, dayEvaluations]) => ({
      date,
      evaluations: [...dayEvaluations].sort(compareEvaluations),
    }));
}

/**
 * Same grouping as `groupEvaluationsByDate`, but with every
 * `isOperatorSpecific` finding removed first. `CompliancePanel` uses this
 * for its per-date sections, which now cover only the "real" (public-GCAA-
 * data-verifiable) findings — the operator-specific ones move to a single
 * deduplicated section instead (see `groupOperatorSpecificFindings` below),
 * so they don't repeat the same near-identical AMBER text once per flying
 * day. A day whose only findings were operator-specific simply has no
 * entry here (same "no group for an empty day" behavior as
 * `groupEvaluationsByDate`) — it still gets a `CompliancePanel` line via the
 * separate section, just not a per-date one.
 */
export function groupNonOperatorSpecificEvaluationsByDate(
  evaluations: DatedRuleEvaluation[]
): DayEvaluations[] {
  return groupEvaluationsByDate(evaluations.filter((e) => !e.evaluation.isOperatorSpecific));
}

export interface OperatorSpecificFindingGroup {
  /** One representative evaluation for this exact (ruleId, severity, message) combination. */
  evaluation: RuleEvaluation;
  /** Every date ('YYYY-MM-DD') this exact finding applies to, sorted chronologically. */
  dates: string[];
}

/**
 * Deduplicates operator-specific findings (see
 * `src/ftl/rules/operatorSpecific.ts`) by rule, so a check that fires
 * identically on every flying day (e.g. the 2 remaining `OPERATOR_SPECIFIC`
 * AMBER placeholders — ULR FTL Variation scheme, augmented-crew rest-
 * facility table) renders once, with the list of dates it applies to,
 * instead of being repeated in full per day.
 *
 * Grouped by `(ruleId, severity, message)`, not `ruleId` alone: today
 * `EMIRATES_OPERATOR_CONFIG` (`src/ftl/operatorConfig.ts`) is a single
 * constant, so the same rule always produces the same message/severity for
 * every day in one render — but this stays defensive against a future
 * per-route or mid-month override producing a genuinely different message
 * for the same rule on different days, which must never be silently
 * collapsed into one (see `OperatorSpecificOverrides`'s doc comment in
 * `src/ftl/types.ts`).
 *
 * Never drops information: every operator-specific `RuleEvaluation` in the
 * input is accounted for in exactly one output group's `dates` list.
 */
export function groupOperatorSpecificFindings(
  evaluations: DatedRuleEvaluation[]
): OperatorSpecificFindingGroup[] {
  const byKey = new Map<string, OperatorSpecificFindingGroup>();

  for (const { date, evaluation } of evaluations) {
    if (!evaluation.isOperatorSpecific) continue;

    const key = `${evaluation.citation.ruleId}::${evaluation.severity}::${evaluation.message}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.dates.push(date);
    } else {
      byKey.set(key, { evaluation, dates: [date] });
    }
  }

  return Array.from(byKey.values())
    .map((group) => ({
      evaluation: group.evaluation,
      dates: [...group.dates].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => {
      const ruleDiff = a.evaluation.citation.ruleId.localeCompare(b.evaluation.citation.ruleId);
      if (ruleDiff !== 0) return ruleDiff;
      return a.evaluation.message.localeCompare(b.evaluation.message);
    });
}
