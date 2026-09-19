import { describe, expect, it } from 'vitest';
import {
  LOCAL_NIGHT_BAND_END_HOUR,
  LOCAL_NIGHT_BAND_START_HOUR,
  LOCAL_NIGHT_REQUIRED_HOURS,
  restPeriodIncludesLocalNight,
} from './localNight';

// Asia/Dubai is a fixed UTC+4 offset year-round (no daylight saving) —
// exact UTC instants for local 22:00/08:00 are computable by hand, making
// this the clearest fixture to verify the overlap logic against.
const DXB = 'Asia/Dubai';

describe('restPeriodIncludesLocalNight', () => {
  it('exposes the real GCAA local-night band and required duration', () => {
    expect(LOCAL_NIGHT_BAND_START_HOUR).toBe(22);
    expect(LOCAL_NIGHT_BAND_END_HOUR).toBe(8);
    expect(LOCAL_NIGHT_REQUIRED_HOURS).toBe(8);
  });

  it('is true when the rest period fully contains the 10h band (22:00-08:00 local)', () => {
    // Local 2027-06-01 22:00 -> 06-02 08:00 = UTC 18:00 -> 04:00 (UTC+4).
    const start = new Date('2027-06-01T18:00:00.000Z');
    const end = new Date('2027-06-02T04:00:00.000Z');
    expect(restPeriodIncludesLocalNight(start, end, DXB)).toBe(true);
  });

  it('is true at exactly 8h of overlap, not just full 10h containment', () => {
    // Rest covers local 22:00 -> 06:00 only (8h of the 10h band).
    const start = new Date('2027-06-01T18:00:00.000Z'); // local 22:00
    const end = new Date('2027-06-02T02:00:00.000Z'); // local 06:00
    expect(restPeriodIncludesLocalNight(start, end, DXB)).toBe(true);
  });

  it('is false at 7h59m of overlap, 1 minute short of a local night', () => {
    const start = new Date('2027-06-01T18:00:00.000Z'); // local 22:00
    const end = new Date('2027-06-02T01:59:00.000Z'); // local 05:59
    expect(restPeriodIncludesLocalNight(start, end, DXB)).toBe(false);
  });

  it('is false when the rest period never touches the local-night band at all', () => {
    // Local 08:00 -> 20:00 the same day — entirely daytime.
    const start = new Date('2027-06-01T04:00:00.000Z');
    const end = new Date('2027-06-01T16:00:00.000Z');
    expect(restPeriodIncludesLocalNight(start, end, DXB)).toBe(false);
  });

  it('is false when overlap is split across two separate band instances, neither reaching 8h alone', () => {
    // Rest: local 03:30 (June 2) -> 16:30 (June 2). Overlaps band instance 1
    // (June1 22:00 -> June2 08:00) for 4.5h only (03:30->08:00); never
    // reaches band instance 2 (June2 22:00 onward) at all.
    const start = new Date('2027-06-01T23:30:00.000Z'); // local 03:30 June 2
    const end = new Date('2027-06-02T12:30:00.000Z'); // local 16:30 June 2
    expect(restPeriodIncludesLocalNight(start, end, DXB)).toBe(false);
  });

  it('returns false for an empty or inverted window', () => {
    const t = new Date('2027-06-01T18:00:00.000Z');
    expect(restPeriodIncludesLocalNight(t, t, DXB)).toBe(false);
    expect(restPeriodIncludesLocalNight(new Date(t.getTime() + 1000), t, DXB)).toBe(false);
  });

  it('works for a different fixed-offset timezone (Asia/Tokyo, UTC+9, no daylight saving)', () => {
    // Local 22:00 -> 08:00 = UTC 13:00 -> 23:00 (UTC+9).
    const start = new Date('2027-06-01T13:00:00.000Z');
    const end = new Date('2027-06-01T23:00:00.000Z');
    expect(restPeriodIncludesLocalNight(start, end, 'Asia/Tokyo')).toBe(true);
  });
});
