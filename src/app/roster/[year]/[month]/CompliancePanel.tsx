/**
 * Phase 5 Slice 2 — always-current, itemized GCAA compliance panel.
 *
 * Unlike the ephemeral `genSummary` banner in `page.tsx` (a RED *count* that
 * only appears immediately after running the generator, via a redirect
 * query-string value), this panel re-renders the REAL, itemized evaluation
 * of whatever is currently persisted for the month — manual or generated —
 * on every page load. It supersedes docs/roster-gen-assumptions.md item 10
 * ("compliance-flag detail is summarized, not itemized") with full per-
 * evaluation detail (citation, message, margin), while leaving the
 * `genSummary` banner in place as a separate "just generated" confirmation.
 *
 * Purely presentational — grouping/sorting is extracted to
 * `complianceGrouping.ts` (unit-tested there; see that file's doc comment
 * for why this component itself is not).
 *
 * Direct user feedback (2026-09-16): the 2 remaining `OPERATOR_SPECIFIC`
 * placeholders (see `src/ftl/rules/operatorSpecific.ts`) fire on nearly
 * every flying day with near-identical text, burying real per-day findings
 * under repetition. The per-date sections below now show only "real"
 * (non-operator-specific) findings; operator-specific findings are never
 * dropped — they move to one deduplicated-by-rule section instead (see
 * `complianceGrouping.ts#groupOperatorSpecificFindings`), still showing full
 * severity/message/citation for every distinct rule, just not repeated once
 * per day.
 */

import type { DatedRuleEvaluation } from '@/roster-gen/types';
import type { RuleEvaluation, Severity } from '@/ftl/types';
import {
  groupNonOperatorSpecificEvaluationsByDate,
  groupOperatorSpecificFindings,
} from './complianceGrouping';

interface CompliancePanelProps {
  evaluations: DatedRuleEvaluation[];
}

const SEVERITY_STYLES: Record<Severity, string> = {
  RED: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  AMBER: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  GREEN: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
};

function formatMargin(marginMinutes: number | undefined): string | null {
  if (marginMinutes === undefined) return null;
  const sign = marginMinutes < 0 ? '-' : '+';
  const abs = Math.abs(marginMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `margin ${sign}${hours}h${minutes}m`;
}

function EvaluationRow({ evaluation }: { evaluation: RuleEvaluation }) {
  const margin = formatMargin(evaluation.marginMinutes);

  return (
    <li className={`rounded px-2 py-1 ${SEVERITY_STYLES[evaluation.severity]}`}>
      <div className="font-semibold flex flex-wrap items-center gap-1">
        <span>{evaluation.severity}</span>
        <span>&mdash;</span>
        <span>{evaluation.citation.clause}</span>
        {evaluation.isOperatorSpecific && (
          <span className="rounded bg-purple-200 text-purple-900 dark:bg-purple-800 dark:text-purple-100 px-1 py-0.5 text-[10px] font-normal">
            operator-specific &mdash; not verifiable against public GCAA text
          </span>
        )}
      </div>
      <div>{evaluation.message}</div>
      {margin && <div className="text-[10px] opacity-75">{margin}</div>}
    </li>
  );
}

/**
 * Groups and renders every current `DatedRuleEvaluation` for the month, one
 * section per calendar day (worst-severity-first within each day), followed
 * by a separate deduplicated section for operator-specific findings. Shows
 * an explicit empty state rather than a blank panel when there is nothing to
 * evaluate (e.g. no days assigned yet).
 */
export default function CompliancePanel({ evaluations }: CompliancePanelProps) {
  const grouped = groupNonOperatorSpecificEvaluationsByDate(evaluations);
  const operatorSpecificGroups = groupOperatorSpecificFindings(evaluations);

  return (
    <section className="border rounded p-3 mb-6 text-xs">
      <h2 className="text-sm font-semibold mb-2">GCAA compliance &mdash; current roster</h2>
      <p className="text-zinc-500 mb-2">
        Itemized re-evaluation of whatever is actually assigned for this month right now (manual
        or generated) &mdash; always current, unlike the one-time generation summary above. See
        docs/roster-gen-assumptions.md item 10.
      </p>

      {grouped.length === 0 ? (
        <p className="text-zinc-400">
          No day-specific FTL findings for this month &mdash; nothing is assigned yet, or every
          assigned duty is compliant against public GCAA data. See the operator-specific section
          below for findings that apply regardless of the specific day.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {grouped.map((day) => (
            <li key={day.date} id={day.date}>
              <div className="font-medium mb-1">{day.date}</div>
              <ul className="flex flex-col gap-1">
                {day.evaluations.map((evaluation) => (
                  <EvaluationRow
                    key={`${day.date}-${evaluation.citation.ruleId}`}
                    evaluation={evaluation}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {operatorSpecificGroups.length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <h3 className="text-sm font-semibold mb-1">
            Operator-specific &mdash; not verifiable against public GCAA text
          </h3>
          <p className="text-zinc-500 mb-2">
            These checks need Emirates-internal figures this app does not have access to (see
            src/ftl/rules/operatorSpecific.ts). They apply the same way to every day listed below,
            so each distinct finding is shown once here rather than repeated per day.
          </p>
          <ul className="flex flex-col gap-2">
            {operatorSpecificGroups.map((group) => (
              <li key={`${group.evaluation.citation.ruleId}-${group.evaluation.message}`}>
                <EvaluationRow evaluation={group.evaluation} />
                <details className="mt-0.5">
                  <summary className="cursor-pointer select-none text-zinc-500 dark:text-zinc-400 underline text-[10px]">
                    applies to {group.dates.length} day{group.dates.length === 1 ? '' : 's'}
                  </summary>
                  <div className="mt-0.5 text-[10px] opacity-75">{group.dates.join(', ')}</div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
