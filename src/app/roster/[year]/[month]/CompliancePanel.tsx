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

const SEVERITY_DOT: Record<Severity, string> = {
  RED: 'bg-red',
  AMBER: 'bg-amber',
  GREEN: 'bg-ok',
};

const SEVERITY_BORDER: Record<Severity, string> = {
  RED: 'border-red',
  AMBER: 'border-amber',
  GREEN: 'border-ok',
};

function formatMargin(marginMinutes: number | undefined): string | null {
  if (marginMinutes === undefined) return null;
  const sign = marginMinutes < 0 ? '-' : '+';
  const abs = Math.abs(marginMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `margin ${sign}${hours}h${minutes}m`;
}

/** e.g. "Thu 1 Oct" — matches this app's UTC-day convention throughout. */
function formatDisplayDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function worstSeverityOf(evaluations: RuleEvaluation[]): Severity {
  if (evaluations.some((e) => e.severity === 'RED')) return 'RED';
  if (evaluations.some((e) => e.severity === 'AMBER')) return 'AMBER';
  return 'GREEN';
}

function EvaluationRow({
  evaluation,
  children,
}: {
  evaluation: RuleEvaluation;
  /**
   * Extra content rendered inside this row's own `<li>` — e.g. the
   * operator-specific section's "applies to N days" disclosure. Must NOT be
   * a sibling `<li>` wrapping this component: `<li>` cannot nest inside
   * `<li>` in valid HTML (this exact bug caused a hydration error — see
   * commit history), so any per-row extra content belongs HERE, inside this
   * single `<li>`, not wrapped around it.
   */
  children?: React.ReactNode;
}) {
  const margin = formatMargin(evaluation.marginMinutes);

  return (
    <li className={`pl-2 py-1 border-l-[3px] ${SEVERITY_BORDER[evaluation.severity]}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[evaluation.severity]}`}
          aria-hidden="true"
        />
        <span className="font-semibold text-muted">{evaluation.citation.clause}</span>
        {evaluation.isOperatorSpecific && (
          <span className="rounded bg-flight-soft text-ink px-1 py-0.5 text-[10px] font-normal">
            Operator-specific — not verifiable against public GCAA text
          </span>
        )}
      </div>
      <div className="text-ink">{evaluation.message}</div>
      {margin && <div className="text-muted text-[10px] tabular-nums">{margin}</div>}
      {children}
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

  const worstByDate = grouped.map((day) => worstSeverityOf(day.evaluations));
  const redCount = worstByDate.filter((s) => s === 'RED').length;
  const amberCount = worstByDate.filter((s) => s === 'AMBER').length;
  const dutyDayCount = grouped.length;

  return (
    <section className="bg-surface border border-rule rounded-lg p-3 mb-6 text-xs">
      <h2 className="font-display text-sm font-semibold mb-1 text-ink">GCAA compliance</h2>

      {dutyDayCount === 0 ? (
        <p className="text-muted mb-2">
          No day-specific FTL findings for this month — nothing is assigned yet, or every
          assigned duty is compliant against public GCAA data. See the operator-specific section
          below for findings that apply regardless of the specific day.
        </p>
      ) : redCount === 0 && amberCount === 0 ? (
        <p className="flex items-center gap-1.5 text-ok mb-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-ok" aria-hidden="true" />
          {dutyDayCount} duty day{dutyDayCount === 1 ? '' : 's'} checked. All within limits.
        </p>
      ) : (
        <p className="mb-2">
          {redCount > 0 && <span className="text-red font-medium">{redCount} illegal</span>}
          {redCount > 0 && amberCount > 0 && <span className="text-muted">, </span>}
          {amberCount > 0 && <span className="text-amber font-medium">{amberCount} to check</span>}
          <span className="text-muted"> across {dutyDayCount} duty day{dutyDayCount === 1 ? '' : 's'}.</span>
        </p>
      )}

      {grouped.length > 0 && (
        <ul className="flex flex-col gap-2">
          {grouped.map((day) => {
            const worst = worstSeverityOf(day.evaluations);
            return (
              <li key={day.date}>
                <details id={day.date} open={worst !== 'GREEN'}>
                  <summary className="cursor-pointer select-none flex items-center gap-1.5 font-medium text-ink py-0.5">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[worst]}`}
                      aria-hidden="true"
                    />
                    <span>{formatDisplayDate(day.date)}</span>
                    <span className="text-muted font-normal">
                      {day.evaluations.length} check{day.evaluations.length === 1 ? '' : 's'}
                    </span>
                  </summary>
                  <ul className="flex flex-col gap-1 mt-1">
                    {day.evaluations.map((evaluation) => (
                      <EvaluationRow
                        key={`${day.date}-${evaluation.citation.ruleId}`}
                        evaluation={evaluation}
                      />
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {operatorSpecificGroups.length > 0 && (
        <details className="mt-4 pt-3 border-t border-rule">
          <summary className="cursor-pointer select-none font-display text-sm font-semibold text-ink">
            Operator-specific checks ({operatorSpecificGroups.length})
          </summary>
          <p className="text-muted mt-2 mb-2">
            These checks need Emirates-internal figures this app does not have access to (see
            src/ftl/rules/operatorSpecific.ts). They apply the same way to every day listed below,
            so each distinct finding is shown once here rather than repeated per day.
          </p>
          <ul className="flex flex-col gap-2">
            {operatorSpecificGroups.map((group) => (
              <EvaluationRow
                key={`${group.evaluation.citation.ruleId}-${group.evaluation.message}`}
                evaluation={group.evaluation}
              >
                <details className="mt-0.5">
                  <summary className="cursor-pointer select-none text-muted underline text-[10px]">
                    Applies to {group.dates.length} day{group.dates.length === 1 ? '' : 's'}
                  </summary>
                  <div className="mt-0.5 text-[10px] text-muted">{group.dates.join(', ')}</div>
                </details>
              </EvaluationRow>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
