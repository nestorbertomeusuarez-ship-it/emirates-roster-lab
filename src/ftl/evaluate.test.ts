import { describe, expect, it } from 'vitest';
import { evaluateDuty, overallSeverity } from './evaluate';
import type { CumulativeTotals, FlightDutyPeriod, RestPeriodInput } from './types';

describe('overallSeverity', () => {
  it('is GREEN when every evaluation is GREEN', () => {
    expect(
      overallSeverity([
        { citation: { ruleId: 'a', clause: '', document: '', documentUrl: '', dateConsulted: '' }, severity: 'GREEN', message: '' },
        { citation: { ruleId: 'b', clause: '', document: '', documentUrl: '', dateConsulted: '' }, severity: 'GREEN', message: '' },
      ])
    ).toBe('GREEN');
  });

  it('is AMBER when the worst evaluation is AMBER', () => {
    expect(
      overallSeverity([
        { citation: { ruleId: 'a', clause: '', document: '', documentUrl: '', dateConsulted: '' }, severity: 'GREEN', message: '' },
        { citation: { ruleId: 'b', clause: '', document: '', documentUrl: '', dateConsulted: '' }, severity: 'AMBER', message: '' },
      ])
    ).toBe('AMBER');
  });

  it('is RED when any evaluation is RED, even amongst AMBER/GREEN', () => {
    expect(
      overallSeverity([
        { citation: { ruleId: 'a', clause: '', document: '', documentUrl: '', dateConsulted: '' }, severity: 'AMBER', message: '' },
        { citation: { ruleId: 'b', clause: '', document: '', documentUrl: '', dateConsulted: '' }, severity: 'RED', message: '' },
        { citation: { ruleId: 'c', clause: '', document: '', documentUrl: '', dateConsulted: '' }, severity: 'GREEN', message: '' },
      ])
    ).toBe('RED');
  });

  it('is GREEN for an empty list', () => {
    expect(overallSeverity([])).toBe('GREEN');
  });
});

const acclimatisedFdp: FlightDutyPeriod = {
  reportLocalTime: '09:00',
  sectors: 1,
  scheduledSectorLengthsMin: [300],
  crewCount: 2,
  isAcclimatised: true,
  role: 'FLIGHT_CREW',
};

describe('evaluateDuty', () => {
  it('runs the FDP-table check informationally when no actual duration is supplied', () => {
    const evaluations = evaluateDuty(acclimatisedFdp, null, null);
    const fdpEval = evaluations.find((e) => e.citation.ruleId === 'gcaa-fdp-table-a-b');
    expect(fdpEval).toBeDefined();
    expect(fdpEval!.marginMinutes).toBeUndefined();
  });

  it('flags a breach when actualOrPlannedFdpMinutes exceeds the table max', () => {
    const evaluations = evaluateDuty(
      { ...acclimatisedFdp, actualOrPlannedFdpMinutes: 999 * 60 },
      null,
      null
    );
    const fdpEval = evaluations.find((e) => e.citation.ruleId === 'gcaa-fdp-table-a-b');
    expect(fdpEval!.severity).toBe('RED');
  });

  it('skips the min-rest check when rest is null and includes it when supplied', () => {
    const withoutRest = evaluateDuty(acclimatisedFdp, null, null);
    expect(
      withoutRest.some((e) => e.citation.clause === 'ORO.FTL.225.G')
    ).toBe(false);

    const rest: RestPeriodInput = {
      precedingDutyMinutes: 600,
      role: 'FLIGHT_CREW',
      awayFromBase: false,
      earnedRestMinutes: 720,
    };
    const withRest = evaluateDuty(acclimatisedFdp, rest, null);
    expect(withRest.some((e) => e.citation.clause === 'ORO.FTL.225.G')).toBe(true);
  });

  it('skips cumulative/days-off checks when cumulative is null and includes them when supplied', () => {
    const withoutCumulative = evaluateDuty(acclimatisedFdp, null, null);
    expect(
      withoutCumulative.some((e) => e.citation.clause === 'ORO.FTL.200.G')
    ).toBe(false);

    const cumulative: CumulativeTotals = {
      blockMinutes28d: 100,
      blockMinutes12mo: 100,
      dutyMinutes7d: 100,
      dutyMinutes14d: 100,
      dutyMinutes28d: 100,
      consecutiveDutyDays: 3,
      daysOffLast14: 2,
      daysOffLast28: 7,
      avgDaysOffPer28dOver3Periods: 8,
    };
    const withCumulative = evaluateDuty(acclimatisedFdp, null, cumulative);
    expect(withCumulative.some((e) => e.citation.clause === 'ORO.FTL.200.G')).toBe(true);
    expect(withCumulative.some((e) => e.citation.clause === 'ORO.FTL.205.G')).toBe(true);
  });

  it('always includes the 3 operator-specific evaluations, AMBER by default', () => {
    const evaluations = evaluateDuty(acclimatisedFdp, null, null);
    const operatorSpecific = evaluations.filter((e) => e.isOperatorSpecific);
    expect(operatorSpecific).toHaveLength(3);
    expect(operatorSpecific.every((e) => e.severity === 'AMBER')).toBe(true);
  });

  it('respects operatorConfig overrides for the operator-specific evaluations', () => {
    const evaluations = evaluateDuty(acclimatisedFdp, null, null, {
      ulrFtlVariationMaxFdpMinutes: 1000,
      augmentedCrewRestFacilityMaxFdpMinutes: 1100,
      maxPairingsPerMonth: 16,
    });
    const operatorSpecific = evaluations.filter((e) => e.isOperatorSpecific);
    expect(operatorSpecific.filter((e) => e.severity === 'GREEN')).toHaveLength(3);
  });

  it('includes an in-flight-rest evaluation only when both rest fields are supplied on the FDP', () => {
    const withoutInFlightRest = evaluateDuty(acclimatisedFdp, null, null);
    expect(
      withoutInFlightRest.some((e) => e.citation.clause === 'ORO.FTL.215.G(e)')
    ).toBe(false);

    const withInFlightRest = evaluateDuty(
      { ...acclimatisedFdp, inFlightRestMinutes: 200, inFlightRestFacility: 'BUNK' },
      null,
      null
    );
    expect(
      withInFlightRest.some((e) => e.citation.clause === 'ORO.FTL.215.G(e)')
    ).toBe(true);
  });

  it('surfaces a RED evaluation instead of throwing when the FDP inputs are invalid (e.g. >11h sector, not acclimatised, 2-pilot crew)', () => {
    const invalidFdp: FlightDutyPeriod = {
      reportLocalTime: '09:00',
      sectors: 1,
      scheduledSectorLengthsMin: [12 * 60],
      crewCount: 2,
      isAcclimatised: false,
      precedingRestHours: 10,
      role: 'FLIGHT_CREW',
    };
    const evaluations = evaluateDuty(invalidFdp, null, null);
    const fdpEval = evaluations.find((e) => e.citation.ruleId === 'gcaa-fdp-table-a-b');
    expect(fdpEval!.severity).toBe('RED');
  });
});
