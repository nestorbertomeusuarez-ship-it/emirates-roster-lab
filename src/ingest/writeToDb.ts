import type { PrismaClient } from '@prisma/client';
import { computeBlockTimeMin } from '../lib/blockTime';
import type { IngestIssue, IngestResult } from './types';

export interface PersistResult {
  airportsCreated: number;
  flightsCreated: number;
  flightsUpdated: number;
  issues: IngestIssue[];
}

/**
 * Persists an IngestResult to the database:
 * - Upserts each Airport by its unique `iata` code.
 * - Upserts each Flight by the `flight_natural_key` unique constraint
 *   (number + depAirportId + arrAirportId + stdUTCMin + daysOfWeek +
 *   effectiveFrom + effectiveTo + source).
 *
 * This is the ONLY code path allowed to compute/write `blockTimeMin` — it
 * is always recomputed from stdUTCMin/staUTCMin/arrivalDayOffset via
 * computeBlockTimeMin on every insert AND every update, so the stored value
 * never drifts from its inputs.
 */
export async function persistIngestResult(
  result: IngestResult,
  prisma: PrismaClient
): Promise<PersistResult> {
  const issues: IngestIssue[] = [...result.issues];
  let airportsCreated = 0;
  let flightsCreated = 0;
  let flightsUpdated = 0;

  const airportIdByIata = new Map<string, string>();

  for (const airport of result.airports) {
    const existing = await prisma.airport.findUnique({
      where: { iata: airport.iata },
    });

    const saved = await prisma.airport.upsert({
      where: { iata: airport.iata },
      create: {
        iata: airport.iata,
        icao: airport.icao,
        name: airport.name,
        lat: airport.lat,
        lon: airport.lon,
        tz: airport.tz,
      },
      update: {
        icao: airport.icao,
        name: airport.name,
        lat: airport.lat,
        lon: airport.lon,
        tz: airport.tz,
      },
    });

    airportIdByIata.set(airport.iata, saved.id);
    if (!existing) airportsCreated += 1;
  }

  for (const flight of result.flights) {
    const depAirportId = airportIdByIata.get(flight.depIata);
    const arrAirportId = airportIdByIata.get(flight.arrIata);

    if (!depAirportId || !arrAirportId) {
      issues.push({
        level: 'error',
        message: `Skipped flight ${flight.number} (${flight.depIata}-${flight.arrIata}): could not resolve airport id for departure/arrival.`,
        recordRef: flight.number,
      });
      continue;
    }

    let blockTimeMin: number;
    try {
      blockTimeMin = computeBlockTimeMin(
        flight.stdUTCMin,
        flight.staUTCMin,
        flight.arrivalDayOffset
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({
        level: 'error',
        message: `Skipped flight ${flight.number} (${flight.depIata}-${flight.arrIata}): ${message}`,
        recordRef: flight.number,
      });
      continue;
    }

    const effectiveFrom = new Date(flight.effectiveFrom);
    const effectiveTo = new Date(flight.effectiveTo);

    const existing = await prisma.flight.findUnique({
      where: {
        flight_natural_key: {
          number: flight.number,
          depAirportId,
          arrAirportId,
          stdUTCMin: flight.stdUTCMin,
          daysOfWeek: flight.daysOfWeek,
          effectiveFrom,
          effectiveTo,
          source: result.source,
        },
      },
    });

    await prisma.flight.upsert({
      where: {
        flight_natural_key: {
          number: flight.number,
          depAirportId,
          arrAirportId,
          stdUTCMin: flight.stdUTCMin,
          daysOfWeek: flight.daysOfWeek,
          effectiveFrom,
          effectiveTo,
          source: result.source,
        },
      },
      create: {
        number: flight.number,
        depAirportId,
        arrAirportId,
        stdUTCMin: flight.stdUTCMin,
        staUTCMin: flight.staUTCMin,
        arrivalDayOffset: flight.arrivalDayOffset,
        blockTimeMin,
        advertisedType: flight.advertisedType,
        observedType: flight.observedType,
        confidence: flight.confidence ?? 'ADVERTISED',
        daysOfWeek: flight.daysOfWeek,
        effectiveFrom,
        effectiveTo,
        source: result.source,
        sourceRef: flight.sourceRef,
        capturedAt: new Date(result.capturedAt),
      },
      update: {
        staUTCMin: flight.staUTCMin,
        arrivalDayOffset: flight.arrivalDayOffset,
        blockTimeMin,
        advertisedType: flight.advertisedType,
        observedType: flight.observedType,
        confidence: flight.confidence ?? 'ADVERTISED',
        sourceRef: flight.sourceRef,
        capturedAt: new Date(result.capturedAt),
      },
    });

    if (existing) {
      flightsUpdated += 1;
    } else {
      flightsCreated += 1;
    }
  }

  return { airportsCreated, flightsCreated, flightsUpdated, issues };
}
