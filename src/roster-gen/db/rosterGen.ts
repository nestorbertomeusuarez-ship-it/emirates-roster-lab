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
import { assignPairingDuty, assignSimpleDuty, findRosterMonth } from '../../pairing/db/roster';
import { getAirportTimeZones } from '../../lib/airportTimeZones';
import { EMIRATES_OPERATOR_CONFIG } from '../../ftl/operatorConfig';
import { generateMonthlyRoster } from '../generateMonthlyRoster';
import { loadRosterGenDaysForMonth } from './loadRosterGenDays';
import type { GenerationStrategy, MonthlyRosterGenerationResult, RosterGenDay } from '../types';
import { DEFAULT_PAIRING_CONSTRAINTS } from '../../pairing/constraints';

/**
 * Pairing-search constraints used to build the candidate pool for
 * auto-generation. Single source of truth is now
 * `src/pairing/constraints.ts#DEFAULT_PAIRING_CONSTRAINTS`
 * (docs/pairing-assumptions.md item 10) — this alias is kept only for
 * backward compatibility with any external caller that imported the old
 * name directly; not user-configurable yet, same scope note as before.
 */
export const ROSTER_GEN_PAIRING_CONSTRAINTS = DEFAULT_PAIRING_CONSTRAINTS;

function previousMonthOf(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/**
 * Best-effort lookup of the previous calendar month's ACTUAL roster, for
 * `generateMonthlyRoster`'s `priorMonthTailDays` (docs/roster-gen-assumptions.md
 * item 24). Returns `undefined` — never throws — when no `RosterMonth` row
 * exists yet for the prior month (the common case: the very first month
 * ever generated, or a gap month nobody assigned). This is NOT wrapped in a
 * blanket try/catch: a genuine error from `loadRosterGenDaysForMonth` is
 * left to propagate rather than silently swallowed, since this feature
 * exists specifically to catch real rest/consecutive-duty safety issues —
 * silently skipping it on an unexpected error would defeat its own point.
 */
async function loadPriorMonthTailDays(
  prisma: PrismaClient,
  year: number,
  month: number
): Promise<RosterGenDay[] | undefined> {
  const prev = previousMonthOf(year, month);
  const priorRosterMonth = await findRosterMonth(prisma, prev.year, prev.month);
  if (!priorRosterMonth) return undefined;
  return loadRosterGenDaysForMonth(prisma, priorRosterMonth.id, prev.year, prev.month);
}

/**
 * Builds (but does not persist) a full-month roster for one fleet type:
 * ensures/reads flight instances + candidate pairings for the month, reads
 * every known airport's timezone, and runs the pure generator.
 *
 * `targetBlockMinutesMin`/`targetBlockMinutesMax` are optional and threaded
 * straight through to `generateMonthlyRoster` — both are now enforced (a
 * hard ceiling and a best-effort floor respectively, see
 * docs/roster-gen-assumptions.md items 20/23). `generationStrategy` is
 * optional and defaults to `'MIX'` when unset (see `GenerationStrategy` in
 * `../types.ts`). All three `undefined` behaves exactly as before these
 * parameters existed.
 *
 * Also automatically loads and threads through `priorMonthTailDays` — the
 * previous calendar month's ACTUAL roster, if one exists (docs item 24) —
 * so every caller gets cross-month rest/consecutive-duty-day carry-over for
 * free, with no new parameter of its own.
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
  const priorMonthTailDays = await loadPriorMonthTailDays(prisma, year, month);

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
    priorMonthTailDays,
  });
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
