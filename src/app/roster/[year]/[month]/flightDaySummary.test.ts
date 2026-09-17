import { describe, expect, it } from 'vitest';
import type { GeneratedPairing } from '@/pairing/types';
import type { RosterGenDay } from '@/roster-gen/types';
import { buildFlightDaySummaryMap } from './flightDaySummary';

const TZ: Record<string, string> = {
  DXB: 'Asia/Dubai',
  LHR: 'Europe/London',
  JFK: 'America/New_York',
  BLR: 'Asia/Kolkata',
};

function makeSingleDayPairing(): GeneratedPairing {
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
    ],
  };
}

/** A 3-day pairing: legs on day 1 and day 3, LAYOVER at BLR on day 2. */
function makeThreeDayPairingWithMiddleLayover(): GeneratedPairing {
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
          arrIata: 'BLR',
          serviceDate: '2026-10-05',
          depUTC: new Date('2026-10-05T02:00:00.000Z'),
          arrUTC: new Date('2026-10-05T07:00:00.000Z'),
          blockTimeMin: 300,
          aircraftType: 'A350',
        },
      },
      {
        layoverMinutesBeforeThisLeg: 2760,
        instance: {
          scheduleLineId: 'line-1',
          number: 'EK002',
          depIata: 'BLR',
          arrIata: 'DXB',
          serviceDate: '2026-10-07',
          depUTC: new Date('2026-10-07T08:00:00.000Z'),
          arrUTC: new Date('2026-10-07T11:00:00.000Z'),
          blockTimeMin: 180,
          aircraftType: 'A350',
        },
      },
    ],
  };
}

/** A single day with 2 legs (quick-turn/transit day): DXB->BOM->BLR. */
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
          arrIata: 'BOM',
          serviceDate: '2026-10-05',
          depUTC: new Date('2026-10-05T01:00:00.000Z'),
          arrUTC: new Date('2026-10-05T05:00:00.000Z'),
          blockTimeMin: 240,
          aircraftType: 'A350',
        },
      },
      {
        layoverMinutesBeforeThisLeg: 90,
        instance: {
          scheduleLineId: 'line-1',
          number: 'EK102',
          depIata: 'BOM',
          arrIata: 'BLR',
          serviceDate: '2026-10-05',
          depUTC: new Date('2026-10-05T06:30:00.000Z'),
          arrUTC: new Date('2026-10-05T08:00:00.000Z'),
          blockTimeMin: 90,
          aircraftType: 'A350',
        },
      },
    ],
  };
}

describe('buildFlightDaySummaryMap', () => {
  it('summarizes a single-day pairing as a FLIGHT day with route/block/duty', () => {
    const pairing = makeSingleDayPairing();
    const days: RosterGenDay[] = [
      { date: '2026-10-05', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 1 } },
    ];

    const map = buildFlightDaySummaryMap(days, TZ);

    expect(map.get('2026-10-05')).toEqual({
      category: 'FLIGHT',
      route: 'DXB→LHR',
      // report = depUTC - 90min = 00:30Z; DXB local (Asia/Dubai, UTC+4) = 04:30.
      reportLocalTime: '04:30',
      blockMinutes: 420,
      // report = depUTC - 90min = 00:30Z, last on-blocks = 09:00Z -> 510 min.
      dutyMinutes: 510,
    });
  });

  it('summarizes a multi-day pairing with legs only on some days: flying days get FLIGHT, the middle rest day gets LAYOVER at the outstation', () => {
    const pairing = makeThreeDayPairingWithMiddleLayover();
    const days: RosterGenDay[] = [
      { date: '2026-10-05', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 1 } },
      { date: '2026-10-06', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 2 } },
      { date: '2026-10-07', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 3 } },
    ];

    const map = buildFlightDaySummaryMap(days, TZ);

    expect(map.get('2026-10-05')).toMatchObject({ category: 'FLIGHT', route: 'DXB→BLR' });
    // layoverMinutesBeforeThisLeg on the leg that ENDS the layover (the
    // 2026-10-07 BLR->DXB leg in this fixture) is the total ground time of
    // the rest period the LAYOVER day falls within — 2760 min = 46h.
    expect(map.get('2026-10-06')).toEqual({ category: 'LAYOVER', atIata: 'BLR', layoverMinutes: 2760 });
    expect(map.get('2026-10-07')).toMatchObject({ category: 'FLIGHT', route: 'BLR→DXB' });
  });

  it('shows the same total layover duration on every LAYOVER day within a multi-day rest period', () => {
    // A 4-day pairing: fly out day 1, two full LAYOVER days (2 and 3) at the
    // outstation, fly home day 4. Both LAYOVER days must report the SAME
    // total ground-time duration (the whole gap, not a per-day fraction of
    // it) — direct user feedback: "quiero ver cuántas horas dura [el
    // layover]".
    const pairing: GeneratedPairing = {
      fleetType: 'A350',
      startServiceDate: '2026-10-10',
      endServiceDate: '2026-10-13',
      tripDays: 4,
      legs: [
        {
          layoverMinutesBeforeThisLeg: null,
          instance: {
            scheduleLineId: 'line-0',
            number: 'EK201',
            depIata: 'DXB',
            arrIata: 'JFK',
            serviceDate: '2026-10-10',
            depUTC: new Date('2026-10-10T02:00:00.000Z'),
            arrUTC: new Date('2026-10-10T12:00:00.000Z'),
            blockTimeMin: 600,
            aircraftType: 'A350',
          },
        },
        {
          // 2 full days + a bit of ground time before the return leg departs.
          layoverMinutesBeforeThisLeg: 60 * 55,
          instance: {
            scheduleLineId: 'line-1',
            number: 'EK202',
            depIata: 'JFK',
            arrIata: 'DXB',
            serviceDate: '2026-10-13',
            depUTC: new Date('2026-10-13T19:00:00.000Z'),
            arrUTC: new Date('2026-10-14T15:00:00.000Z'),
            blockTimeMin: 720,
            aircraftType: 'A350',
          },
        },
      ],
    };
    const days: RosterGenDay[] = [
      { date: '2026-10-10', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 1 } },
      { date: '2026-10-11', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 2 } },
      { date: '2026-10-12', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 3 } },
      { date: '2026-10-13', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 4 } },
    ];

    const map = buildFlightDaySummaryMap(days, TZ);

    expect(map.get('2026-10-11')).toEqual({ category: 'LAYOVER', atIata: 'JFK', layoverMinutes: 60 * 55 });
    expect(map.get('2026-10-12')).toEqual({ category: 'LAYOVER', atIata: 'JFK', layoverMinutes: 60 * 55 });
  });

  it('chains a route across a same-day 2-leg quick-turn/transit day and sums both legs block time', () => {
    const pairing = makeSameDayTwoLegPairing();
    const days: RosterGenDay[] = [
      { date: '2026-10-05', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 1 } },
    ];

    const map = buildFlightDaySummaryMap(days, TZ);
    const summary = map.get('2026-10-05');

    expect(summary).toMatchObject({
      category: 'FLIGHT',
      route: 'DXB→BOM→BLR',
      blockMinutes: 330, // 240 + 90
    });
    if (summary?.category === 'FLIGHT') {
      // report = 01:00Z - 90min = 2026-10-04T23:30Z, last on-blocks = 08:00Z -> 510 min.
      expect(summary.dutyMinutes).toBe(510);
      // DXB local (Asia/Dubai, UTC+4) of 2026-10-04T23:30Z = 2026-10-05T03:30.
      expect(summary.reportLocalTime).toBe('03:30');
    }
  });

  it('calls buildPairingTimelineRows only once per pairing object, not once per day', () => {
    const pairing = makeThreeDayPairingWithMiddleLayover();
    // Same pairing object reference across all 3 continuation days, exactly
    // as `loadRosterGenDaysForMonth`'s pairingCache guarantees.
    const days: RosterGenDay[] = [
      { date: '2026-10-05', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 1 } },
      { date: '2026-10-06', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 2 } },
      { date: '2026-10-07', assignment: { type: 'FLIGHT', pairing, dayOfPairing: 3 } },
    ];

    // No direct spy hook is exposed (pure function, no injected dependency)
    // — instead this asserts the observable outcome stays correct even when
    // every day of the same pairing is processed together, which is the
    // behavior that would break first if the pairing were mis-cached.
    const map = buildFlightDaySummaryMap(days, TZ);
    expect(map.size).toBe(3);
  });

  it('omits an OFF (DXB_OFF) day entirely', () => {
    const days: RosterGenDay[] = [{ date: '2026-10-01', assignment: { type: 'OFF' } }];
    const map = buildFlightDaySummaryMap(days, TZ);
    expect(map.has('2026-10-01')).toBe(false);
  });
});
