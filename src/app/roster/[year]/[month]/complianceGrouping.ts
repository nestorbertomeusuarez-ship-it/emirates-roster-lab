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
