import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RawFlightRecord } from '../types';
import { manualJsonSource, parseManualJsonRecord } from './manualJson';

function validRecord(
  overrides: Partial<RawFlightRecord> = {}
): RawFlightRecord {
  return {
    number: 'EK001',
    depIata: 'DXB',
    arrIata: 'LHR',
    stdUTCMin: 360,
    staUTCMin: 635,
    arrivalDayOffset: 0,
    advertisedType: 'A380',
    daysOfWeek: '1111111',
    effectiveFrom: '2026-02-01',
    effectiveTo: '2026-02-28',
    ...overrides,
  };
}

describe('parseManualJsonRecord', () => {
  it('parses a valid record', () => {
    const { record, issues } = parseManualJsonRecord(validRecord(), 0);
    expect(record).not.toBeNull();
    expect(issues).toEqual([]);
    expect(record?.confidence).toBe('ADVERTISED');
  });

  it('sets confidence CONFIRMED when observedType is present with no explicit confidence', () => {
    const { record } = parseManualJsonRecord(
      validRecord({ observedType: 'B77W' }),
      0
    );
    expect(record?.confidence).toBe('CONFIRMED');
  });

  it('respects an explicit confidence value even with an observedType present', () => {
    const { record } = parseManualJsonRecord(
      validRecord({ observedType: 'A350', confidence: 'UNKNOWN' }),
      0
    );
    expect(record?.confidence).toBe('UNKNOWN');
  });

  it('produces an error issue (not a throw) for an invalid record, and skips it', () => {
    const bad = validRecord({ depIata: 'DUBAI' });
    expect(() => parseManualJsonRecord(bad, 0)).not.toThrow();
    const { record, issues } = parseManualJsonRecord(bad, 0);
    expect(record).toBeNull();
    expect(issues[0].level).toBe('error');
  });

  it('produces an error issue for an out-of-range stdUTCMin', () => {
    const bad = validRecord({ stdUTCMin: 5000 });
    const { record, issues } = parseManualJsonRecord(bad, 0);
    expect(record).toBeNull();
    expect(issues[0].level).toBe('error');
  });

  it('produces a warning (not an error) for an unrecognized aircraft type, and still accepts the record', () => {
    const rec = validRecord({ advertisedType: 'ZZ999' });
    const { record, issues } = parseManualJsonRecord(rec, 0);
    expect(record).not.toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('warning');
  });

  it('does not throw on garbage input (non-object)', () => {
    expect(() => parseManualJsonRecord('not-an-object', 0)).not.toThrow();
    const { record, issues } = parseManualJsonRecord('not-an-object', 0);
    expect(record).toBeNull();
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('manualJsonSource.fetch', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('accepts an in-memory records array without touching the filesystem', async () => {
    const result = await manualJsonSource.fetch({}, [validRecord()]);
    expect(result.source).toBe('MANUAL_JSON');
    expect(result.flights).toHaveLength(1);
    expect(result.coverage.recordCount).toBe(1);
  });

  it('reads and validates a JSON file, skipping invalid entries as issues', async () => {
    dir = mkdtempSync(join(tmpdir(), 'roster-lab-json-'));
    const filePath = join(dir, 'sample.json');
    const data = [validRecord(), validRecord({ depIata: 'BADX' })];
    writeFileSync(filePath, JSON.stringify(data));

    const result = await manualJsonSource.fetch({ filePath });
    expect(result.flights).toHaveLength(1);
    expect(result.issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('throws only for a missing file, not for row-level problems', async () => {
    await expect(
      manualJsonSource.fetch({ filePath: 'does-not-exist.json' })
    ).rejects.toThrow();
  });
});
