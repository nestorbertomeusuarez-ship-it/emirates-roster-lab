/**
 * Thin Prisma-aware wrapper around the pure `expandScheduleToInstances`
 * algorithm: reads Phase 1's `Flight` rows, maps them to the pairing
 * engine's `ScheduleLine` shape, expands them for a requested month, and
 * idempotently persists the results as `FlightInstance` rows (creating only
 * what's missing — never re-generating or duplicating existing rows).
 *
 * This is the ONLY place in Phase 2 that touches `@prisma/client` for the
 * flight-instance side of the pairing engine. `expandScheduleToInstances.ts`
 * itself has zero Prisma dependency.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { expandScheduleToInstances } from '../expandScheduleToInstances';
import type { DatedFlightInstance, ScheduleLine } from '../types';

type FlightWithAirports = Prisma.FlightGetPayload<{
  include: { depAirport: true; arrAirport: true };
}>;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toScheduleLine(flight: FlightWithAirports): ScheduleLine {
  return {
    id: flight.id,
    number: flight.number,
    depIata: flight.depAirport.iata,
    arrIata: flight.arrAirport.iata,
    stdUTCMin: flight.stdUTCMin,
    staUTCMin: flight.staUTCMin,
    arrivalDayOffset: flight.arrivalDayOffset,
    blockTimeMin: flight.blockTimeMin,
    // Prefer the confirmed/observed aircraft type over the advertised one
    // when both exist (see docs/pairing-assumptions.md).
    aircraftType: flight.observedType ?? flight.advertisedType,
    daysOfWeek: flight.daysOfWeek,
    effectiveFrom: toIsoDate(flight.effectiveFrom),
    effectiveTo: toIsoDate(flight.effectiveTo),
  };
}

/**
 * Ensures every `FlightInstance` row for `year`/`month` exists (creating
 * any missing ones), then returns the full set of dated instances for that
 * month as plain `DatedFlightInstance[]`, ready to hand to
 * `generatePairings`.
 *
 * Idempotent: re-running for the same month does not duplicate rows. Note:
 * `createMany({ skipDuplicates: true })` is NOT used here — Prisma's SQLite
 * connector does not support the `skipDuplicates` option (only
 * Postgres/MySQL/CockroachDB do). Instead, existing `[flightId,
 * serviceDate]` pairs for the month are read first and filtered out of the
 * insert set in application code, which is portable to SQLite.
 */
export async function ensureFlightInstancesForMonth(
  prisma: PrismaClient,
  year: number,
  month: number
): Promise<DatedFlightInstance[]> {
  const flights = await prisma.flight.findMany({
    include: { depAirport: true, arrAirport: true },
  });

  const scheduleLines = flights.map(toScheduleLine);
  const expanded = expandScheduleToInstances(scheduleLines, year, month);

  const existing = await prisma.flightInstance.findMany({
    where: {
      serviceDate: {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lte: new Date(Date.UTC(year, month, 0)),
      },
    },
    select: { flightId: true, serviceDate: true },
  });
  const existingKeys = new Set(
    existing.map((row) => `${row.flightId}|${toIsoDate(row.serviceDate)}`)
  );

  const toInsert = expanded.filter(
    (instance) => !existingKeys.has(`${instance.scheduleLineId}|${instance.serviceDate}`)
  );

  if (toInsert.length > 0) {
    await prisma.flightInstance.createMany({
      data: toInsert.map((instance) => ({
        flightId: instance.scheduleLineId,
        serviceDate: new Date(`${instance.serviceDate}T00:00:00.000Z`),
        depUTC: instance.depUTC,
        arrUTC: instance.arrUTC,
      })),
    });
  }

  const rows = await prisma.flightInstance.findMany({
    where: {
      serviceDate: {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lte: new Date(Date.UTC(year, month, 0)),
      },
    },
    include: {
      flight: { include: { depAirport: true, arrAirport: true } },
    },
    orderBy: { depUTC: 'asc' },
  });

  return rows.map((row) => ({
    id: row.id,
    scheduleLineId: row.flightId,
    number: row.flight.number,
    depIata: row.flight.depAirport.iata,
    arrIata: row.flight.arrAirport.iata,
    serviceDate: toIsoDate(row.serviceDate),
    depUTC: row.depUTC,
    arrUTC: row.arrUTC,
    blockTimeMin: row.flight.blockTimeMin,
    aircraftType: row.flight.observedType ?? row.flight.advertisedType,
  }));
}

/**
 * Counts persisted `FlightInstance` rows for `year`/`month`, used by the
 * Phase 5 UI (see `emptyScheduleData.ts`) to distinguish "no schedule data
 * was ever seeded for this month" from "schedule data exists, nothing
 * assigned yet". Callers should run this AFTER `ensureFlightInstancesForMonth`
 * (or `generatePairingsForMonth`, which calls it) so a month that genuinely
 * has covering `Flight` schedule lines has already had its instances
 * materialized — otherwise this would undercount on a month's very first
 * request.
 */
export async function countFlightInstancesForMonth(
  prisma: PrismaClient,
  year: number,
  month: number
): Promise<number> {
  return prisma.flightInstance.count({
    where: {
      serviceDate: {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lte: new Date(Date.UTC(year, month, 0)),
      },
    },
  });
}
