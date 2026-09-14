import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { manualCsvSource, parseManualCsvRow } from './manualCsv';

function validRow(overrides: Partial<Record<string, string>> = {}) {
  return {
    number: 'EK001',
    dep_iata: 'DXB',
    arr_iata: 'LHR',
    std_utc: '06:00',
    sta_utc: '10:35',
    advertised_type: 'A380',
    observed_type: '',
    confidence: '',
    days_of_week: '1111111',
    effective_from: '2026-02-01',
    effective_to: '2026-02-28',
    notes: '',
    ...overrides,
  };
}

describe('parseManualCsvRow', () => {
  it('parses a valid same-day row', () => {
    const { record, issues } = parseManualCsvRow(validRow(), 0);
    expect(record).not.toBeNull();
    expect(issues).toEqual([]);
    expect(record?.stdUTCMin).toBe(360);
    expect(record?.staUTCMin).toBe(635);
    expect(record?.arrivalDayOffset).toBe(0);
    expect(record?.confidence).toBe('ADVERTISED');
  });

  it('infers arrivalDayOffset = 1 for an overnight flight (sta < std)', () => {
    const row = validRow({
      number: 'EK201',
      dep_iata: 'DXB',
      arr_iata: 'JFK',
      std_utc: '21:40',
      sta_utc: '07:35',
    });
    const { record, issues } = parseManualCsvRow(row, 0);
    expect(issues).toEqual([]);
    expect(record?.arrivalDayOffset).toBe(1);
  });

  it('sets confidence CONFIRMED when observed_type is present with no explicit confidence', () => {
    const row = validRow({ observed_type: 'A350' });
    const { record } = parseManualCsvRow(row, 0);
    expect(record?.confidence).toBe('CONFIRMED');
    expect(record?.observedType).toBe('A350');
  });

  it('produces an error issue (not a throw) for an invalid IATA code, and skips the row', () => {
    const row = validRow({ dep_iata: 'DXBX' });
    expect(() => parseManualCsvRow(row, 0)).not.toThrow();
    const { record, issues } = parseManualCsvRow(row, 0);
    expect(record).toBeNull();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].level).toBe('error');
  });

  it('produces an error issue for a malformed HH:MM time', () => {
    const row = validRow({ std_utc: '25:99' });
    const { record, issues } = parseManualCsvRow(row, 0);
    expect(record).toBeNull();
    expect(issues[0].level).toBe('error');
  });

  it('produces an error issue for an invalid days_of_week string', () => {
    const row = validRow({ days_of_week: '111110' });
    const { record, issues } = parseManualCsvRow(row, 0);
    expect(record).toBeNull();
    expect(issues[0].level).toBe('error');
  });

  it('produces a warning (not an error) for an unrecognized aircraft type, and still accepts the row', () => {
    const row = validRow({ advertised_type: 'ZZ999' });
    const { record, issues } = parseManualCsvRow(row, 0);
    expect(record).not.toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('warning');
    expect(issues[0].message).toMatch(/Unrecognized aircraft type/);
  });
});

describe('manualCsvSource.fetch', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('parses valid rows, skips invalid rows as issues, and computes coverage', async () => {
    dir = mkdtempSync(join(tmpdir(), 'roster-lab-csv-'));
    const filePath = join(dir, 'sample.csv');
    const header =
      'number,dep_iata,arr_iata,std_utc,sta_utc,advertised_type,observed_type,confidence,days_of_week,effective_from,effective_to,notes';
    const rows = [
      'EK001,DXB,LHR,06:00,10:35,A380,,,1111111,2026-02-01,2026-02-28,',
      'EK002,DXB,ZZZZ,10:00,11:00,A350,,,1111111,2026-02-01,2026-02-28,bad iata', // invalid
    ];
    writeFileSync(filePath, [header, ...rows].join('\n'));

    const result = await manualCsvSource.fetch({ filePath });

    expect(result.source).toBe('MANUAL_CSV');
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0].number).toBe('EK001');
    expect(result.issues.some((i) => i.level === 'error')).toBe(true);
    expect(result.coverage.recordCount).toBe(1);
    expect(result.coverage.routesCovered).toEqual(['DXB-LHR']);
  });

  it('throws only for a missing file, not for row-level problems', async () => {
    await expect(
      manualCsvSource.fetch({ filePath: 'does-not-exist.csv' })
    ).rejects.toThrow();
  });
});
