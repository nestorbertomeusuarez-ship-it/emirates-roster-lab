import { describe, expect, it } from 'vitest';
import type { DatedRuleEvaluation } from '@/roster-gen/types';
import type { RuleEvaluation } from '@/ftl/types';
import { groupEvaluationsByDate } from './complianceGrouping';

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
