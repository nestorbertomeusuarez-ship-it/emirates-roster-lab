import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface SeedFlight {
  number: string;
  depIata: string;
  arrIata: string;
  advertisedType: string;
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
