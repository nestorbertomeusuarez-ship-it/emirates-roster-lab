import { describe, expect, it } from 'vitest';
import type { DatedRuleEvaluation } from '@/roster-gen/types';
import type { RuleEvaluation } from '@/ftl/types';
import {
  groupEvaluationsByDate,
  groupNonOperatorSpecificEvaluationsByDate,
  groupOperatorSpecificFindings,
} from './complianceGrouping';

function makeEvaluation(overrides: Partial<RuleEvaluation> & { ruleId: string }): RuleEvaluation {
  return {
    citation: {
      ruleId: overrides.ruleId,
      clause: overrides.citation?.clause ?? 'ORO.FTL.205.G',
      document: 'GCAA CAR-OPS 1 Subpart Q',
      documentUrl: 'https://example.invalid/gcaa',
      dateConsulted: '2026-01-01',
    },
    severity: overrides.severity ?? 'GREEN',
    message: overrides.message ?? 'Test message',
    marginMinutes: overrides.marginMinutes,
    isOperatorSpecific: overrides.isOperatorSpecific,
  };
}

describe('groupEvaluationsByDate', () => {
  it('returns an empty array for an empty input', () => {
    expect(groupEvaluationsByDate([])).toEqual([]);
  });

  it('groups evaluations by date and sorts groups chronologically', () => {
    const input: DatedRuleEvaluation[] = [
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'rule-a' }) },
      { date: '2026-10-02', evaluation: makeEvaluation({ ruleId: 'rule-b' }) },
      { date: '2026-10-02', evaluation: makeEvaluation({ ruleId: 'rule-c' }) },
    ];

    const grouped = groupEvaluationsByDate(input);

    expect(grouped.map((g) => g.date)).toEqual(['2026-10-02', '2026-10-05']);
    expect(grouped[0].evaluations).toHaveLength(2);
    expect(grouped[1].evaluations).toHaveLength(1);
  });

  it('sorts each day worst-severity-first: RED, then AMBER, then GREEN', () => {
    const input: DatedRuleEvaluation[] = [
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'green', severity: 'GREEN' }) },
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'red', severity: 'RED' }) },
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'amber', severity: 'AMBER' }) },
    ];

    const grouped = groupEvaluationsByDate(input);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].evaluations.map((e) => e.severity)).toEqual(['RED', 'AMBER', 'GREEN']);
  });

  it('breaks severity ties by citation clause, ascending', () => {
    const input: DatedRuleEvaluation[] = [
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'z',
          severity: 'RED',
          citation: { clause: 'ORO.FTL.999.G' } as RuleEvaluation['citation'],
        }),
      },
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'a',
          severity: 'RED',
          citation: { clause: 'ORO.FTL.100.G' } as RuleEvaluation['citation'],
        }),
      },
    ];

    const grouped = groupEvaluationsByDate(input);

    expect(grouped[0].evaluations.map((e) => e.citation.clause)).toEqual([
      'ORO.FTL.100.G',
      'ORO.FTL.999.G',
    ]);
  });

  it('preserves marginMinutes and isOperatorSpecific through grouping', () => {
    const input: DatedRuleEvaluation[] = [
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'op-specific',
          severity: 'AMBER',
          marginMinutes: -15,
          isOperatorSpecific: true,
        }),
      },
    ];

    const grouped = groupEvaluationsByDate(input);

    expect(grouped[0].evaluations[0].marginMinutes).toBe(-15);
    expect(grouped[0].evaluations[0].isOperatorSpecific).toBe(true);
  });
});

describe('groupNonOperatorSpecificEvaluationsByDate', () => {
  it('excludes operator-specific findings from the per-date groups', () => {
    const input: DatedRuleEvaluation[] = [
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'real', severity: 'GREEN' }) },
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'operator-ulr-ftl-variation-scheme',
          severity: 'AMBER',
          isOperatorSpecific: true,
        }),
      },
    ];

    const grouped = groupNonOperatorSpecificEvaluationsByDate(input);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].evaluations.map((e) => e.citation.ruleId)).toEqual(['real']);
  });

  it('omits a date entirely when every finding for it is operator-specific', () => {
    const input: DatedRuleEvaluation[] = [
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'operator-ulr-ftl-variation-scheme',
          severity: 'AMBER',
          isOperatorSpecific: true,
        }),
      },
    ];

    const grouped = groupNonOperatorSpecificEvaluationsByDate(input);

    expect(grouped).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(groupNonOperatorSpecificEvaluationsByDate([])).toEqual([]);
  });
});

describe('groupOperatorSpecificFindings', () => {
  it('returns an empty array when there are no operator-specific findings', () => {
    const input: DatedRuleEvaluation[] = [
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'real', severity: 'GREEN' }) },
    ];

    expect(groupOperatorSpecificFindings(input)).toEqual([]);
  });

  it('deduplicates one entry per (ruleId, severity, message) across many days', () => {
    const input: DatedRuleEvaluation[] = [
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ].map((date) => ({
      date,
      evaluation: makeEvaluation({
        ruleId: 'operator-ulr-ftl-variation-scheme',
        severity: 'AMBER',
        message: 'Cannot verify against public GCAA data.',
        isOperatorSpecific: true,
      }),
    }));

    const grouped = groupOperatorSpecificFindings(input);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].evaluation.citation.ruleId).toBe('operator-ulr-ftl-variation-scheme');
    expect(grouped[0].dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('sorts the applicable dates chronologically regardless of input order', () => {
    const input: DatedRuleEvaluation[] = [
      {
        date: '2026-10-20',
        evaluation: makeEvaluation({
          ruleId: 'rule-x',
          severity: 'AMBER',
          isOperatorSpecific: true,
        }),
      },
      {
        date: '2026-10-03',
        evaluation: makeEvaluation({
          ruleId: 'rule-x',
          severity: 'AMBER',
          isOperatorSpecific: true,
        }),
      },
    ];

    const grouped = groupOperatorSpecificFindings(input);

    expect(grouped[0].dates).toEqual(['2026-10-03', '2026-10-20']);
  });

  it('keeps 2 distinct rules as 2 separate groups, never merging them', () => {
    const input: DatedRuleEvaluation[] = [
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'operator-ulr-ftl-variation-scheme',
          severity: 'AMBER',
          isOperatorSpecific: true,
        }),
      },
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'operator-augmented-crew-rest-facility-table',
          severity: 'AMBER',
          isOperatorSpecific: true,
        }),
      },
    ];

    const grouped = groupOperatorSpecificFindings(input);

    expect(grouped.map((g) => g.evaluation.citation.ruleId)).toEqual([
      'operator-augmented-crew-rest-facility-table',
      'operator-ulr-ftl-variation-scheme',
    ]);
  });

  it('never collapses two distinct messages for the same rule into one group', () => {
    // Defensive case per the task brief: if a future override ever changes
    // mid-month, the same ruleId could produce genuinely different content
    // on different days — this must stay 2 groups, not 1.
    const input: DatedRuleEvaluation[] = [
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'operator-ulr-ftl-variation-scheme',
          severity: 'AMBER',
          message: 'message A',
          isOperatorSpecific: true,
        }),
      },
      {
        date: '2026-10-06',
        evaluation: makeEvaluation({
          ruleId: 'operator-ulr-ftl-variation-scheme',
          severity: 'GREEN',
          message: 'message B (operator-configured override)',
          isOperatorSpecific: true,
        }),
      },
    ];

    const grouped = groupOperatorSpecificFindings(input);

    expect(grouped).toHaveLength(2);
    expect(grouped.flatMap((g) => g.dates)).toEqual(['2026-10-05', '2026-10-06']);
  });

  it('never drops a finding: every input evaluation is accounted for in some group', () => {
    const input: DatedRuleEvaluation[] = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-10-0${i + 1}`,
      evaluation: makeEvaluation({
        ruleId: 'operator-augmented-crew-rest-facility-table',
        severity: 'AMBER',
        isOperatorSpecific: true,
      }),
    }));

    const grouped = groupOperatorSpecificFindings(input);
    const totalDates = grouped.reduce((sum, g) => sum + g.dates.length, 0);

    expect(totalDates).toBe(5);
  });
});
