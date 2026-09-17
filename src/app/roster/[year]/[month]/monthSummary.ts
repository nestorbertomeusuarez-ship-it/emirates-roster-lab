/**
 * Whole-month totals for the header summary widget — direct user request
 * (2026-09-17): "en la esquina superior derecha puedes poner el sumatorio
 * de block y duty hours y dias libres en dxb".
 *
 * Reuses exactly the data `page.tsx` already computes (the roster grid's
 * `RosterDayCell[]`, `dayPresentation.ts`'s day-category map, and
 * `flightDaySummary.ts`'s per-day route/block/duty map) — no new
 * evaluation, no additional DB query.
 *
 * The "DXB days off" count intentionally mirrors
 * `DayCard.tsx`'s`resolveCalendarBadgeCategory` widening logic (an
 * unassigned day, or a STANDBY/SIM/GROUND_SCHOOL/VACATION day, must NOT
 * count as a confirmed day off, even though `classifyDayCategory` collapses
 * all of them to `DXB_OFF` for GCAA-evaluation purposes — see
 * docs/roster-gen-assumptions.md items 11/12/17) so this summary's total
 * never silently disagrees with what the calendar's own badges show.
 */

import type { RosterDayCell } from '@/pairing/db/roster';
import type { DutyType } from '@/pairing/types';
import type { DayCategory } from './dayPresentation';
import type { FlightDaySummary } from './flightDaySummary';

export interface MonthSummary {
  totalBlockMinutes: number;
  totalDutyMinutes: number;
  dxbDaysOff: number;
}

export function buildMonthSummary(
  cells: RosterDayCell[],
  dayCategoryByDate: Map<string, DayCategory>,
  flightDaySummaryByDate: Map<string, FlightDaySummary>
): MonthSummary {
  let totalBlockMinutes = 0;
  let totalDutyMinutes = 0;
  let dxbDaysOff = 0;

  for (const cell of cells) {
    const summary = flightDaySummaryByDate.get(cell.date);
    if (summary?.category === 'FLIGHT') {
      totalBlockMinutes += summary.blockMinutes;
      totalDutyMinutes += summary.dutyMinutes;
    }

    const category = dayCategoryByDate.get(cell.date);
    const dutyType = cell.entry?.dutyType as DutyType | undefined;
    if (category === 'DXB_OFF' && dutyType === 'OFF') {
      dxbDaysOff += 1;
    }
  }

  return { totalBlockMinutes, totalDutyMinutes, dxbDaysOff };
}
