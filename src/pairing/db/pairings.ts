/**
 * Thin Prisma-aware wrapper around the pure `generatePairings` search:
 * ensures flight instances exist for the requested month, runs the search,
 * and — separately — persists ONE specific pairing a user selects (see
 * `docs/pairing-assumptions.md` / the Pairing model's doc comment in
 * prisma/schema.prisma for why only selected pairings are persisted, not
 * every candidate).
 */

import type { PrismaClient } from '@prisma/client';
import { generatePairings } from '../generatePairings';
import { ensureFlightInstancesForMonth } from './flightInstances';
import type { GeneratedPairing, PairingSearchConstraints } from '../types';

/**
 * Generates every feasible pairing for `year`/`month` under `constraints`.
 * Candidates are NOT persisted — this is a read-mostly operation (it does
 * persist/ensure the underlying `FlightInstance` rows, since those are
 * needed as stable FK targets regardless of which pairing gets picked).
 */
export async function generatePairingsForMonth(
  prisma: PrismaClient,
  year: number,
  month: number,
  constraints: Omit<PairingSearchConstraints, 'homeBase'> & { homeBase?: string }
): Promise<GeneratedPairing[]> {
  const instances = await ensureFlightInstancesForMonth(prisma, year, month);
  // Spread rather than copy field-by-field: an explicit field list silently
  // dropped the turnaround window when it was added to the constraints type.
  return generatePairings(instances, {
    ...constraints,
    homeBase: constraints.homeBase ?? 'DXB',
  });
}

/**
 * Persists a specific candidate `GeneratedPairing` (one produced by
 * `generatePairingsForMonth`, not yet carrying an `id`) as a `Pairing` +
 * `PairingLeg` rows, and returns its new `id`. Every leg's
 * `flightInstanceId` must already exist (guaranteed, since
 * `generatePairingsForMonth` only ever builds candidates out of already
 * `ensureFlightInstancesForMonth`-persisted instances).
 */
export async function persistPairing(
  prisma: PrismaClient,
  pairing: GeneratedPairing
): Promise<string> {
  const missingId = pairing.legs.find((leg) => !leg.instance.id);
  if (missingId) {
    throw new Error(
      'persistPairing: every leg must reference a persisted FlightInstance (missing .id) — ' +
        'call generatePairingsForMonth (not the pure generatePairings) so instances are persisted first.'
    );
  }

  const created = await prisma.pairing.create({
    data: {
      fleetType: pairing.fleetType,
      startDate: new Date(`${pairing.startServiceDate}T00:00:00.000Z`),
      endDate: new Date(`${pairing.endServiceDate}T00:00:00.000Z`),
      tripDays: pairing.tripDays,
      legs: {
        create: pairing.legs.map((leg, sequence) => ({
          sequence,
          flightInstanceId: leg.instance.id as string,
          layoverMinutesBefore: leg.layoverMinutesBeforeThisLeg,
        })),
      },
    },
  });

  return created.id;
}
