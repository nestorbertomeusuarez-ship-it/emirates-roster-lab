import { describe, expect, it } from 'vitest';
import { evaluateDuty } from '../ftl/evaluate';
import { generatePairings } from './generatePairings';
import { toFlightDutyPeriod } from './toFlightDutyPeriod';
import { computeReportTime } from './dutyTimes';
import type { DatedFlightInstance, PairingSearchConstraints } from './types';

describe('toFlightDutyPeriod — integration with Phase 3 evaluateDuty()', () => {
  it('converts a real generated pairing leg into a FlightDutyPeriod and runs it through evaluateDuty() without crashing', () => {
    // Build a small synthetic instance pool and generate a real pairing from it.
    const out: DatedFlightInstance = {
      scheduleLineId: 'line-1',
      number: 'EK001',
      depIata: 'DXB',
      arrIata: 'LHR',
      serviceDate: '2026-02-01',
      depUTC: new Date('2026-02-01T07:50:00.000Z'),
      arrUTC: new Date('2026-02-01T15:25:00.000Z'),
      blockTimeMin: 455,
      aircraftType: 'A380',
    };
    const back: DatedFlightInstance = {
      scheduleLineId: 'line-2',
      number: 'EK002',
      depIata: 'LHR',
      arrIata: 'DXB',
      serviceDate: '2026-02-02',
      depUTC: new Date('2026-02-02T13:05:00.000Z'),
      arrUTC: new Date('2026-02-02T20:45:00.000Z'),
      blockTimeMin: 460,
      aircraftType: 'A380',
    };

    const constraints: PairingSearchConstraints = {
      homeBase: 'DXB',
      maxTripDays: 3,
      minLayoverMinutes: 8 * 60,
      maxLayoverMinutes: 36 * 60,
    };

    const pairings = generatePairings([out, back], constraints);
    expect(pairings).toHaveLength(1);
    const pairing = pairings[0];

    // Convert the pairing's first duty day (a single sector: DXB -> LHR) into
    // a FlightDutyPeriod, using the DEFAULT_REPORT_OFFSET_MINUTES assumption.
    const firstLeg = pairing.legs[0].instance;
    const { reportUTC } = computeReportTime(firstLeg.depUTC);

    const fdp = toFlightDutyPeriod({
      reportUTC,
      depAirportTz: 'Asia/Dubai',
      legs: [{ blockTimeMin: firstLeg.blockTimeMin }],
      lastOnBlocksUTC: firstLeg.arrUTC,
      isAcclimatised: true,
    });

    // Shape assertions — matches src/ftl/types.ts's FlightDutyPeriod contract.
    expect(fdp.sectors).toBe(1);
    expect(fdp.scheduledSectorLengthsMin).toEqual([455]);
    expect(fdp.crewCount).toBe(2);
    expect(fdp.role).toBe('FLIGHT_CREW');
    expect(fdp.reportLocalTime).toMatch(/^([0-1]\d|2[0-3]):[0-5]\d$/);
    expect(fdp.actualOrPlannedFdpMinutes).toBeGreaterThan(0);

    // Run it through the real Phase 3 evaluator — the actual point of this test.
    const evaluations = evaluateDuty(fdp, null, null);

    expect(Array.isArray(evaluations)).toBe(true);
    expect(evaluations.length).toBeGreaterThan(0);
    for (const evaluation of evaluations) {
      expect(['GREEN', 'AMBER', 'RED']).toContain(evaluation.severity);
      expect(evaluation.citation).toBeDefined();
      expect(typeof evaluation.message).toBe('string');
    }

    // The FDP-table evaluation specifically should be informational-or-pass
    // (not RED) for a normal 1-sector daytime duty well inside GCAA limits.
    const fdpTableResult = evaluations.find((e) => e.citation.ruleId === 'gcaa-fdp-table-a-b');
    expect(fdpTableResult).toBeDefined();
    expect(fdpTableResult!.severity).not.toBe('RED');
  });
});
