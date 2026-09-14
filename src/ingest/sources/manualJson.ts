import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type {
  IngestIssue,
  IngestResult,
  RawFlightRecord,
  ScheduleSource,
  ScheduleSourceParams,
} from '../types';
import {
  checkAircraftTypeWarning,
  collectAirportsForFlights,
  computeCoverage,
  resolveConfidence,
} from './manualShared';

const IATA_REGEX = /^[A-Z]{3}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_OF_WEEK_REGEX = /^[01]{7}$/;

const rawFlightRecordSchema = z.object({
  number: z.string().trim().min(1),
  depIata: z.string().trim().regex(IATA_REGEX),
  arrIata: z.string().trim().regex(IATA_REGEX),
  stdUTCMin: z.number().int().min(0).max(1439),
  staUTCMin: z.number().int().min(0).max(1439),
  arrivalDayOffset: z.number().int().min(0),
  advertisedType: z.string().trim().min(1),
  observedType: z.string().trim().min(1).optional(),
  confidence: z.enum(['CONFIRMED', 'ADVERTISED', 'UNKNOWN']).optional(),
  daysOfWeek: z.string().regex(DAYS_OF_WEEK_REGEX),
  effectiveFrom: z.string().regex(ISO_DATE_REGEX),
  effectiveTo: z.string().regex(ISO_DATE_REGEX),
  sourceRef: z.string().trim().optional(),
});

/**
 * Validates and normalizes one raw (already camelCase, RawFlightRecord-
 * shaped) JSON record. Returns the normalized record plus any warning
 * issues, or a null record plus error issues if validation fails — a
 * validation failure is never thrown, only reported, so the caller can keep
 * processing the rest of the batch.
 */
export function parseManualJsonRecord(
  raw: unknown,
  index: number
):
  | { record: RawFlightRecord; issues: IngestIssue[] }
  | { record: null; issues: IngestIssue[] } {
  const numberForRef =
    typeof raw === 'object' && raw !== null && 'number' in raw
      ? String((raw as Record<string, unknown>).number)
      : '?';
  const recordRef = `json record ${index + 1} (${numberForRef})`;

  const parsed = rawFlightRecordSchema.safeParse(raw);
  if (!parsed.success) {
    const issues: IngestIssue[] = parsed.error.issues.map((issue) => ({
      level: 'error',
      message: `${recordRef}: ${issue.path.join('.')}: ${issue.message}`,
      recordRef,
    }));
    return { record: null, issues };
  }

  const data = parsed.data;
  const issues: IngestIssue[] = [];

  const typeWarning = checkAircraftTypeWarning(data.advertisedType, recordRef);
  if (typeWarning) issues.push(typeWarning);

  const record: RawFlightRecord = {
    number: data.number,
    depIata: data.depIata.toUpperCase(),
    arrIata: data.arrIata.toUpperCase(),
    stdUTCMin: data.stdUTCMin,
    staUTCMin: data.staUTCMin,
    arrivalDayOffset: data.arrivalDayOffset,
    advertisedType: data.advertisedType,
    observedType: data.observedType,
    confidence: resolveConfidence(data.observedType, data.confidence),
    daysOfWeek: data.daysOfWeek,
    effectiveFrom: data.effectiveFrom,
    effectiveTo: data.effectiveTo,
    sourceRef: data.sourceRef,
  };

  return { record, issues };
}

/**
 * Validates a batch of raw JSON records and assembles the full IngestResult.
 * Exported (not just used internally) so prisma/seed.ts can reuse the exact
 * same validation/normalization pipeline while tagging the result as
 * `source: 'SEED'` instead of `'MANUAL_JSON'`.
 */
export function buildResultFromRecords(
  records: unknown[],
  source: IngestResult['source'] = 'MANUAL_JSON'
): IngestResult {
  const issues: IngestIssue[] = [];
  const flights: RawFlightRecord[] = [];

  records.forEach((raw, index) => {
    const result = parseManualJsonRecord(raw, index);
    issues.push(...result.issues);
    if (result.record) {
      flights.push(result.record);
    }
  });

  const { airports, issues: airportIssues } = collectAirportsForFlights(flights);
  issues.push(...airportIssues);

  return {
    source,
    flights,
    airports,
    issues,
    coverage: computeCoverage(flights),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * ScheduleSource implementation for manual JSON import.
 *
 * NOTE on signature: beyond the standard ScheduleSourceParams (filePath),
 * `fetch` accepts an optional second `records` argument so callers that
 * already have RawFlightRecord[] in memory (e.g. prisma/seed.ts loading the
 * seed schedule) can skip the filesystem round-trip entirely and call
 * `manualJsonSource.fetch({}, records)` directly. This is additive — it
 * still satisfies the ScheduleSource interface, which only ever calls
 * `fetch(params)` with one argument.
 */
// Intentionally NOT typed as `: ScheduleSource` here — that would
// contextually narrow `fetch` to the interface's single-argument shape and
// make the direct-array call below a compile error. Conformance to
// ScheduleSource is verified separately by the assignment further down.
export const manualJsonSource = {
  id: 'manual-json' as const,
  label: 'Manual JSON import',

  async isAvailable(): Promise<boolean> {
    return true;
  },

  async fetch(
    params: ScheduleSourceParams,
    records?: RawFlightRecord[]
  ): Promise<IngestResult> {
    if (records) {
      return buildResultFromRecords(records);
    }

    if (!params.filePath) {
      throw new Error(
        'manual-json source requires either params.filePath or an in-memory records array'
      );
    }
    if (!existsSync(params.filePath)) {
      throw new Error(`manual-json source: file not found: ${params.filePath}`);
    }

    const jsonText = readFileSync(params.filePath, 'utf-8');
    const parsedJson = JSON.parse(jsonText);
    const inputRecords: unknown[] = Array.isArray(parsedJson)
      ? parsedJson
      : [];

    return buildResultFromRecords(inputRecords);
  },
};

// Compile-time conformance check: manualJsonSource must satisfy
// ScheduleSource (this line fails to type-check otherwise), without
// narrowing the exported constant's own inferred type.
const _manualJsonSourceConformsToScheduleSource: ScheduleSource = manualJsonSource;
void _manualJsonSourceConformsToScheduleSource;
