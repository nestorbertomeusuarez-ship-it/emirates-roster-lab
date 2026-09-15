/**
 * Phase 5 Slice 4 — pure leg-by-leg timeline data for one pairing's detail
 * view. Kept separate from `PairingTimeline.tsx`/`page.tsx` per this
 * project's established precedent (see `complianceGrouping.ts`'s and
 * `dayPresentation.ts`'s doc comments) — unit-test pure logic, not the
 * page/component.
 *
 * Reuses `src/pairing/dutyTimes.ts`'s tested time-math helpers
 * (`computeReportTime`, `computeDutyMinutes`, `formatLocalHHMM`) rather than
 * reimplementing any of them — the exact same functions
 * `generateMonthlyRoster.ts#evaluateRosterDays` and `toFlightDutyPeriod.ts`
 * already use for report time / duty time / local time-of-day formatting.
 */

import type { GeneratedPairing, PairingLegResult } from '@/pairing/types';
import { computeDutyMinutes, computeReportTime, formatLocalHHMM } from '@/pairing/dutyTimes';

export interface PairingTimelineRow {
  /** 0-based index of this leg within `pairing.legs`. */
  legIndex: number;
  /** 'YYYY-MM-DD' service date this leg operates on. */
  serviceDate: string;
  flightNumber: string;
  depIata: string;
  arrIata: string;
  /** Local ('HH:MM', station timezone) departure time — see `dutyTimes.ts#formatLocalHHMM`. */
  depLocalTime: string;
  /** Local ('HH:MM', station timezone) arrival time. */
  arrLocalTime: string;
  blockTimeMin: number;
  /** Ground time at `depIata` before this leg departs. Null for the pairing's first leg. */
  layoverBeforeMinutes: number | null;
  /**
   * Total duty time (report time to last on-blocks, via
   * `dutyTimes.ts#computeReportTime`/`computeDutyMinutes`) for the calendar
   * day this leg belongs to. Every leg flown the same day shares this same
   * value — see this module's doc comment and
   * docs/roster-gen-assumptions.md item 13 for why "cumulative duty" is
   * defined at day granularity, not leg granularity.
   */
  dailyDutyMinutes: number;
  /** Running sum of `dailyDutyMinutes` across every day of the pairing up to and including this leg's day. */
  cumulativeDutyMinutes: number;
}

/**
 * Builds one display row per pairing leg, in the pairing's own leg order,
 * with local dep/arr times, each leg's own block time, the layover
 * immediately before it, and duty-time context.
 *
 * JUDGMENT CALL (see docs/roster-gen-assumptions.md item 13): "cumulative
 * duty" is defined at CALENDAR-DAY granularity, not leg granularity,
 * because FDP/duty time is a property of a whole duty day (report time to
 * that day's last on-blocks), not of an individual sector — there is no
 * well-defined "duty time so far mid-day" a partial FDP could represent.
 * Legs are grouped by `instance.serviceDate`; each day's duty minutes are
 * computed once (report time from that day's first departure, last
 * on-blocks from that day's last arrival) and every leg that day is
 * annotated with that day's total plus the running cumulative sum across
 * days.
 */
export function buildPairingTimelineRows(
  pairing: GeneratedPairing,
  airportTimeZones: Record<string, string>
): PairingTimelineRow[] {
  const legsByDay = new Map<string, PairingLegResult[]>();
  for (const leg of pairing.legs) {
    const bucket = legsByDay.get(leg.instance.serviceDate) ?? [];
    bucket.push(leg);
    legsByDay.set(leg.instance.serviceDate, bucket);
  }

  const orderedDays = Array.from(legsByDay.keys()).sort();
  const dailyDutyMinutesByDay = new Map<string, number>();
  const cumulativeDutyMinutesByDay = new Map<string, number>();
  let runningCumulative = 0;

  for (const date of orderedDays) {
    const legsThatDay = [...legsByDay.get(date)!].sort(
      (a, b) => a.instance.depUTC.getTime() - b.instance.depUTC.getTime()
    );
    const reportUTC = computeReportTime(legsThatDay[0].instance.depUTC).reportUTC;
    const lastOnBlocksUTC = legsThatDay[legsThatDay.length - 1].instance.arrUTC;
    const dutyMinutes = computeDutyMinutes(reportUTC, lastOnBlocksUTC);

    dailyDutyMinutesByDay.set(date, dutyMinutes);
    runningCumulative += dutyMinutes;
    cumulativeDutyMinutesByDay.set(date, runningCumulative);
  }

  return pairing.legs.map((leg, legIndex) => {
    const depTz = airportTimeZones[leg.instance.depIata] ?? 'UTC';
    const arrTz = airportTimeZones[leg.instance.arrIata] ?? 'UTC';

    return {
      legIndex,
      serviceDate: leg.instance.serviceDate,
      flightNumber: leg.instance.number,
      depIata: leg.instance.depIata,
      arrIata: leg.instance.arrIata,
      depLocalTime: formatLocalHHMM(leg.instance.depUTC, depTz),
      arrLocalTime: formatLocalHHMM(leg.instance.arrUTC, arrTz),
      blockTimeMin: leg.instance.blockTimeMin,
      layoverBeforeMinutes: leg.layoverMinutesBeforeThisLeg,
      dailyDutyMinutes: dailyDutyMinutesByDay.get(leg.instance.serviceDate) ?? 0,
      cumulativeDutyMinutes: cumulativeDutyMinutesByDay.get(leg.instance.serviceDate) ?? 0,
    };
  });
}
