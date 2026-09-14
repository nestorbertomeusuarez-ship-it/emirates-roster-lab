import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type {
  AirportRecord,
  IngestCoverage,
  IngestIssue,
  RawFlightRecord,
} from '../types';
import { isKnownAircraftType } from '../data/aircraftTypes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AIRPORTS_REFERENCE_PATH = join(
  __dirname,
  '..',
  'data',
  'airports-reference.json'
);

let cachedReferenceAirports: AirportRecord[] | null = null;

/**
 * Loads the curated airports reference JSON (cached after first read).
 */
export function loadAirportsReference(): AirportRecord[] {
  if (cachedReferenceAirports) {
    return cachedReferenceAirports;
  }
  const raw = readFileSync(AIRPORTS_REFERENCE_PATH, 'utf-8');
  cachedReferenceAirports = JSON.parse(raw) as AirportRecord[];
  return cachedReferenceAirports;
}

/**
 * Resolves a single IATA code against the curated reference data. If the
 * code is not found, returns a stub AirportRecord with placeholder
 * coordinates/timezone (lat/lon 0, tz "UTC") and a warning issue describing
 * the gap — the caller decides whether to surface it.
 */
export function resolveAirport(
  iata: string,
  referenceAirports: AirportRecord[]
): { airport: AirportRecord; issue?: IngestIssue } {
  const found = referenceAirports.find(
    (a) => a.iata.toUpperCase() === iata.toUpperCase()
  );
  if (found) {
    return { airport: found };
  }

  return {
    airport: {
      iata: iata.toUpperCase(),
      lat: 0,
      lon: 0,
      tz: 'UTC',
    },
    issue: {
      level: 'warning',
      message: `Unknown airport IATA code "${iata}" — not found in airports-reference.json; created a stub record with placeholder coordinates (0, 0) and tz "UTC". Add it to the reference data for accurate geography/timezone handling.`,
      recordRef: iata,
    },
  };
}

/**
 * Collects the unique set of airports referenced by a batch of raw flight
 * records (both departure and arrival sides), resolving each against the
 * curated reference data and generating a stub + warning for any unknown
 * code. Returns deduplicated airports plus any warning issues raised.
 */
export function collectAirportsForFlights(flights: RawFlightRecord[]): {
  airports: AirportRecord[];
  issues: IngestIssue[];
} {
  const referenceAirports = loadAirportsReference();
  const byIata = new Map<string, AirportRecord>();
  const issues: IngestIssue[] = [];
  const warnedIatas = new Set<string>();

  for (const flight of flights) {
    for (const iata of [flight.depIata, flight.arrIata]) {
      const key = iata.toUpperCase();
      if (byIata.has(key)) continue;

      const { airport, issue } = resolveAirport(iata, referenceAirports);
      byIata.set(key, airport);

      if (issue && !warnedIatas.has(key)) {
        issues.push(issue);
        warnedIatas.add(key);
      }
    }
  }

  return { airports: [...byIata.values()], issues };
}

/**
 * Resolves the effective type confidence for a raw record:
 * - no observedType provided -> 'ADVERTISED' (we only know the schedule)
 * - observedType provided and no explicit confidence -> 'CONFIRMED'
 *   (a human/source is asserting what actually operated)
 * - explicit confidence always wins when given
 */
export function resolveConfidence(
  observedType?: string,
  explicitConfidence?: string
): 'CONFIRMED' | 'ADVERTISED' | 'UNKNOWN' {
  if (explicitConfidence === 'CONFIRMED' || explicitConfidence === 'ADVERTISED' || explicitConfidence === 'UNKNOWN') {
    return explicitConfidence;
  }
  if (observedType) {
    return 'CONFIRMED';
  }
  return 'ADVERTISED';
}

/**
 * Produces a soft warning issue when an aircraft type code is not in the
 * known-types list. Returns null when the type is recognized (or blank).
 */
export function checkAircraftTypeWarning(
  type: string | undefined,
  recordRef: string
): IngestIssue | null {
  if (!type) return null;
  if (isKnownAircraftType(type)) return null;
  return {
    level: 'warning',
    message: `Unrecognized aircraft type "${type}" — not in KNOWN_AIRCRAFT_TYPES. Row was still accepted.`,
    recordRef,
  };
}

/**
 * Computes summary coverage stats from a batch of successfully parsed raw
 * flight records.
 */
export function computeCoverage(flights: RawFlightRecord[]): IngestCoverage {
  const routesCovered = [
    ...new Set(flights.map((f) => `${f.depIata}-${f.arrIata}`)),
  ].sort();

  const effectiveFroms = flights.map((f) => f.effectiveFrom).sort();
  const effectiveTos = flights.map((f) => f.effectiveTo).sort();

  let confirmedTypeCount = 0;
  let advertisedOnlyCount = 0;
  for (const f of flights) {
    const confidence = resolveConfidence(f.observedType, f.confidence);
    if (confidence === 'CONFIRMED') confirmedTypeCount += 1;
    if (confidence === 'ADVERTISED') advertisedOnlyCount += 1;
  }

  return {
    recordCount: flights.length,
    routesCovered,
    dateRangeFrom: effectiveFroms[0],
    dateRangeTo: effectiveTos[effectiveTos.length - 1],
    confirmedTypeCount,
    advertisedOnlyCount,
  };
}
