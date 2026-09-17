import { describe, expect, it } from 'vitest';
import type { RosterDayCell } from '@/pairing/db/roster';
import type { DayCategory } from './dayPresentation';
import type { FlightDaySummary } from './flightDaySummary';
import { buildMonthSummary } from './monthSummary';

function makeCell(
  date: string,
  overrides: Partial<Omit<RosterDayCell, 'date'>> = {}
): RosterDayCell {
  return {
    date,
    entry: null,
    isPairingContinuation: false,
    dayOfPairing: null,
    ...overrides,
  };
}

describe('buildMonthSummary', () => {
  it('sums block and duty minutes across every FLIGHT-category day', () => {
    const cells = [makeCell('2026-10-01'), makeCell('2026-10-02')];
    const categories = new Map<string, DayCategory>([
      ['2026-10-01', 'FLIGHT'],
      ['2026-10-02', 'FLIGHT'],
    ]);
    const summaries = new Map<string, FlightDaySummary>([
      ['2026-10-01', { category: 'FLIGHT', route: 'DXB→LHR', blockMinutes: 420, dutyMinutes: 510 }],
      ['2026-10-02', { category: 'FLIGHT', route: 'LHR→DXB', blockMinutes: 400, dutyMinutes: 490 }],
    ]);

    const result = buildMonthSummary(cells, categories, summaries);

    expect(result.totalBlockMinutes).toBe(820);
    expect(result.totalDutyMinutes).toBe(1000);
  });

  it('counts an explicit OFF day as a DXB day off', () => {
    const cells = [
      makeCell('2026-10-01', { entry: { dutyType: 'OFF' } as RosterDayCell['entry'] }),
    ];
    const categories = new Map<string, DayCategory>([['2026-10-01', 'DXB_OFF']]);

    const result = buildMonthSummary(cells, categories, new Map());

    expect(result.dxbDaysOff).toBe(1);
  });

  it('does NOT count STANDBY/SIM/GROUND_SCHOOL/VACATION as a DXB day off, even though classifyDayCategory collapses them to DXB_OFF', () => {
    // Same widening logic as DayCard.tsx#resolveCalendarBadgeCategory —
    // this summary must stay consistent with what the calendar badges
    // actually show, or the totals would silently disagree with the grid.
    const cells = [
      makeCell('2026-10-01', { entry: { dutyType: 'STANDBY' } as RosterDayCell['entry'] }),
      makeCell('2026-10-02', { entry: { dutyType: 'SIM' } as RosterDayCell['entry'] }),
      makeCell('2026-10-03', { entry: { dutyType: 'GROUND_SCHOOL' } as RosterDayCell['entry'] }),
      makeCell('2026-10-04', { entry: { dutyType: 'VACATION' } as RosterDayCell['entry'] }),
    ];
    const categories = new Map<string, DayCategory>([
      ['2026-10-01', 'DXB_OFF'],
      ['2026-10-02', 'DXB_OFF'],
      ['2026-10-03', 'DXB_OFF'],
      ['2026-10-04', 'DXB_OFF'],
    ]);

    const result = buildMonthSummary(cells, categories, new Map());

    expect(result.dxbDaysOff).toBe(0);
  });

  it('does not count an unassigned day (no entry) as a confirmed DXB day off', () => {
    const cells = [makeCell('2026-10-01')];
    const categories = new Map<string, DayCategory>([['2026-10-01', 'DXB_OFF']]);

    const result = buildMonthSummary(cells, categories, new Map());

    expect(result.dxbDaysOff).toBe(0);
  });

  it('does not count a LAYOVER day as a DXB day off', () => {
    const cells = [makeCell('2026-10-02', { isPairingContinuation: true, dayOfPairing: 2 })];
    const categories = new Map<string, DayCategory>([['2026-10-02', 'LAYOVER']]);

    const result = buildMonthSummary(cells, categories, new Map());

    expect(result.dxbDaysOff).toBe(0);
    expect(result.totalBlockMinutes).toBe(0);
  });
});
