import { describe, expect, it } from 'vitest';
import type { DatedRuleEvaluation, RosterGenDay } from '@/roster-gen/types';
import type { GeneratedPairing } from '@/pairing/types';
import type { RuleEvaluation } from '@/ftl/types';
import {
  buildDayCategoryMap,
  buildWorstSeverityMap,
  classifyDayCategory,
  resolveCalendarBadgeCategory,
} from './dayPresentation';

function makePairing(legDates: string[]): GeneratedPairing {
  return {
    fleetType: 'A350',
    startServiceDate: legDates[0],
    endServiceDate: legDates[legDates.length - 1],
    tripDays: legDates.length,
    legs: legDates.map((serviceDate, i) => ({
      layoverMinutesBeforeThisLeg: i === 0 ? null : 600,
      instance: {
        scheduleLineId: `line-${i}`,
        number: `EK${100 + i}`,
        depIata: i === 0 ? 'DXB' : 'XXX',
        arrIata: i === legDates.length - 1 ? 'DXB' : 'XXX',
        serviceDate,
        depUTC: new Date(`${serviceDate}T02:00:00.000Z`),
        arrUTC: new Date(`${serviceDate}T06:00:00.000Z`),
        blockTimeMin: 240,
        aircraftType: 'A350',
      },
    })),
  };
}

function makeEvaluation(
  overrides: Partial<RuleEvaluation> & { ruleId: string }
): RuleEvaluation {
  return {
    citation: {
      ruleId: overrides.ruleId,
      clause: overrides.citation?.clause ?? 'ORO.FTL.255.G(c)',
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

describe('classifyDayCategory', () => {
  it('classifies an OFF assignment as DXB_OFF', () => {
    const day: RosterGenDay = { date: '2026-10-05', assignment: { type: 'OFF' } };
    expect(classifyDayCategory(day)).toBe('DXB_OFF');
  });

  it('classifies a FLIGHT day with a leg on this exact date as FLIGHT', () => {
    const pairing = makePairing(['2026-10-05', '2026-10-06', '2026-10-07']);
    const day: RosterGenDay = {
      date: '2026-10-05',
      assignment: { type: 'FLIGHT', pairing, dayOfPairing: 1 },
    };
    expect(classifyDayCategory(day)).toBe('FLIGHT');
  });

  it('classifies the last leg day of a pairing as FLIGHT too', () => {
    const pairing = makePairing(['2026-10-05', '2026-10-07']);
    const day: RosterGenDay = {
      date: '2026-10-07',
      assignment: { type: 'FLIGHT', pairing, dayOfPairing: 3 },
    };
    expect(classifyDayCategory(day)).toBe('FLIGHT');
  });

  it('classifies a pure layover day (no leg on this date) as LAYOVER', () => {
    // A 3-day pairing whose legs are only on day 1 and day 3 — day 2 (the
    // 6th) is a pure rest day at the outstation, no leg operates on it.
    const pairing = makePairing(['2026-10-05', '2026-10-07']);
    const day: RosterGenDay = {
      date: '2026-10-06',
      assignment: { type: 'FLIGHT', pairing, dayOfPairing: 2 },
    };
    expect(classifyDayCategory(day)).toBe('LAYOVER');
  });
});

describe('buildDayCategoryMap', () => {
  it('maps every day of a mixed month to its category', () => {
    const pairing = makePairing(['2026-10-05', '2026-10-07']);
    const days: RosterGenDay[] = [
      { date: '2026-10-01', assignment: { type: 'OFF' } },
      { date: '2026-10-05', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 1 } },
      { date: '2026-10-06', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 2 } },
      { date: '2026-10-07', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 3 } },
    ];

    const map = buildDayCategoryMap(days);

    expect(map.get('2026-10-01')).toBe('DXB_OFF');
    expect(map.get('2026-10-05')).toBe('FLIGHT');
    expect(map.get('2026-10-06')).toBe('LAYOVER');
    expect(map.get('2026-10-07')).toBe('FLIGHT');
  });
});

describe('resolveCalendarBadgeCategory', () => {
  it('leaves FLIGHT and LAYOVER untouched regardless of dutyType', () => {
    expect(resolveCalendarBadgeCategory('FLIGHT', 'FLIGHT')).toBe('FLIGHT');
    expect(resolveCalendarBadgeCategory('LAYOVER', 'FLIGHT')).toBe('LAYOVER');
  });

  it('leaves DXB_OFF as-is when the real duty type is OFF', () => {
    expect(resolveCalendarBadgeCategory('DXB_OFF', 'OFF')).toBe('DXB_OFF');
  });

  it('overrides a DXB_OFF category with the real duty type for STANDBY/SIM/GROUND_SCHOOL/VACATION', () => {
    // classifyDayCategory collapses every non-FLIGHT RosterGenDay to
    // {type:'OFF'} -> DXB_OFF per item 11's OFF-equivalent evaluation
    // mapping — but the calendar badge should show the pilot's ACTUAL duty
    // (standby/sim/ground school/vacation), not misrepresent it as a real
    // day off at home base.
    expect(resolveCalendarBadgeCategory('DXB_OFF', 'STANDBY')).toBe('STANDBY');
    expect(resolveCalendarBadgeCategory('DXB_OFF', 'SIM')).toBe('SIM');
    expect(resolveCalendarBadgeCategory('DXB_OFF', 'GROUND_SCHOOL')).toBe('GROUND_SCHOOL');
    expect(resolveCalendarBadgeCategory('DXB_OFF', 'VACATION')).toBe('VACATION');
  });

  it('passes through a null category unchanged', () => {
    expect(resolveCalendarBadgeCategory(null, 'STANDBY')).toBeNull();
  });

  it('passes through an undefined dutyType (no entry) unchanged', () => {
    expect(resolveCalendarBadgeCategory('DXB_OFF', undefined)).toBe('DXB_OFF');
  });
});

describe('buildWorstSeverityMap', () => {
  it('returns an empty map for no evaluations', () => {
    expect(buildWorstSeverityMap([]).size).toBe(0);
  });

  it('maps each date to its worst severity', () => {
    const evaluations: DatedRuleEvaluation[] = [
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'green', severity: 'GREEN' }) },
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'red', severity: 'RED' }) },
      { date: '2026-10-06', evaluation: makeEvaluation({ ruleId: 'amber', severity: 'AMBER' }) },
    ];

    const map = buildWorstSeverityMap(evaluations);

    expect(map.get('2026-10-05')).toBe('RED');
    expect(map.get('2026-10-06')).toBe('AMBER');
  });

  it('omits a date with no evaluations at all', () => {
    const evaluations: DatedRuleEvaluation[] = [
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'green', severity: 'GREEN' }) },
    ];

    const map = buildWorstSeverityMap(evaluations);

    expect(map.has('2026-10-06')).toBe(false);
  });

  it('reports GREEN when a day\'s only findings are operator-specific AMBER', () => {
    // Direct user feedback (2026-09-16): the 2 known OPERATOR_SPECIFIC
    // placeholders fire identically on every flying day — this must not
    // headline the calendar badge as AMBER when nothing real is wrong.
    const evaluations: DatedRuleEvaluation[] = [
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

    const map = buildWorstSeverityMap(evaluations);

    expect(map.get('2026-10-05')).toBe('GREEN');
  });

  it('ignores operator-specific AMBER and reports the real GREEN worst instead', () => {
    const evaluations: DatedRuleEvaluation[] = [
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'fdp-table', severity: 'GREEN' }) },
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'operator-ulr-ftl-variation-scheme',
          severity: 'AMBER',
          isOperatorSpecific: true,
        }),
      },
    ];

    const map = buildWorstSeverityMap(evaluations);

    expect(map.get('2026-10-05')).toBe('GREEN');
  });

  it('still reports a real (non-operator-specific) RED even alongside operator-specific AMBER', () => {
    const evaluations: DatedRuleEvaluation[] = [
      {
        date: '2026-10-05',
        evaluation: makeEvaluation({
          ruleId: 'operator-ulr-ftl-variation-scheme',
          severity: 'AMBER',
          isOperatorSpecific: true,
        }),
      },
      { date: '2026-10-05', evaluation: makeEvaluation({ ruleId: 'min-rest', severity: 'RED' }) },
    ];

    const map = buildWorstSeverityMap(evaluations);

    expect(map.get('2026-10-05')).toBe('RED');
  });

  it('still reports a real (non-operator-specific) AMBER even alongside operator-specific AMBER', () => {
    const evaluations: DatedRuleEvaluation[] = [
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
        evaluation: makeEvaluation({ ruleId: 'cumulative-limits', severity: 'AMBER' }),
      },
    ];

    const map = buildWorstSeverityMap(evaluations);

    expect(map.get('2026-10-05')).toBe('AMBER');
  });
});
