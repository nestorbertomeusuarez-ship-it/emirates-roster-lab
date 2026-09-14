import { describe, expect, it } from 'vitest';
import { expandScheduleToInstances } from './expandScheduleToInstances';
import type { ScheduleLine } from './types';

function line(overrides: Partial<ScheduleLine> = {}): ScheduleLine {
  return {
    id: 'line-1',
    number: 'EK001',
    depIata: 'DXB',
    arrIata: 'LHR',
    stdUTCMin: 470,
    staUTCMin: 925,
    arrivalDayOffset: 0,
    blockTimeMin: 455,
    aircraftType: 'A380',
    daysOfWeek: '1111111', // daily
    effectiveFrom: '2026-02-01',
    effectiveTo: '2026-02-28',
    ...overrides,
  };
}

describe('expandScheduleToInstances', () => {
  it('produces one instance per operating day for a daily line spanning the whole month', () => {
    const instances = expandScheduleToInstances([line()], 2026, 2);
    expect(instances).toHaveLength(28); // Feb 2026 has 28 days

    const first = instances[0];
    expect(first.serviceDate).toBe('2026-02-01');
    expect(first.number).toBe('EK001');
    expect(first.depIata).toBe('DXB');
    expect(first.arrIata).toBe('LHR');
    expect(first.aircraftType).toBe('A380');
    // depUTC = 2026-02-01T00:00Z + 470 min
    expect(first.depUTC.toISOString()).toBe('2026-02-01T07:50:00.000Z');
    expect(first.arrUTC.toISOString()).toBe('2026-02-01T15:25:00.000Z');

    const last = instances[instances.length - 1];
    expect(last.serviceDate).toBe('2026-02-28');
  });

  it('handles a daysOfWeek pattern excluding some weekdays (e.g. Mon/Wed/Fri only)', () => {
    // '1010100' = Mon, Wed, Fri only.
    const instances = expandScheduleToInstances(
      [line({ daysOfWeek: '1010100' })],
      2026,
      2
    );
    // Feb 2026: Sundays start the calendar oddly — verify every produced
    // date actually falls on Mon/Wed/Fri and none on other weekdays.
    for (const inst of instances) {
      const dow = new Date(`${inst.serviceDate}T00:00:00.000Z`).getUTCDay();
      // Mon=1, Wed=3, Fri=5 in JS's Sunday=0 convention.
      expect([1, 3, 5]).toContain(dow);
    }
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.length).toBeLessThan(28);
  });

  it('clips to the overlap when effectiveFrom/effectiveTo only partially covers the requested month', () => {
    const instances = expandScheduleToInstances(
      [line({ effectiveFrom: '2026-02-15', effectiveTo: '2026-03-10' })],
      2026,
      2
    );
    expect(instances[0].serviceDate).toBe('2026-02-15');
    expect(instances[instances.length - 1].serviceDate).toBe('2026-02-28');
    expect(instances).toHaveLength(14); // 15th..28th inclusive
  });

  it('produces zero instances when the effective range does not overlap the requested month at all', () => {
    const instances = expandScheduleToInstances(
      [line({ effectiveFrom: '2026-04-01', effectiveTo: '2026-04-30' })],
      2026,
      2
    );
    expect(instances).toHaveLength(0);
  });

  it('produces zero instances for a daysOfWeek pattern with no operating days', () => {
    const instances = expandScheduleToInstances(
      [line({ daysOfWeek: '0000000' })],
      2026,
      2
    );
    expect(instances).toHaveLength(0);
  });

  it('handles an overnight arrival (arrivalDayOffset = 1) by shifting arrUTC to the next calendar day', () => {
    const instances = expandScheduleToInstances(
      [
        line({
          number: 'EK202',
          depIata: 'JFK',
          arrIata: 'DXB',
          stdUTCMin: 1350,
          staUTCMin: 665,
          arrivalDayOffset: 1,
          blockTimeMin: 755,
        }),
      ],
      2026,
      2
    );
    const first = instances[0];
    expect(first.depUTC.toISOString()).toBe('2026-02-01T22:30:00.000Z');
    // arrUTC = day + (665 + 1440) min = day + 1 day + 11:05
    expect(first.arrUTC.toISOString()).toBe('2026-02-02T11:05:00.000Z');
  });

  it('merges instances from multiple schedule lines and sorts by departure time', () => {
    const instances = expandScheduleToInstances(
      [
        line({ id: 'a', number: 'EK001', stdUTCMin: 470, effectiveTo: '2026-02-01' }),
        line({ id: 'b', number: 'EK021', depIata: 'DXB', arrIata: 'EDI', stdUTCMin: 100, effectiveTo: '2026-02-01' }),
      ],
      2026,
      2
    );
    expect(instances).toHaveLength(2);
    expect(instances[0].number).toBe('EK021'); // earlier stdUTCMin sorts first
    expect(instances[1].number).toBe('EK001');
  });

  it('throws for an out-of-range month', () => {
    expect(() => expandScheduleToInstances([line()], 2026, 0)).toThrow();
    expect(() => expandScheduleToInstances([line()], 2026, 13)).toThrow();
  });
});
