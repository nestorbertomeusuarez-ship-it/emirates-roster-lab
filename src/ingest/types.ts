/**
 * Shared types for the ingest pipeline: raw records as parsed from a source,
 * reference data, issue/coverage reporting, and the ScheduleSource contract
 * that every ingest adapter (manual CSV, manual JSON, AeroDataBox) implements.
 */

export interface RawFlightRecord {
  number: string;
  depIata: string;
  arrIata: string;
  stdUTCMin: number;
  staUTCMin: number;
  arrivalDayOffset: number;
  advertisedType: string;
  observedType?: string;
  confidence?: 'CONFIRMED' | 'ADVERTISED' | 'UNKNOWN';
  daysOfWeek: string;
  effectiveFrom: string;
  effectiveTo: string;
  sourceRef?: string;
}

export interface AirportRecord {
  iata: string;
  icao?: string;
  name?: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface IngestIssue {
  level: 'error' | 'warning';
  message: string;
  recordRef?: string;
}

export interface IngestCoverage {
  recordCount: number;
  routesCovered: string[];
  dateRangeFrom?: string;
  dateRangeTo?: string;
  confirmedTypeCount: number;
  advertisedOnlyCount: number;
}

export interface IngestResult {
  source: 'MANUAL_CSV' | 'MANUAL_JSON' | 'AERODATABOX' | 'SEED';
  flights: RawFlightRecord[];
  airports: AirportRecord[];
  issues: IngestIssue[];
  coverage: IngestCoverage;
  capturedAt: string;
}

export interface ScheduleSourceParams {
  filePath?: string;
  fromDate?: string;
  toDate?: string;
  routes?: Array<{ dep: string; arr: string }>;
}

export interface ScheduleSource {
  readonly id: 'manual-csv' | 'manual-json' | 'aerodatabox';
  readonly label: string;
  isAvailable(): Promise<boolean>;
  fetch(params: ScheduleSourceParams): Promise<IngestResult>;
}
