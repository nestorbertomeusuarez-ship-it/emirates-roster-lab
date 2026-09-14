/**
 * Expands recurring `ScheduleLine`s (Phase 1's Flight schedule lines, in
 * their minimal pairing-engine shape) into the dated `DatedFlightInstance`s
 * that actually operate within a given calendar month.
 *
 * Pure function: no Prisma, no I/O. `src/pairing/db/flightInstances.ts` is
 * the thin wrapper that reads real `Flight` rows, maps them to
 * `ScheduleLine[]`, calls this, and persists the results as `FlightInstance`
 * rows.
 *
 * ASSUMPTION (see docs/pairing-assumptions.md): `daysOfWeek` is evaluated
 * against the UTC calendar date, not a station-local date. Phase 1's
 * `Flight.stdUTCMin`/`staUTCMin` are minutes-since-UTC-midnight with no
 * associated local date field, so there is no station-local calendar day to
 * evaluate `daysOfWeek` against without additional timezone data this
 * schema doesn't carry per-flight. This is a judgment call, not sourced
 * operator behavior.
 */

import { daysOfWeekToBooleans } from '../lib/daysOfWeek';
import type { DatedFlightInstance, ScheduleLine } from './types';

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday=0..Sunday=6 index for a UTC Date, matching src/lib/daysOfWeek.ts's convention. */
function utcWeekdayIndex(d: Date): number {
  // Date#getUTCDay(): Sunday=0..Saturday=6. Convert to Monday=0..Sunday=6.
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Produces every dated instance of `lines` that operates within
 * `year`/`month` (1-12, local calendar convention — `month: 2` means
 * February), respecting each line's `daysOfWeek` pattern and
 * `effectiveFrom`/`effectiveTo` range.
 *
 * Returns instances sorted by `depUTC` ascending.
 */
export function expandScheduleToInstances(
  lines: ScheduleLine[],
  year: number,
  month: number
): DatedFlightInstance[] {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(
      `expandScheduleToInstances: month must be an integer 1-12 (got ${month})`
    );
  }

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0)); // last day of the month

  const instances: DatedFlightInstance[] = [];

  for (const line of lines) {
    const operatingDays = daysOfWeekToBooleans(line.daysOfWeek);
    const effectiveFrom = new Date(`${line.effectiveFrom}T00:00:00.000Z`);
    const effectiveTo = new Date(`${line.effectiveTo}T00:00:00.000Z`);

    const rangeStart =
      effectiveFrom.getTime() > monthStart.getTime() ? effectiveFrom : monthStart;
    const rangeEnd = effectiveTo.getTime() < monthEnd.getTime() ? effectiveTo : monthEnd;

    if (rangeStart.getTime() > rangeEnd.getTime()) {
      // No overlap between this line's effective range and the requested month.
      continue;
    }

    for (
      let day = new Date(rangeStart);
      day.getTime() <= rangeEnd.getTime();
      day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    ) {
      if (!operatingDays[utcWeekdayIndex(day)]) {
        continue;
      }

      const depUTC = new Date(day.getTime() + line.stdUTCMin * 60 * 1000);
      const arrUTC = new Date(
        day.getTime() +
          (line.staUTCMin + line.arrivalDayOffset * 1440) * 60 * 1000
      );

      instances.push({
        scheduleLineId: line.id,
        number: line.number,
        depIata: line.depIata,
        arrIata: line.arrIata,
        serviceDate: toIsoDate(day),
        depUTC,
        arrUTC,
        blockTimeMin: line.blockTimeMin,
        aircraftType: line.aircraftType,
      });
    }
  }

  instances.sort((a, b) => a.depUTC.getTime() - b.depUTC.getTime());
  return instances;
}
