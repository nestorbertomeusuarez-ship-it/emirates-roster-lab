/**
 * Prisma-aware wrapper for the Phase 4 automatic monthly roster generator:
 * fetches the candidate pairing pool (reusing Phase 2's
 * `generatePairingsForMonth`, filtered to one fleet type) and an airport
 * IATA->timezone lookup, runs the pure `generateMonthlyRoster`, and
 * persists the result through Phase 2's existing `db/roster.ts` helpers
 * (`assignPairingDuty` / `assignSimpleDuty`) — no parallel persistence
 * model, see `prisma/schema.prisma`'s `RosterEntry` doc comment.
 */

import type { PrismaClient } from '@prisma/client';
import { generatePairingsForMonth } from '../../pairing/db/pairings';
import { assignPairingDuty, assignSimpleDuty } from '../../pairing/db/roster';
import { getAirportTimeZones } from '../../lib/airportTimeZones';
import { EMIRATES_OPERATOR_CONFIG } from '../../ftl/operatorConfig';
import { generateMonthlyRoster } from '../generateMonthlyRoster';
import type { GenerationStrategy, MonthlyRosterGenerationResult } from '../types';

/**
 * Pairing-search constraints used to build the candidate pool for
 * auto-generation. Mirrors the manual constructor's own
 * `UI_PAIRING_CONSTRAINTS` (src/app/roster/[year]/[month]/page.tsx) — not
 * user-configurable yet, same scope note as that module.
 */
export const ROSTER_GEN_PAIRING_CONSTRAINTS = {
  maxTripDays: 4,
  minLayoverMinutes: 8 * 60,
  maxLayoverMinutes: 48 * 60,
};

/**
 * Builds (but does not persist) a full-month roster for one fleet type:
 * ensures/reads flight instances + candidate pairings for the month, reads
 * every known airport's timezone, and runs the pure generator.
 *
 * `targetBlockMinutesMin`/`targetBlockMinutesMax` are optional and threaded
 * straight through to `generateMonthlyRoster` — `targetBlockMinutesMax` is
 * now a HARD ceiling, `targetBlockMinutesMin` is informational only (see
 * docs/roster-gen-assumptions.md item 20). `generationStrategy` is optional
 * and defaults to `'MIX'` when unset (see `GenerationStrategy` in
 * `../types.ts`). All three `undefined` behaves exactly as before these
 * parameters existed.
 */
export async function buildMonthlyRosterForFleet(
  prisma: PrismaClient,
  year: number,
  month: number,
  fleetType: string,
  targetBlockMinutesMin?: number,
  targetBlockMinutesMax?: number,
  generationStrategy?: GenerationStrategy
): Promise<MonthlyRosterGenerationResult> {
  const pairings = await generatePairingsForMonth(prisma, year, month, {
    ...ROSTER_GEN_PAIRING_CONSTRAINTS,
    fleetTypes: [fleetType],
  });

  const airportTimeZones = await getAirportTimeZones(prisma);

  return generateMonthlyRoster({
    fleetType,
    year,
    month,
    pairings,
    airportTimeZones,
    // This app has exactly one user — see src/ftl/operatorConfig.ts for why
    // a hardcoded constant (not a settings UI) is the correct wiring here.
    operatorConfig: EMIRATES_OPERATOR_CONFIG,
    targetBlockMinutesMin,
    targetBlockMinutesMax,
    generationStrategy,
  });
}

/** Returns how many RosterEntry rows already exist for a month (used by the UI's confirm-before-overwrite step). */
export async function countExistingRosterEntries(
  prisma: PrismaClient,
  rosterMonthId: string
): Promise<number> {
  return prisma.rosterEntry.count({ where: { rosterMonthId } });
}

/**
 * Persists a generated result as RosterEntry rows for the month, REPLACING
 * whatever was there before (manual or a previous generation). The caller
 * is responsible for any confirm-before-overwrite UX — see the roster
 * page's server action, which only calls this after the user has confirmed
 * when existing entries were found.
 */
export async function persistGeneratedRoster(
  prisma: PrismaClient,
  rosterMonthId: string,
  result: MonthlyRosterGenerationResult
): Promise<void> {
  await prisma.rosterEntry.deleteMany({ where: { rosterMonthId } });

  for (const day of result.days) {
    const date = new Date(`${day.date}T00:00:00.000Z`);
    if (day.assignment.type === 'OFF') {
      await assignSimpleDuty(prisma, rosterMonthId, date, 'OFF');
    } else if (day.assignment.dayOfPairing === 1) {
      // Only the pairing's start day gets a RosterEntry row (see
      // prisma/schema.prisma's RosterEntry doc comment) — continuation
      // days are derived by buildRosterGrid, not persisted.
      await assignPairingDuty(prisma, rosterMonthId, date, day.assignment.pairing);
    }
  }
}
