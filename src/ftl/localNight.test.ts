import { describe, expect, it } from 'vitest';
import { LOCAL_NIGHT_END_HOUR, LOCAL_NIGHT_START_HOUR, countLocalNightsWithinWindow } from './localNight';

// Asia/Dubai is a fixed UTC+4 offset year-round (no daylight saving) —
// exact UTC instants for local 22:00/06:00 are computable by hand, making
// this the clearest fixture to verify the night-counting logic against.
const DXB = 'Asia/Dubai';

describe('countLocalNightsWithinWindow', () => {
  it('exposes the confirmed 22:00-06:00 local night window', () => {
    expect(LOCAL_NIGHT_START_HOUR).toBe(22);
    expect(LOCAL_NIGHT_END_HOUR).toBe(6);
  });

  it('counts exactly 2 nights for a window covering exactly 2 full local nights', () => {
    // Night 1: local 2027-06-01 22:00 -> 2027-06-02 06:00 = UTC 18:00 -> 02:00 (UTC+4).
    // Night 2: local 2027-06-02 22:00 -> 2027-06-03 06:00 = UTC 18:00 -> 02:00.
    const start = new Date('2027-06-01T18:00:00.000Z');
    const end = new Date('2027-06-03T02:00:00.000Z');
    expect(countLocalNightsWithinWindow(start, end, DXB)).toBe(2);
  });

  it('does not count a night the window only partially covers', () => {
    // Ends 1 hour before night 2's local 06:00 -> only night 1 is fully covered.
    const start = new Date('2027-06-01T18:00:00.000Z');
    const end = new Date('2027-06-03T01:00:00.000Z');
    expect(countLocalNightsWithinWindow(start, end, DXB)).toBe(1);
  });

  it('extra time before/after a fully-covered night does not manufacture an extra one', () => {
    const start = new Date('2027-06-01T16:00:00.000Z'); // local 20:00, 2h before night 1 starts
    const end = new Date('2027-06-03T04:00:00.000Z'); // local 08:00, 2h after night 2 ends
    expect(countLocalNightsWithinWindow(start, end, DXB)).toBe(2);
  });

  it('counts 0 for a rest shorter than one full local night', () => {
    const start = new Date('2027-06-01T20:00:00.000Z'); // local 00:00
    const end = new Date('2027-06-02T00:00:00.000Z'); // local 04:00 — inside night 1, but doesn't cover its start
    expect(countLocalNightsWithinWindow(start, end, DXB)).toBe(0);
  });

  it('returns 0 for an empty or inverted window', () => {
    const t = new Date('2027-06-01T18:00:00.000Z');
    expect(countLocalNightsWithinWindow(t, t, DXB)).toBe(0);
    expect(countLocalNightsWithinWindow(new Date(t.getTime() + 1000), t, DXB)).toBe(0);
  });

  it('works for a different fixed-offset timezone (Asia/Tokyo, UTC+9, no daylight saving)', () => {
    // Night: local 2027-06-01 22:00 -> 06-02 06:00 = UTC 13:00 -> 21:00 (UTC+9).
    const start = new Date('2027-06-01T13:00:00.000Z');
    const end = new Date('2027-06-01T21:00:00.000Z');
    expect(countLocalNightsWithinWindow(start, end, 'Asia/Tokyo')).toBe(1);
  });
});
