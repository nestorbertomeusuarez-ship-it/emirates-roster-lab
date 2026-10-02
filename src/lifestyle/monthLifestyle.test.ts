import { describe, expect, it } from 'vitest';
import type { RosterDayCell } from '@/pairing/db/roster';
import type { GeneratedPairing } from '@/pairing/types';
import type { RosterGenDay } from '@/roster-gen/types';
import { buildMonthLifestyle } from './monthLifestyle';

function cell(date: string, dutyType: string | null): RosterDayCell {
  return { date, entry: dutyType ? { dutyType } as RosterDayCell['entry'] : null,
    isPairingContinuation: false, dayOfPairing: dutyType === 'FLIGHT' ? 1 : null };
}
function pairing(id: string, legs: [string, string, string, string][]): GeneratedPairing {
  return { id, fleetType: 'A350', startServiceDate: legs[0][2].slice(0, 10),
    endServiceDate: legs[legs.length - 1][2].slice(0, 10), tripDays: 2,
    legs: legs.map(([depIata, arrIata, dep, arr]) => ({ layoverMinutesBeforeThisLeg: null,
      instance: { scheduleLineId: 'test', number: 'EK1', depIata, arrIata,
        serviceDate: dep.slice(0, 10), depUTC: new Date(dep), arrUTC: new Date(arr),
        blockTimeMin: (+new Date(arr) - +new Date(dep)) / 60000, aircraftType: 'A350' } })) };
}
function days(p: GeneratedPairing, dates: string[]): RosterGenDay[] {
  return dates.map((date, n) => ({ date, assignment: { type: 'FLIGHT', pairing: p, dayOfPairing: n + 1 } }));
}
const zones = { DXB: 'Asia/Dubai', LHR: 'Europe/London', MCT: 'Asia/Muscat', JFK: 'America/New_York' };

describe('monthly lifestyle estimates', () => {
  it('does not turn unassigned, standby, training or leave into official OFF or clean family days', () => {
    const cells = ['OFF', 'STANDBY', 'SIM', 'GROUND_SCHOOL', 'VACATION', null].map((t, n) => cell(`2026-10-0${n + 1}`, t));
    const s = buildMonthLifestyle({ cells, rosterDays: [], airportTimeZones: zones, priorContextKnown: true });
    expect(s.officialOffDays).toBe(1);
    expect(s.realWorkDays).toBe(2);
    expect(s.fullHomeDays).toBe(2); // OFF + assumed home standby
    expect(s.fullFamilyQualityDays).toBe(1);
    expect(s.reports).toBe(2);
    expect(s.unknownDays).toBe(4); // training home hours + vacation + unassigned
    const atHomeLeave = buildMonthLifestyle({ cells, rosterDays: [], airportTimeZones: zones,
      priorContextKnown: true, config: { vacationAtHome: true, standbyAtHome: false } });
    expect(atHomeLeave.fullFamilyQualityDays).toBe(2);
    expect(atHomeLeave.officialOffDays).toBe(1);
  });

  it('counts a midnight turnaround as one report but two Dubai work days, with partial home and recovery', () => {
    const p = pairing('turn', [
      ['DXB', 'MCT', '2026-10-01T19:00Z', '2026-10-01T20:00Z'],
      ['MCT', 'DXB', '2026-10-01T21:00Z', '2026-10-01T22:00Z'],
    ]);
    const s = buildMonthLifestyle({ cells: [cell('2026-10-01', 'FLIGHT'), cell('2026-10-02', 'OFF'), cell('2026-10-03', 'OFF')],
      rosterDays: days(p, ['2026-10-01']), airportTimeZones: zones, priorContextKnown: true });
    expect(s.reports).toBe(1);
    expect(s.dxbFlightReports).toBe(1);
    expect(s.realWorkDays).toBe(2);
    expect(s.officialOffDays).toBe(2); // the OFF on arrival day is still OFF-coded
    expect(s.nightDutyMinutes).toBe(150); // midnight to release 02:30 Dubai
    expect(s.fullFamilyQualityDays).toBe(1);
    expect(s.days[1].homeHours).toBe(21); // home at 03:00
    expect(s.days[1].familyHours).toBe(7.5); // recovery until 14:30
    expect(s.fullHomeDays).toBe(1);
  });

  it('separates layover from actual work and counts DXB and outstation presentations', () => {
    const p = pairing('london', [
      ['DXB', 'LHR', '2026-10-01T06:00Z', '2026-10-01T13:00Z'],
      ['LHR', 'DXB', '2026-10-03T06:00Z', '2026-10-03T13:00Z'],
    ]);
    const s = buildMonthLifestyle({ cells: [cell('2026-10-01', 'FLIGHT'), cell('2026-10-02', 'FLIGHT'), cell('2026-10-03', 'FLIGHT'), cell('2026-10-04', 'OFF'), cell('2026-10-05', 'OFF')],
      rosterDays: days(p, ['2026-10-01', '2026-10-02', '2026-10-03']), airportTimeZones: zones, priorContextKnown: true });
    expect(s.realWorkDays).toBe(2);
    expect(s.reports).toBe(2);
    expect(s.dxbFlightReports).toBe(1);
    expect(s.outstationFlightReports).toBe(1);
    expect(s.days[1].status).toBe('AWAY');
    expect(s.jetlagTrips).toBe(1); // London offset +1 in October: delta 3
    expect(s.fullHomeDays).toBe(2);
    expect(s.fullFamilyQualityDays).toBe(1);
  });

  it('does not split a turnaround at UTC midnight or assign reports by UTC service date', () => {
    const p = pairing('utc-midnight', [
      ['DXB', 'MCT', '2026-09-30T22:00Z', '2026-09-30T23:00Z'],
      ['MCT', 'DXB', '2026-10-01T00:00Z', '2026-10-01T01:00Z'],
    ]);
    const cells = [cell('2026-10-01', 'FLIGHT'), cell('2026-10-02', 'OFF')];
    const s = buildMonthLifestyle({ cells,
      rosterDays: days(p, ['2026-10-01']), contextDays: days(p, ['2026-09-30']), airportTimeZones: zones, priorContextKnown: true });
    expect(s.reports).toBe(1); // report 00:30 October 1 Dubai, September 30 UTC
    expect(s.realWorkDays).toBe(1);
    expect(s.nightDutyMinutes).toBe(300);
    const noRecovery = buildMonthLifestyle({ cells,
      rosterDays: days(p, ['2026-10-01']), airportTimeZones: zones, priorContextKnown: true,
      config: { nightRecoveryHours: 0 } });
    expect(noRecovery.familyDayEquivalents).toBeGreaterThan(s.familyDayEquivalents);
  });

  it('carries prior-month return duty and jetlag recovery into the next Dubai month', () => {
    const p = pairing('previous', [
      ['DXB', 'JFK', '2026-09-28T06:00Z', '2026-09-28T20:00Z'],
      ['JFK', 'DXB', '2026-09-30T08:00Z', '2026-09-30T22:00Z'],
    ]);
    const context = days(p, ['2026-09-28', '2026-09-29', '2026-09-30']);
    const s = buildMonthLifestyle({ cells: [cell('2026-10-01', 'OFF'), cell('2026-10-02', 'OFF'), cell('2026-10-03', 'OFF')],
      rosterDays: [], contextDays: context, airportTimeZones: zones, priorContextKnown: true });
    expect(s.realWorkDays).toBe(1);
    expect(s.reports).toBe(0); // report happened in September
    expect(s.jetlagTrips).toBe(1); // returned 03:00 October 1 Dubai
    expect(s.fullFamilyQualityDays).toBe(1);
    expect(s.days[1].recoveryHours).toBe(15);
  });

  it('deduplicates continuation days and overlapping recovery windows', () => {
    const p = pairing('one', [['DXB', 'LHR', '2026-10-01T00:00Z', '2026-10-01T07:00Z'], ['LHR', 'DXB', '2026-10-02T00:00Z', '2026-10-02T07:00Z']]);
    const s = buildMonthLifestyle({ cells: [cell('2026-10-01', 'FLIGHT'), cell('2026-10-02', 'FLIGHT'), cell('2026-10-03', 'OFF')],
      rosterDays: days(p, ['2026-10-01', '2026-10-02']), contextDays: days({ ...p }, ['2026-10-01']), airportTimeZones: zones, priorContextKnown: true });
    expect(s.reports).toBe(2);
    expect(s.jetlagTrips).toBe(1);
    expect(s.days[1].recoveryHours).toBeLessThanOrEqual(24);
    expect(s.days.every(d => (d.familyHours ?? 0) >= 0 && (d.homeHours ?? 0) <= 24)).toBe(true);
  });

  it('uses actual station DST and fractional timezone offsets', () => {
    const p = pairing('winter', [['DXB', 'LHR', '2026-11-01T06:00Z', '2026-11-01T13:00Z'], ['LHR', 'DXB', '2026-11-02T06:00Z', '2026-11-02T13:00Z']]);
    const s = buildMonthLifestyle({ cells: [cell('2026-11-01', 'FLIGHT'), cell('2026-11-02', 'FLIGHT')], rosterDays: days(p, ['2026-11-01', '2026-11-02']), airportTimeZones: zones,
      priorContextKnown: true, config: { jetlagThresholdHours: 4 } });
    expect(s.jetlagTrips).toBe(1); // winter London delta 4
    const india = pairing('india', [['DXB', 'DEL', '2026-10-01T06:00Z', '2026-10-01T09:00Z'], ['DEL', 'DXB', '2026-10-01T10:00Z', '2026-10-01T13:00Z']]);
    const i = buildMonthLifestyle({ cells: [cell('2026-10-01', 'FLIGHT')], rosterDays: days(india, ['2026-10-01']), airportTimeZones: { DEL: 'Asia/Kolkata' }, priorContextKnown: true, config: { jetlagThresholdHours: 1.5 } });
    expect(i.jetlagTrips).toBe(1);
  });

  it('keeps unknown history and station data visible rather than claiming clean family days', () => {
    const s = buildMonthLifestyle({ cells: [cell('2026-10-01', 'OFF'), cell('2026-10-02', 'OFF'), cell('2026-10-03', 'OFF')], rosterDays: [], airportTimeZones: zones });
    expect(s.fullHomeDays).toBe(3);
    expect(s.fullFamilyQualityDays).toBe(1);
    expect(s.priorContextKnown).toBe(false);
    const p = pairing('missing', [['DXB', 'XYZ', '2026-10-01T06:00Z', '2026-10-01T13:00Z'], ['XYZ', 'DXB', '2026-10-02T06:00Z', '2026-10-02T13:00Z']]);
    const m = buildMonthLifestyle({ cells: [cell('2026-10-01', 'FLIGHT'), cell('2026-10-02', 'FLIGHT'), cell('2026-10-03', 'OFF')], rosterDays: days(p, ['2026-10-01', '2026-10-02']), airportTimeZones: {}, priorContextKnown: true });
    expect(m.missingTimeZoneTrips).toBe(1);
    expect(m.fullFamilyQualityDays).toBe(0);
  });

  it('counts only complete clean blocks within the month and reacts to recovery sensitivity', () => {
    const cells = Array.from({ length: 6 }, (_, i) => cell(`2026-10-0${i + 1}`, 'OFF'));
    const s = buildMonthLifestyle({ cells, rosterDays: [], airportTimeZones: zones, priorContextKnown: true });
    expect(s.longestFamilyBlock).toBe(6);
    expect(s.familyBlocksAtLeastThreeDays).toBe(1);
    expect(s.familyDayEquivalents).toBe(6);
    expect(() => buildMonthLifestyle({ cells, rosterDays: [], airportTimeZones: {}, config: { nightRecoveryHours: -1 } })).toThrow();
    expect(buildMonthLifestyle({ cells: [], rosterDays: [], airportTimeZones: {} }).reports).toBe(0);
  });
});
