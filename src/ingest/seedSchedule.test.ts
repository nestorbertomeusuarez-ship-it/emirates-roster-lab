import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TURNAROUND_ONLY_STATIONS } from '../pairing/constraints';

interface SeedFlight {
  number: string;
  depIata: string;
  arrIata: string;
  advertisedType: string;
  stdUTCMin: number;
  staUTCMin: number;
  arrivalDayOffset: number;
  daysOfWeek: string;
}

interface ReferenceAirport {
  iata: string;
  tz: string;
}

const ROOT = join(__dirname, '..', '..');
const flights: SeedFlight[] = JSON.parse(
  readFileSync(join(ROOT, 'prisma', 'seed-data', 'dxb-seed-schedule.json'), 'utf-8')
);
const airports: ReferenceAirport[] = JSON.parse(
  readFileSync(join(ROOT, 'src', 'ingest', 'data', 'airports-reference.json'), 'utf-8')
);

describe('DXB seed schedule', () => {
  it('references only airports that exist in the airports reference', () => {
    const known = new Set(airports.map((a) => a.iata));
    const unknown = flights
      .flatMap((f) => [f.depIata, f.arrIata])
      .filter((iata) => iata !== 'DXB' && !known.has(iata));
    expect([...new Set(unknown)]).toEqual([]);
  });

  it('serves Moscow from Domodedovo (DME), not Sheremetyevo (SVO)', () => {
    const touchesSvo = flights.filter((f) => f.depIata === 'SVO' || f.arrIata === 'SVO');
    const dme = flights.filter((f) => f.depIata === 'DME' || f.arrIata === 'DME');

    expect(touchesSvo).toEqual([]);
    expect(dme.map((f) => `${f.depIata}-${f.arrIata}`).sort()).toEqual(['DME-DXB', 'DXB-DME']);
  });

  it('places DME in the Moscow timezone', () => {
    expect(airports.find((a) => a.iata === 'DME')?.tz).toBe('Europe/Moscow');
  });
});

/**
 * Turnaround-route ground-time checks (docs/pairing-assumptions.md item 10
 * + docs/data-sources.md's 2026-09-24 entry) — every route generated with
 * `turnaround: true` in scripts/gen-seed-data.mjs is asserted here by its
 * OBSERVABLE effect (return STD's ground time relative to the outbound
 * arrival), not by re-reading the generator script's own route table, so
 * this test actually exercises the generated JSON.
 *
 * `turnaroundGroundMinutes` mirrors scripts/gen-seed-data.mjs's own helper
 * of the same name: ground time from the outbound leg's arrival-of-day to
 * the NEXT daily occurrence of the return leg's departure, handling the
 * UTC-midnight rollover via `% 1440` (both legs recur daily — see
 * src/pairing/expandScheduleToInstances.ts).
 */
function turnaroundGroundMinutes(outbound: SeedFlight, ret: SeedFlight): number {
  // `staUTCMin` IS already the arrival minute-of-day (buildLeg's own
  // `% 1440`) — `arrivalDayOffset` only says which day that minute-of-day
  // falls on, irrelevant here since the return leg recurs daily too.
  return ((ret.stdUTCMin - outbound.staUTCMin) % 1440 + 1440) % 1440;
}

function findFlight(flights: SeedFlight[], depIata: string, arrIata: string): SeedFlight {
  const found = flights.find((f) => f.depIata === depIata && f.arrIata === arrIata);
  if (!found) throw new Error(`No seed flight found for ${depIata}-${arrIata}`);
  return found;
}

describe('DXB seed schedule — turnaround routes (docs/pairing-assumptions.md item 10)', () => {
  // Routes whose return STD is DERIVED by the generator (no real published
  // stdRetLocal) — guaranteed by construction to land inside [45,150]min.
  const DERIVED_TURNAROUND_IATAS = [
    'BAH',
    'JED',
    'RUH',
    'DMM',
    'MCT',
    'AMM',
    'BGW',
    'BOM',
    'DEL',
    'ISB',
    'CAI',
    'BLR',
  ];

  it.each(DERIVED_TURNAROUND_IATAS)(
    '%s: return departs within [45,150]min of the outbound arrival',
    (iata) => {
      const outbound = findFlight(flights, 'DXB', iata);
      const ret = findFlight(flights, iata, 'DXB');
      const ground = turnaroundGroundMinutes(outbound, ret);
      expect(ground).toBeGreaterThanOrEqual(45);
      expect(ground).toBeLessThanOrEqual(150);
    }
  );

  // KWI and AMD keep their REAL researched stdOutLocal/stdRetLocal
  // (docs/data-sources.md's 2026-09-19 real-STD pass) untouched — per this
  // item's own scope decision ("if it has a real stdRetLocal, keep it and
  // just document"), their actual ground time is asserted/documented here
  // rather than forced into the turnaround window.
  it('KWI: real published times happen to land inside the turnaround window', () => {
    const outbound = findFlight(flights, 'DXB', 'KWI');
    const ret = findFlight(flights, 'KWI', 'DXB');
    expect(turnaroundGroundMinutes(outbound, ret)).toBe(105);
  });

  it('AMD: real published times do NOT land inside the turnaround window (documented, not forced)', () => {
    const outbound = findFlight(flights, 'DXB', 'AMD');
    const ret = findFlight(flights, 'AMD', 'DXB');
    const ground = turnaroundGroundMinutes(outbound, ret);
    expect(ground).toBe(405);
    expect(ground).toBeGreaterThan(150); // documents the deviation, not a turnaround in practice
  });

  it('does not flag DXB-LCA as a turnaround (deferred tag-on feature, docs/data-sources.md)', () => {
    const outbound = findFlight(flights, 'DXB', 'LCA');
    const ret = findFlight(flights, 'LCA', 'DXB');
    const ground = turnaroundGroundMinutes(outbound, ret);
    expect(ground).toBeGreaterThanOrEqual(480); // still an ordinary layover-shaped connection
  });
});

describe('DXB seed schedule — turnaroundOnlyStations coverage (docs/pairing-assumptions.md item 11)', () => {
  it.each(TURNAROUND_ONLY_STATIONS)(
    '%s: has a turnaround-window return every day (daily schedule, one instance pair suffices)',
    (iata) => {
      const outbound = findFlight(flights, 'DXB', iata);
      const ret = findFlight(flights, iata, 'DXB');
      expect(outbound.daysOfWeek).toBe('1111111');
      expect(ret.daysOfWeek).toBe('1111111');
      const ground = turnaroundGroundMinutes(outbound, ret);
      expect(ground).toBeGreaterThanOrEqual(45);
      expect(ground).toBeLessThanOrEqual(150);
    }
  );

  it('excludes AMD, whose real published return falls outside the turnaround window', () => {
    expect(TURNAROUND_ONLY_STATIONS as readonly string[]).not.toContain('AMD');
  });
});
