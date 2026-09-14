import { existsSync, readFileSync } from 'node:fs';
import Papa from 'papaparse';
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

/**
 * Documented CSV column format (see docs/schema-import.md):
 * number,dep_iata,arr_iata,std_utc,sta_utc,advertised_type,observed_type,confidence,days_of_week,effective_from,effective_to,notes
 */
export interface ManualCsvRow {
  number: string;
  dep_iata: string;
  arr_iata: string;
  std_utc: string;
  sta_utc: string;
  advertised_type: string;
  observed_type: string;
  confidence: string;
  days_of_week: string;
  effective_from: string;
  effective_to: string;
  notes: string;
}

const IATA_REGEX = /^[A-Z]{3}$/;
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_OF_WEEK_REGEX = /^[01]{7}$/;

const csvRowSchema = z.object({
  number: z.string().trim().min(1, 'number is required'),
  dep_iata: z.string().trim().regex(IATA_REGEX, 'dep_iata must be 3 uppercase letters'),
  arr_iata: z.string().trim().regex(IATA_REGEX, 'arr_iata must be 3 uppercase letters'),
  std_utc: z.string().trim().regex(HHMM_REGEX, 'std_utc must be HH:MM 24h'),
  sta_utc: z.string().trim().regex(HHMM_REGEX, 'sta_utc must be HH:MM 24h'),
  advertised_type: z.string().trim().min(1, 'advertised_type is required'),
  observed_type: z.string().trim().optional().or(z.literal('')),
  confidence: z.string().trim().optional().or(z.literal('')),
  days_of_week: z.string().trim().regex(DAYS_OF_WEEK_REGEX, 'days_of_week must be 7 chars of 0/1'),
  effective_from: z.string().trim().regex(ISO_DATE_REGEX, 'effective_from must be YYYY-MM-DD'),
  effective_to: z.string().trim().regex(ISO_DATE_REGEX, 'effective_to must be YYYY-MM-DD'),
  notes: z.string().trim().optional().or(z.literal('')),
});

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Parses one already-CSV-parsed row (an object keyed by the documented
 * column names) into a RawFlightRecord, or returns a list of validation
 * issues (the row is skipped, never thrown, so the caller can keep
 * processing the rest of the file).
 */
export function parseManualCsvRow(
  row: Record<string, string>,
  rowIndex: number
): { record: RawFlightRecord; issues: IngestIssue[] } | { record: null; issues: IngestIssue[] } {
  const recordRef = `csv row ${rowIndex + 1} (${row.number ?? '?'})`;
  const parsed = csvRowSchema.safeParse(row);

  if (!parsed.success) {
    const issues: IngestIssue[] = parsed.error.issues.map((issue) => ({
      level: 'error',
      message: `${recordRef}: ${issue.path.join('.')}: ${issue.message}`,
      recordRef,
    }));
    return { record: null, issues };
  }

  const data = parsed.data;
  const stdUTCMin = hhmmToMinutes(data.std_utc);
  const staUTCMin = hhmmToMinutes(data.sta_utc);
  // Single-leg flights don't span more than one day, so this simple
  // heuristic (STA clock-time earlier than STD clock-time => next day) is
  // safe for the schedules this app ingests.
  const arrivalDayOffset = staUTCMin < stdUTCMin ? 1 : 0;

  const observedType = data.observed_type ? data.observed_type : undefined;
  const explicitConfidence = data.confidence ? data.confidence : undefined;

  const issues: IngestIssue[] = [];
  const typeWarning = checkAircraftTypeWarning(
    data.advertised_type,
    recordRef
  );
  if (typeWarning) issues.push(typeWarning);

  const confidence = resolveConfidence(observedType, explicitConfidence);
  if (
    explicitConfidence &&
    explicitConfidence !== 'CONFIRMED' &&
    explicitConfidence !== 'ADVERTISED' &&
    explicitConfidence !== 'UNKNOWN'
  ) {
    issues.push({
      level: 'warning',
      message: `${recordRef}: unrecognized confidence value "${explicitConfidence}" — falling back to computed value "${confidence}".`,
      recordRef,
    });
  }

  const record: RawFlightRecord = {
    number: data.number,
    depIata: data.dep_iata.toUpperCase(),
    arrIata: data.arr_iata.toUpperCase(),
    stdUTCMin,
    staUTCMin,
    arrivalDayOffset,
    advertisedType: data.advertised_type,
    observedType,
    confidence,
    daysOfWeek: data.days_of_week,
    effectiveFrom: data.effective_from,
    effectiveTo: data.effective_to,
    sourceRef: data.notes || undefined,
  };

  return { record, issues };
}

export const manualCsvSource: ScheduleSource = {
  id: 'manual-csv',
  label: 'Manual CSV import',

  async isAvailable(): Promise<boolean> {
    // Manual sources are always "available" as a mechanism; whether a given
    // fetch() succeeds depends on whether a valid filePath was supplied.
    return true;
  },

  async fetch(params: ScheduleSourceParams): Promise<IngestResult> {
    if (!params.filePath) {
      throw new Error('manual-csv source requires params.filePath');
    }
    if (!existsSync(params.filePath)) {
      throw new Error(`manual-csv source: file not found: ${params.filePath}`);
    }

    const csvText = readFileSync(params.filePath, 'utf-8');
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    const issues: IngestIssue[] = [];
    const flights: RawFlightRecord[] = [];

    parsed.errors.forEach((err) => {
      issues.push({
        level: 'error',
        message: `CSV parse error at row ${err.row ?? '?'}: ${err.message}`,
      });
    });

    parsed.data.forEach((row, index) => {
      const result = parseManualCsvRow(row, index);
      issues.push(...result.issues);
      if (result.record) {
        flights.push(result.record);
      }
    });

    const { airports, issues: airportIssues } = collectAirportsForFlights(flights);
    issues.push(...airportIssues);

    return {
      source: 'MANUAL_CSV',
      flights,
      airports,
      issues,
      coverage: computeCoverage(flights),
      capturedAt: new Date().toISOString(),
    };
  },
};
