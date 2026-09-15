/**
 * Shared IATA -> IANA timezone lookup, built from every known `Airport` row.
 * Extracted from `src/roster-gen/db/rosterGen.ts#buildMonthlyRosterForFleet`
 * (Phase 4), which duplicated this exact query — Phase 5 Slice 1's
 * `loadRosterGenDays.ts` needs the same lookup to re-run the real evaluator
 * against a reconstructed roster, so this is now a shared helper instead of
 * a second copy of the same query.
 */

import type { PrismaClient } from '@prisma/client';

export async function getAirportTimeZones(prisma: PrismaClient): Promise<Record<string, string>> {
  const airports = await prisma.airport.findMany({ select: { iata: true, tz: true } });
  return Object.fromEntries(airports.map((airport) => [airport.iata, airport.tz]));
}
