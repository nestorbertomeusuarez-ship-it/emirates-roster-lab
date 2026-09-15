/**
 * Thin Prisma-aware reconstruction of a persisted `Pairing` back into the
 * pure `GeneratedPairing` shape — the EXACT INVERSE of `persistPairing`
 * (src/pairing/db/pairings.ts). Needed because `persistPairing` only ever
 * runs one direction (a freshly-generated candidate -> DB rows); nothing
 * before Phase 5 Slice 1 needed to read a persisted pairing back OUT of the
 * DB into the shape the pure algorithm modules (`dutyTimes.ts`,
 * `toFlightDutyPeriod.ts`, `src/roster-gen/generateMonthlyRoster.ts#evaluateRosterDays`)
 * already know how to consume.
 *
 * Field-by-field mapping mirrors `src/pairing/db/flightInstances.ts`'s own
 * Prisma-row -> `DatedFlightInstance` mapping (same `aircraftType =
 * observedType ?? advertisedType` preference — see
 * docs/pairing-assumptions.md).
 */

import type { PrismaClient } from '@prisma/client';
import type { DatedFlightInstance, GeneratedPairing, PairingLegResult } from '../types';

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Loads a persisted `Pairing` (with its ordered `PairingLeg` rows, each
 * leg's `FlightInstance`, and that instance's `Flight`/airports) and maps it
 * back into a `GeneratedPairing`, ready to hand to any pure pairing/roster-gen
 * function exactly as if it had just come out of `generatePairings`.
 */
export async function loadPairingById(
  prisma: PrismaClient,
  pairingId: string
): Promise<GeneratedPairing> {
  const pairing = await prisma.pairing.findUnique({
    where: { id: pairingId },
    include: {
      legs: {
        orderBy: { sequence: 'asc' },
        include: {
          flightInstance: {
            include: {
              flight: { include: { depAirport: true, arrAirport: true } },
            },
          },
        },
      },
    },
  });

  if (!pairing) {
    throw new Error(`loadPairingById: no Pairing found with id "${pairingId}"`);
  }

  const legs: PairingLegResult[] = pairing.legs.map((leg) => {
    const flightInstance = leg.flightInstance;
    const flight = flightInstance.flight;

    const instance: DatedFlightInstance = {
      id: flightInstance.id,
      scheduleLineId: flightInstance.flightId,
      number: flight.number,
      depIata: flight.depAirport.iata,
      arrIata: flight.arrAirport.iata,
      serviceDate: toIsoDate(flightInstance.serviceDate),
      depUTC: flightInstance.depUTC,
      arrUTC: flightInstance.arrUTC,
      blockTimeMin: flight.blockTimeMin,
      // Prefer the confirmed/observed aircraft type over the advertised one
      // when both exist — same preference as flightInstances.ts (see
      // docs/pairing-assumptions.md).
      aircraftType: flight.observedType ?? flight.advertisedType,
    };

    return {
      instance,
      layoverMinutesBeforeThisLeg: leg.layoverMinutesBefore,
    };
  });

  return {
    id: pairing.id,
    fleetType: pairing.fleetType,
    legs,
    startServiceDate: toIsoDate(pairing.startDate),
    endServiceDate: toIsoDate(pairing.endDate),
    tripDays: pairing.tripDays,
  };
}
