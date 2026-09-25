import { describe, expect, it } from 'vitest';
import { generatePairings } from './generatePairings';
import type { DatedFlightInstance, PairingSearchConstraints } from './types';

let seq = 0;

/** Builds a synthetic DatedFlightInstance fixture. Times given as UTC 'YYYY-MM-DDTHH:MM'. */
function instance(overrides: Omit<Partial<DatedFlightInstance>, 'depUTC' | 'arrUTC'> & {
  depUTC: string;
  arrUTC: string;
}): DatedFlightInstance {
  seq += 1;
  const { depUTC, arrUTC, ...rest } = overrides;
  const dep = new Date(`${depUTC}:00.000Z`);
  const arr = new Date(`${arrUTC}:00.000Z`);
  return {
    scheduleLineId: `line-${seq}`,
    number: `EK${100 + seq}`,
    depIata: 'DXB',
    arrIata: 'XXX',
    serviceDate: depUTC.slice(0, 10),
    depUTC: dep,
    arrUTC: arr,
    blockTimeMin: Math.round((arr.getTime() - dep.getTime()) / 60000),
    aircraftType: 'A380',
    ...rest,
  };
}

const baseConstraints: PairingSearchConstraints = {
  homeBase: 'DXB',
  maxTripDays: 3,
  minLayoverMinutes: 8 * 60, // 8h
  maxLayoverMinutes: 36 * 60, // 36h
};

describe('generatePairings — simple out-and-back', () => {
  it('finds a 2-leg DXB-LHR-DXB pairing with a layover inside bounds', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'LHR',
      depUTC: '2026-02-01T07:50',
      arrUTC: '2026-02-01T15:25',
    });
    const back = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-02T13:05', // ~21h40 after arrival — within [8h, 36h]
      arrUTC: '2026-02-02T20:45',
    });

    const pairings = generatePairings([out, back], baseConstraints);

    expect(pairings).toHaveLength(1);
    expect(pairings[0].legs).toHaveLength(2);
    expect(pairings[0].legs[0].layoverMinutesBeforeThisLeg).toBeNull();
    expect(pairings[0].legs[1].layoverMinutesBeforeThisLeg).toBe(
      Math.round((back.depUTC.getTime() - out.arrUTC.getTime()) / 60000)
    );
    expect(pairings[0].fleetType).toBe('A380');
    expect(pairings[0].startServiceDate).toBe('2026-02-01');
    expect(pairings[0].endServiceDate).toBe('2026-02-02');
    expect(pairings[0].tripDays).toBe(2);
  });
});

describe('generatePairings — layover bounds', () => {
  const out = instance({
    depIata: 'DXB',
    arrIata: 'LHR',
    depUTC: '2026-02-01T07:50',
    arrUTC: '2026-02-01T15:25',
  });

  it('excludes a connection whose layover is below the minimum', () => {
    const back = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-01T18:00', // 2h35 after arrival — below 8h minimum
      arrUTC: '2026-02-02T01:00',
    });

    const pairings = generatePairings([out, back], baseConstraints);
    expect(pairings).toHaveLength(0);
  });

  it('excludes a connection whose layover exceeds the maximum', () => {
    const back = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-05T20:00', // days later — way above 36h maximum
      arrUTC: '2026-02-06T03:00',
    });

    const pairings = generatePairings([out, back], baseConstraints);
    expect(pairings).toHaveLength(0);
  });
});

describe('generatePairings — maxTripDays bounding', () => {
  it('prunes a connection that would push the trip past maxTripDays', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'LHR',
      depUTC: '2026-02-01T07:50',
      arrUTC: '2026-02-01T15:25',
    });
    const back = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-04T09:00', // 3 days later — would make a 4-day trip
      arrUTC: '2026-02-04T16:00',
    });

    const pairings = generatePairings([out, back], { ...baseConstraints, maxTripDays: 3 });
    expect(pairings).toHaveLength(0);

    const pairingsWithMoreRoom = generatePairings(
      [out, back],
      { ...baseConstraints, maxTripDays: 4, maxLayoverMinutes: 100 * 60 }
    );
    expect(pairingsWithMoreRoom).toHaveLength(1);
    expect(pairingsWithMoreRoom[0].tripDays).toBe(4);
  });
});

describe('generatePairings — mixed fleet types', () => {
  it('does NOT connect an outbound A350 leg with a return A380 leg', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'LHR',
      depUTC: '2026-02-01T07:50',
      arrUTC: '2026-02-01T15:25',
      aircraftType: 'A350',
    });
    const back = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-02T13:05',
      arrUTC: '2026-02-02T20:45',
      aircraftType: 'A380',
    });

    const pairings = generatePairings([out, back], baseConstraints);
    expect(pairings).toHaveLength(0);
  });

  it('does connect when both legs share the same fleet type', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'LHR',
      depUTC: '2026-02-01T07:50',
      arrUTC: '2026-02-01T15:25',
      aircraftType: 'A350',
    });
    const back = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-02T13:05',
      arrUTC: '2026-02-02T20:45',
      aircraftType: 'A350',
    });

    const pairings = generatePairings([out, back], baseConstraints);
    expect(pairings).toHaveLength(1);
  });
});

describe('generatePairings — multi-leg (3-leg) pairing via an intermediate outstation', () => {
  it('finds DXB -> JFK -> LHR -> DXB when connections fall within bounds', () => {
    const leg1 = instance({
      depIata: 'DXB',
      arrIata: 'JFK',
      depUTC: '2026-02-01T08:00',
      arrUTC: '2026-02-01T23:00',
    });
    const leg2 = instance({
      depIata: 'JFK',
      arrIata: 'LHR',
      depUTC: '2026-02-02T18:00', // 19h after JFK arrival
      arrUTC: '2026-02-03T03:00',
    });
    const leg3 = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-04T02:00', // 23h after LHR arrival
      arrUTC: '2026-02-04T09:00',
    });

    const pairings = generatePairings([leg1, leg2, leg3], {
      ...baseConstraints,
      maxTripDays: 4,
    });

    expect(pairings).toHaveLength(1);
    expect(pairings[0].legs.map((l) => l.instance.arrIata)).toEqual(['JFK', 'LHR', 'DXB']);
    expect(pairings[0].tripDays).toBe(4);
  });
});

describe('generatePairings — no candidates', () => {
  it('returns an empty array when no instance departs the home base', () => {
    const notFromHomeBase = instance({
      depIata: 'LHR',
      arrIata: 'JFK',
      depUTC: '2026-02-01T07:50',
      arrUTC: '2026-02-01T15:25',
    });
    expect(generatePairings([notFromHomeBase], baseConstraints)).toHaveLength(0);
  });

  it('throws for invalid layover bounds', () => {
    expect(() =>
      generatePairings([], { ...baseConstraints, minLayoverMinutes: 100, maxLayoverMinutes: 50 })
    ).toThrow();
  });
});

describe('generatePairings — turnaround window (docs/pairing-assumptions.md item 10)', () => {
  const turnaroundConstraints: PairingSearchConstraints = {
    ...baseConstraints,
    turnaroundMinMinutes: 45,
    turnaroundMaxMinutes: 150,
  };

  it('forms a 2-leg single-day pairing for a DXB-MCT-DXB turnaround with 75min ground time', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'MCT',
      depUTC: '2026-02-01T06:00',
      arrUTC: '2026-02-01T07:15',
    });
    const back = instance({
      depIata: 'MCT',
      arrIata: 'DXB',
      depUTC: '2026-02-01T08:30', // 75min ground time — inside [45,150]
      arrUTC: '2026-02-01T09:45',
    });

    const pairings = generatePairings([out, back], turnaroundConstraints);

    expect(pairings).toHaveLength(1);
    expect(pairings[0].legs).toHaveLength(2);
    expect(pairings[0].legs[1].layoverMinutesBeforeThisLeg).toBe(75);
    expect(pairings[0].tripDays).toBe(1);
  });

  it('rejects a connection whose ground time falls between the turnaround and layover windows', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'MCT',
      depUTC: '2026-02-01T06:00',
      arrUTC: '2026-02-01T07:15',
    });
    const back = instance({
      depIata: 'MCT',
      arrIata: 'DXB',
      depUTC: '2026-02-01T10:35', // 200min ground — above turnaround max, below layover min
      arrUTC: '2026-02-01T11:45',
    });

    expect(generatePairings([out, back], turnaroundConstraints)).toHaveLength(0);
  });

  it('still accepts a connection within the ordinary layover window when the turnaround window is configured', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'LHR',
      depUTC: '2026-02-01T07:50',
      arrUTC: '2026-02-01T15:25',
    });
    const back = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-02T13:05',
      arrUTC: '2026-02-02T20:45',
    });

    expect(generatePairings([out, back], turnaroundConstraints)).toHaveLength(1);
  });

  it('keeps existing behavior unchanged when the turnaround fields are absent', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'MCT',
      depUTC: '2026-02-01T06:00',
      arrUTC: '2026-02-01T07:15',
    });
    const back = instance({
      depIata: 'MCT',
      arrIata: 'DXB',
      depUTC: '2026-02-01T08:30', // 75min ground — below the 8h layover minimum, no turnaround window configured
      arrUTC: '2026-02-01T09:45',
    });

    expect(generatePairings([out, back], baseConstraints)).toHaveLength(0);
  });
});

describe('generatePairings — turnaroundOnlyStations (docs/pairing-assumptions.md item 11)', () => {
  const constraintsWithTurnaroundOnly: PairingSearchConstraints = {
    ...baseConstraints,
    turnaroundMinMinutes: 45,
    turnaroundMaxMinutes: 150,
    turnaroundOnlyStations: ['MCT'],
  };

  it('rejects an ordinary layover-window connection at a turnaround-only station', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'MCT',
      depUTC: '2026-02-01T06:00',
      arrUTC: '2026-02-01T07:15',
    });
    const back = instance({
      depIata: 'MCT',
      arrIata: 'DXB',
      depUTC: '2026-02-02T07:00', // ~24h ground — inside the ordinary layover window
      arrUTC: '2026-02-02T08:15',
    });

    expect(generatePairings([out, back], constraintsWithTurnaroundOnly)).toHaveLength(0);
  });

  it('still accepts a genuine turnaround-window connection at a turnaround-only station', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'MCT',
      depUTC: '2026-02-01T06:00',
      arrUTC: '2026-02-01T07:15',
    });
    const back = instance({
      depIata: 'MCT',
      arrIata: 'DXB',
      depUTC: '2026-02-01T08:30', // 75min ground — inside the turnaround window
      arrUTC: '2026-02-01T09:45',
    });

    expect(generatePairings([out, back], constraintsWithTurnaroundOnly)).toHaveLength(1);
  });

  it('leaves a station NOT in turnaroundOnlyStations able to use the ordinary layover window', () => {
    const out = instance({
      depIata: 'DXB',
      arrIata: 'LHR',
      depUTC: '2026-02-01T07:50',
      arrUTC: '2026-02-01T15:25',
    });
    const back = instance({
      depIata: 'LHR',
      arrIata: 'DXB',
      depUTC: '2026-02-02T13:05',
      arrUTC: '2026-02-02T20:45',
    });

    expect(generatePairings([out, back], constraintsWithTurnaroundOnly)).toHaveLength(1);
  });
});
