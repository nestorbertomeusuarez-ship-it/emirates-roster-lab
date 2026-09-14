import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  IngestIssue,
  IngestResult,
  RawFlightRecord,
  ScheduleSource,
  ScheduleSourceParams,
} from '../types';
import { collectAirportsForFlights, computeCoverage } from './manualShared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AERODATABOX_BASE_URL = 'https://aerodatabox.p.rapidapi.com';
const AERODATABOX_HOST = 'aerodatabox.p.rapidapi.com';

const CACHE_DIR = join(__dirname, '..', 'cache', 'aerodatabox');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const USAGE_FILE_PATH = join(process.cwd(), '.aerodatabox-usage.json');

interface CacheEntry {
  cachedAt: string;
  response: unknown;
}

function cacheKeyFor(params: ScheduleSourceParams): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(params));
  return hash.digest('hex');
}

function readCache(key: string): unknown | null {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;

  try {
    const entry = JSON.parse(readFileSync(path, 'utf-8')) as CacheEntry;
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return entry.response;
  } catch {
    return null;
  }
}

function writeCache(key: string, response: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { cachedAt: new Date().toISOString(), response };
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(entry, null, 2));
}

function incrementUsageCounter(): void {
  let usage = { totalRequests: 0, lastRequestAt: null as string | null };
  if (existsSync(USAGE_FILE_PATH)) {
    try {
      usage = JSON.parse(readFileSync(USAGE_FILE_PATH, 'utf-8'));
    } catch {
      // corrupt/missing usage file — start a fresh counter
    }
  }
  usage.totalRequests = (usage.totalRequests ?? 0) + 1;
  usage.lastRequestAt = new Date().toISOString();
  writeFileSync(USAGE_FILE_PATH, JSON.stringify(usage, null, 2));
}

// TODO: verify exact AeroDataBox endpoint path/response shape against
// current API docs before live use. This targets the RapidAPI-hosted
// "Flight Schedules" / route-based schedule endpoint family (base URL
// https://aerodatabox.p.rapidapi.com), which historically exposes routes
// such as `/flights/airports/iata/{iata}/{fromLocal}/{toLocal}` and
// `/schedules/airports/iata/{iata}/{fromLocal}/{toLocal}`. The exact path
// and the exact shape of the returned schedule items were not re-confirmed
// against live API docs as part of this build (no network access to verify
// during this task, and behavior can change between RapidAPI plan tiers).
// This function's request-building and response-mapping structure is a
// best-effort placeholder: verify and adjust the path/query/response
// parsing before depending on this adapter for real data.
async function fetchScheduleFromAeroDataBox(
  params: ScheduleSourceParams,
  apiKey: string
): Promise<unknown> {
  const route = params.routes?.[0];
  if (!route) {
    throw new Error(
      'aerodatabox source: params.routes must include at least one { dep, arr } route'
    );
  }

  const fromLocal = params.fromDate ?? new Date().toISOString().slice(0, 10);
  const toLocal = params.toDate ?? fromLocal;

  // TODO: verify exact path/query shape — see comment above.
  const url = `${AERODATABOX_BASE_URL}/flights/airports/iata/${route.dep}/${fromLocal}T00:00/${toLocal}T23:59`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': AERODATABOX_HOST,
    },
  });

  if (!response.ok) {
    throw new Error(
      `aerodatabox source: request failed with status ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Maps a raw AeroDataBox API response into RawFlightRecord[].
 *
 * NON-NEGOTIABLE INVARIANT: AeroDataBox only ever tells us the *advertised*
 * (scheduled) aircraft type, never what actually operated on a given day.
 * There is therefore NO code path in this mapper that sets `observedType`
 * to anything other than `undefined`, and NO code path that sets
 * `confidence` to anything other than `'ADVERTISED'`. The only way a Flight
 * ever becomes CONFIRMED is manual human curation (see
 * docs/data-sources.md).
 */
function mapAeroDataBoxResponseToRawFlights(
  response: unknown,
  route: { dep: string; arr: string }
): RawFlightRecord[] {
  // TODO: verify exact response shape — see comment above
  // fetchScheduleFromAeroDataBox. This defensively walks a plausible
  // `{ departures: [...] }` shape and skips anything it cannot map, rather
  // than throwing, since the exact schema is unverified.
  const departures =
    typeof response === 'object' &&
    response !== null &&
    'departures' in response &&
    Array.isArray((response as { departures: unknown }).departures)
      ? (response as { departures: unknown[] }).departures
      : [];

  const flights: RawFlightRecord[] = [];

  for (const item of departures) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;

    const number =
      typeof rec.number === 'string'
        ? rec.number
        : typeof rec.flight === 'object' && rec.flight !== null
          ? String((rec.flight as Record<string, unknown>).number ?? '')
          : undefined;
    const advertisedType =
      typeof rec.aircraft === 'object' &&
      rec.aircraft !== null &&
      'model' in (rec.aircraft as Record<string, unknown>)
        ? String((rec.aircraft as Record<string, unknown>).model)
        : undefined;

    if (!number || !advertisedType) continue;

    flights.push({
      number,
      depIata: route.dep,
      arrIata: route.arr,
      // Field mapping for exact scheduled/actual time fields is part of
      // the unverified response shape (see TODO above) — left as 0 here
      // rather than guessing at a field name that may not exist.
      stdUTCMin: 0,
      staUTCMin: 0,
      arrivalDayOffset: 0,
      advertisedType,
      // Forced — see NON-NEGOTIABLE INVARIANT above.
      observedType: undefined,
      confidence: 'ADVERTISED',
      daysOfWeek: '1111111',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: new Date().toISOString().slice(0, 10),
      sourceRef: 'aerodatabox',
    });
  }

  return flights;
}

export const aerodataboxSource: ScheduleSource = {
  id: 'aerodatabox',
  label: 'AeroDataBox (RapidAPI)',

  async isAvailable(): Promise<boolean> {
    return !!process.env.AERODATABOX_API_KEY;
  },

  async fetch(params: ScheduleSourceParams): Promise<IngestResult> {
    const apiKey = process.env.AERODATABOX_API_KEY;
    const issues: IngestIssue[] = [];

    if (!apiKey) {
      issues.push({
        level: 'warning',
        message: 'AERODATABOX_API_KEY not set, skipping this source',
      });
      return {
        source: 'AERODATABOX',
        flights: [],
        airports: [],
        issues,
        coverage: computeCoverage([]),
        capturedAt: new Date().toISOString(),
      };
    }

    const route = params.routes?.[0];
    if (!route) {
      issues.push({
        level: 'warning',
        message: 'aerodatabox source: no routes provided, nothing to fetch',
      });
      return {
        source: 'AERODATABOX',
        flights: [],
        airports: [],
        issues,
        coverage: computeCoverage([]),
        capturedAt: new Date().toISOString(),
      };
    }

    const cacheKey = cacheKeyFor(params);
    let response = readCache(cacheKey);

    if (!response) {
      response = await fetchScheduleFromAeroDataBox(params, apiKey);
      incrementUsageCounter();
      writeCache(cacheKey, response);
    }

    const flights = mapAeroDataBoxResponseToRawFlights(response, route);
    const { airports, issues: airportIssues } = collectAirportsForFlights(flights);
    issues.push(...airportIssues);

    return {
      source: 'AERODATABOX',
      flights,
      airports,
      issues,
      coverage: computeCoverage(flights),
      capturedAt: new Date().toISOString(),
    };
  },
};
