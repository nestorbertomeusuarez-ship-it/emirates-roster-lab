import { describe, expect, it } from 'vitest';
import type { GeneratedPairing } from '@/pairing/types';
import { buildPairingTimelineRows } from './pairingTimelineData';

const TZ: Record<string, string> = {
  DXB: 'Asia/Dubai',
  LHR: 'Europe/London',
  JFK: 'America/New_York',
};

function makeSingleLegDayPairing(): GeneratedPairing {
  return {
    fleetType: 'A350',
    startServiceDate: '2026-10-05',
    endServiceDate: '2026-10-07',
    tripDays: 3,
    legs: [
      {
        layoverMinutesBeforeThisLeg: null,
        instance: {
          scheduleLineId: 'line-0',
          number: 'EK001',
          depIata: 'DXB',
          arrIata: 'LHR',
          serviceDate: '2026-10-05',
          depUTC: new Date('2026-10-05T02:00:00.000Z'),
          arrUTC: new Date('2026-10-05T09:00:00.000Z'),
          blockTimeMin: 420,
          aircraftType: 'A350',
        },
      },
      {
        layoverMinutesBeforeThisLeg: 2760, // 46h ground time at LHR
        instance: {
          scheduleLineId: 'line-1',
          number: 'EK002',
          depIata: 'LHR',
          arrIata: 'DXB',
          serviceDate: '2026-10-07',
          depUTC: new Date('2026-10-07T08:00:00.000Z'),
          arrUTC: new Date('2026-10-07T15:00:00.000Z'),
          blockTimeMin: 420,
          aircraftType: 'A350',
        },
      },
    ],
  };
}

function makeSameDayTwoLegPairing(): GeneratedPairing {
  return {
    fleetType: 'A350',
    startServiceDate: '2026-10-05',
    endServiceDate: '2026-10-05',
    tripDays: 1,
    legs: [
      {
        layoverMinutesBeforeThisLeg: null,
        instance: {
          scheduleLineId: 'line-0',
          number: 'EK101',
          depIata: 'DXB',
          arrIata: 'JFK',
          serviceDate: '2026-10-05',
          depUTC: new Date('2026-10-05T01:00:00.000Z'),
          arrUTC: new Date('2026-10-05T15:00:00.000Z'),
          blockTimeMin: 840,
          aircraftType: 'A350',
        },
      },
      {
        layoverMinutesBeforeThisLeg: 120,
        instance: {
          scheduleLineId: 'line-1',
          number: 'EK102',
          depIata: 'JFK',
          arrIata: 'DXB',
          serviceDate: '2026-10-05',
          depUTC: new Date('2026-10-05T17:00:00.000Z'),
          arrUTC: new Date('2026-10-06T09:00:00.000Z'),
          blockTimeMin: 780,
          aircraftType: 'A350',
        },
      },
    ],
  };
}

describe('buildPairingTimelineRows', () => {
  it('produces one row per leg, in leg order, with local dep/arr times and block time', () => {
    const rows = buildPairingTimelineRows(makeSingleLegDayPairing(), TZ);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      legIndex: 0,
      serviceDate: '2026-10-05',
      flightNumber: 'EK001',
      depIata: 'DXB',
      arrIata: 'LHR',
      blockTimeMin: 420,
      layoverBeforeMinutes: null,
    });
    expect(rows[1]).toMatchObject({
      legIndex: 1,
      serviceDate: '2026-10-07',
      flightNumber: 'EK002',
      layoverBeforeMinutes: 2760,
    });
  });

  it('formats local departure/arrival times using each station timezone', () => {
    const rows = buildPairingTimelineRows(makeSingleLegDayPairing(), TZ);

    // 2026-10-05T02:00:00Z in Asia/Dubai (UTC+4) is 06:00 local.
    expect(rows[0].depLocalTime).toBe('06:00');
    // 2026-10-05T09:00:00Z in Europe/London (BST, UTC+1 in October) is 10:00 local.
    expect(rows[0].arrLocalTime).toBe('10:00');
  });

  it('falls back to UTC when a station is missing from the timezone map', () => {
    const rows = buildPairingTimelineRows(makeSingleLegDayPairing(), {});
    expect(rows[0].depLocalTime).toBe('02:00');
  });

  it('computes each day duty minutes from report time to last on-blocks, one value per day', () => {
    const rows = buildPairingTimelineRows(makeSingleLegDayPairing(), TZ);

    // Day 1: report = depUTC - 90min = 00:30Z, last on-blocks = 09:00Z -> 510 min duty.
    expect(rows[0].dailyDutyMinutes).toBe(510);
    // Day 2 (day 3 of trip): report = 08:00Z - 90min = 06:30Z, last on-blocks = 15:00Z -> 510 min duty.
    expect(rows[1].dailyDutyMinutes).toBe(510);
  });

  it('shares one dailyDutyMinutes value across multiple legs on the same day', () => {
    const rows = buildPairingTimelineRows(makeSameDayTwoLegPairing(), TZ);

    // report = 01:00Z - 90min = 2026-10-04T23:30Z, last on-blocks = 2026-10-06T09:00Z -> 2010 min.
    expect(rows[0].dailyDutyMinutes).toBe(rows[1].dailyDutyMinutes);
    expect(rows[0].dailyDutyMinutes).toBe(2010);
  });

  it('accumulates cumulativeDutyMinutes as a running sum across days, not legs', () => {
    const rows = buildPairingTimelineRows(makeSingleLegDayPairing(), TZ);

    expect(rows[0].cumulativeDutyMinutes).toBe(510);
    expect(rows[1].cumulativeDutyMinutes).toBe(1020);
  });
});
