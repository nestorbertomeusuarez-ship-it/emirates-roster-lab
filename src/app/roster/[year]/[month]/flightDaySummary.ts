/**
 * Compact per-day flight summary for the calendar grid — direct user
 * feedback (2026-09-16): a FLIGHT day's card showed only the text
 * "FLIGHT (2d)" with no route, block, or duty time, forcing a click-through
 * to the pairing detail page for any of that. This module computes a
 * lightweight per-day summary so `DayCard.tsx` can render it inline.
 *
 * Reuses `pairingTimelineData.ts#buildPairingTimelineRows` — the exact same
 * route/block/duty computation the pairing detail page already uses — rather
 * than re-deriving it. Called at most ONCE per pairing per month: multiple
 * `RosterGenDay`s can share the same `assignment.pairing` object (the
 * continuation days of one pairing), and `loadRosterGenDaysForMonth`'s own
 * `pairingCache` (see src/roster-gen/db/loadRosterGenDays.ts) guarantees
 * those `RosterGenDay`s carry the exact same in-memory `GeneratedPairing`
 * object reference — so a `Map` keyed by that object reference is a safe and
 * correct per-pairing cache/dedupe key here.
 *
 * Kept separate from `page.tsx`/`DayCard.tsx` per this project's established
 * precedent (see `complianceGrouping.ts`'s/`dayPresentation.ts`'s doc
 * comments) — unit-test pure logic, not the page/component.
 */

import type { GeneratedPairing } from '@/pairing/types';
import type { RosterGenDay } from '@/roster-gen/types';
import { classifyDayCategory } from './dayPresentation';
import { buildPairingTimelineRows, type PairingTimelineRow } from './pairing/[pairingId]/pairingTimelineData';

/**
 * A FLIGHT-category day's compact summary carries the day's own route
 * (which may chain more than one leg — e.g. a quick-turn/transit day),
 * total block minutes for that day, and that day's duty minutes (see
 * `pairingTimelineData.ts#PairingTimelineRow.dailyDutyMinutes` — the same
 * value on every leg that day, computed once).
 *
 * A LAYOVER-category day (no leg operates that date — a pure rest day
 * within an active pairing, per `dayPresentation.ts#classifyDayCategory`)
 * has nothing flown to summarize, but the outstation the crew is currently
 * at, and the total layover duration, are still useful at-a-glance context
 * (direct user feedback, 2026-09-16: "en layover quiero ver directamente
 * cuántas horas dura"), so it gets its own compact variant rather than
 * being omitted entirely.
 */
export type FlightDaySummary =
  | { category: 'FLIGHT'; route: string; blockMinutes: number; dutyMinutes: number }
  | { category: 'LAYOVER'; atIata: string; layoverMinutes: number };

/**
 * Builds a date ('YYYY-MM-DD') -> `FlightDaySummary` lookup for a whole
 * month's `RosterGenDay[]`. Only FLIGHT and LAYOVER category days produce an
 * entry — DXB_OFF (and any day with no FLIGHT assignment at all) has
 * nothing to summarize and is simply absent from the result.
 */
export function buildFlightDaySummaryMap(
  days: RosterGenDay[],
  airportTimeZones: Record<string, string>
): Map<string, FlightDaySummary> {
  const map = new Map<string, FlightDaySummary>();
  const rowsByPairing = new Map<GeneratedPairing, PairingTimelineRow[]>();

  for (const day of days) {
    if (day.assignment.type !== 'FLIGHT') continue;
    const { pairing } = day.assignment;
    const category = classifyDayCategory(day);

    if (category === 'FLIGHT') {
      let rows = rowsByPairing.get(pairing);
      if (!rows) {
        rows = buildPairingTimelineRows(pairing, airportTimeZones);
        rowsByPairing.set(pairing, rows);
      }

      const dayRows = rows
        .filter((row) => row.serviceDate === day.date)
        .sort((a, b) => a.legIndex - b.legIndex);
      if (dayRows.length === 0) continue; // defensive — classifyDayCategory said FLIGHT

      const route = [dayRows[0].depIata, ...dayRows.map((row) => row.arrIata)].join('→');
      const blockMinutes = dayRows.reduce((sum, row) => sum + row.blockTimeMin, 0);
      const dutyMinutes = dayRows[0].dailyDutyMinutes;

      map.set(day.date, { category: 'FLIGHT', route, blockMinutes, dutyMinutes });
      continue;
    }

    // LAYOVER: the crew is resting at whichever outstation the most
    // recently completed leg of this pairing arrived at. No
    // `PairingTimelineRow` needed here — `pairing.legs` already carries
    // `instance.serviceDate`/`instance.arrIata` directly, and 'YYYY-MM-DD'
    // strings compare lexicographically the same as chronologically.
    const lastPriorLeg = pairing.legs
      .filter((leg) => leg.instance.serviceDate < day.date)
      .sort((a, b) => a.instance.serviceDate.localeCompare(b.instance.serviceDate))
      .pop();
    // Total layover duration is `layoverMinutesBeforeThisLeg` on the leg
    // that ENDS the rest period — the next leg chronologically, whose
    // ground-time-before-departure (`dutyTimes.ts#layoverMinutes`: raw
    // arrival-to-next-departure time) IS the whole gap this day falls
    // within. Every LAYOVER day of a multi-day rest period shares this same
    // value, mirroring how `dailyDutyMinutes` is shared across legs of one
    // calendar day above.
    const nextLeg = pairing.legs
      .filter((leg) => leg.instance.serviceDate > day.date)
      .sort((a, b) => a.instance.serviceDate.localeCompare(b.instance.serviceDate))[0];
    if (lastPriorLeg && nextLeg && nextLeg.layoverMinutesBeforeThisLeg !== null) {
      map.set(day.date, {
        category: 'LAYOVER',
        atIata: lastPriorLeg.instance.arrIata,
        layoverMinutes: nextLeg.layoverMinutesBeforeThisLeg,
      });
    }
  }

  return map;
}
