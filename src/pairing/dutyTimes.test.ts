import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_OFFSET_MINUTES,
  computeDutyMinutes,
  computeReportTime,
  formatLocalHHMM,
  layoverMinutes,
  restMinutes,
  totalBlockMinutes,
} from './dutyTimes';

describe('computeReportTime', () => {
  it('defaults to STD minus 90 minutes and flags the result as an assumption', () => {
    const std = new Date('2026-02-01T07:50:00.000Z');
    const result = computeReportTime(std);
    expect(DEFAULT_REPORT_OFFSET_MINUTES).toBe(90);
    expect(result.reportOffsetMinutesUsed).toBe(90);
    expect(result.isAssumption).toBe(true);
    expect(result.reportUTC.toISOString()).toBe('2026-02-01T06:20:00.000Z');
  });

  it('honors a caller-supplied offset', () => {
    const std = new Date('2026-02-01T07:50:00.000Z');
    const result = computeReportTime(std, 60);
    expect(result.reportOffsetMinutesUsed).toBe(60);
    expect(result.reportUTC.toISOString()).toBe('2026-02-01T06:50:00.000Z');
  });

  it('throws for a negative offset', () => {
    expect(() => computeReportTime(new Date(), -1)).toThrow();
  });
});

describe('formatLocalHHMM', () => {
  it('formats a UTC instant into Asia/Dubai local time (UTC+4, no DST)', () => {
    // 07:50 UTC + 4h = 11:50 local.
    expect(formatLocalHHMM(new Date('2026-02-01T07:50:00.000Z'), 'Asia/Dubai')).toBe('11:50');
  });

  it('formats midnight UTC correctly for a UTC timezone', () => {
    expect(formatLocalHHMM(new Date('2026-02-01T00:00:00.000Z'), 'UTC')).toBe('00:00');
  });

  it('produces a value fdpTables.ts can parse (HH:MM, 00-23)', () => {
    const hhmm = formatLocalHHMM(new Date('2026-02-01T20:00:00.000Z'), 'Asia/Dubai');
    expect(hhmm).toMatch(/^([0-1]\d|2[0-3]):[0-5]\d$/);
  });
});

describe('totalBlockMinutes', () => {
  it('sums block times across legs', () => {
    expect(totalBlockMinutes([{ blockTimeMin: 455 }, { blockTimeMin: 440 }])).toBe(895);
  });

  it('returns 0 for no legs', () => {
    expect(totalBlockMinutes([])).toBe(0);
  });
});

describe('computeDutyMinutes', () => {
  it('computes minutes from report time to last on-blocks', () => {
    const report = new Date('2026-02-01T06:20:00.000Z');
    const onBlocks = new Date('2026-02-01T15:25:00.000Z');
    expect(computeDutyMinutes(report, onBlocks)).toBe(545);
  });

  it('throws when on-blocks is not after report time', () => {
    const report = new Date('2026-02-01T15:25:00.000Z');
    const onBlocks = new Date('2026-02-01T06:20:00.000Z');
    expect(() => computeDutyMinutes(report, onBlocks)).toThrow();
  });
});

describe('layoverMinutes', () => {
  it('computes ground time between an arrival and the next departure', () => {
    const arr = new Date('2026-02-01T15:25:00.000Z');
    const dep = new Date('2026-02-02T13:05:00.000Z');
    expect(layoverMinutes(arr, dep)).toBe(1300);
  });

  it('throws for a negative layover', () => {
    const arr = new Date('2026-02-02T13:05:00.000Z');
    const dep = new Date('2026-02-01T15:25:00.000Z');
    expect(() => layoverMinutes(arr, dep)).toThrow();
  });
});

describe('restMinutes', () => {
  it('computes rest between last on-blocks and the next report time', () => {
    const lastOnBlocks = new Date('2026-02-02T20:45:00.000Z');
    const nextReport = new Date('2026-02-04T06:00:00.000Z');
    expect(restMinutes(lastOnBlocks, nextReport)).toBe(1995);
  });

  it('throws for negative rest', () => {
    const lastOnBlocks = new Date('2026-02-04T06:00:00.000Z');
    const nextReport = new Date('2026-02-02T20:45:00.000Z');
    expect(() => restMinutes(lastOnBlocks, nextReport)).toThrow();
  });
});
