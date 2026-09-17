/**
 * Integration test: round-trips a real persisted `Pairing` through
 * `loadPairingById` against the real seeded database (same pattern as
 * `src/roster-gen/db/rosterGen.test.ts` — imports `prisma` from
 * `@/lib/prisma`, hits the real seeded SQLite DB, no mocking).
 *
 * Phase 5 Slice 1: `loadPairingById` is the exact inverse of
 * `persistPairing` (src/pairing/db/pairings.ts) — this test proves that
 * inverse round-trips a real persisted pairing back into an equivalent
 * `GeneratedPairing`.
 *
 * SELF-CONTAINED SYNTHETIC FIXTURE (2026-09-18, docs item 25's own review):
 * this test used to depend on finding a free date span in the real seeded
 * Oct 2026 schedule (the only month with real flight data), restricted to
 * the second half of the month so its writes never collided with the
 * sibling `src/roster-gen/db/loadRosterGenDays.test.ts`'s first-half writes
 * against the same shared real `RosterMonth` row. That data-safety fix made
 * the test SAFE (queries existing entries first, never touches a
 * pre-existing one), but not ROBUST: as the roster generator got better at
 * filling the whole month (items 20-23), this test started failing more
 * often purely because the user's own real roster left no free span — not
 * a regression. Fixed properly by giving this test its OWN dedicated
 * synthetic month (2099-02, `ZZ3`/`ZZ4` — IATA codes containing a digit,
 * guaranteed never to collide with a real all-alphabetic code, or with
 * `loadRosterGenDays.test.ts`'s own disjoint 2099-01/`ZZ1`/`ZZ2` fixture if
 * both files run in parallel — `vitest.config.ts` has no
 * `fileParallelism: false`). `Airport`/`Flight` rows are created directly
 * in `beforeAll` (bypassing the real seed script entirely) and torn down in
 * `afterAll`, scoped strictly to the IDs this file itself created — no more
 * second-half-of-month coordination needed, and this test no longer
 * depends on, or can ever affect, the real Oct 2026 data or the user's real
 * roster.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { generatePairingsForMonth } from './pairings';
import { assignPairingDuty, getOrCreateRosterMonth } from './roster';
import { loadPairingById } from './loadPairing';

const YEAR = 2099;
const MONTH = 2;
const HOME_IATA = 'ZZ3';
const DEST_IATA = 'ZZ4';

let flightOutId: string;
let flightRetId: string;

beforeAll(async () => {
  const [home, dest] = await Promise.all([
    prisma.airport.create({
      data: { iata: HOME_IATA, name: 'Fixture Home (test-only)', lat: 0, lon: 0, tz: 'UTC' },
    }),
    prisma.airport.create({
      data: { iata: DEST_IATA, name: 'Fixture Dest (test-only)', lat: 0, lon: 0, tz: 'UTC' },
    }),
  ]);

  // Daily out (day X, 06:00 UTC, 5h block) + return (~20h layover, lands
  // day X+1) — a 2-leg, 2-day pairing every day of the fixture month, so
  // this test's own `legs.length >= 2` preference is always satisfiable.
  const out = await prisma.flight.create({
    data: {
      number: 'ZZ300',
      depAirportId: home.id,
      arrAirportId: dest.id,
      stdUTCMin: 6 * 60,
      staUTCMin: 11 * 60,
      arrivalDayOffset: 0,
      blockTimeMin: 300,
      advertisedType: 'A350',
      daysOfWeek: '1111111',
      effectiveFrom: new Date(`${YEAR}-02-01T00:00:00.000Z`),
      effectiveTo: new Date(`${YEAR}-02-28T00:00:00.000Z`),
      source: 'MANUAL_JSON',
    },
  });
  const ret = await prisma.flight.create({
    data: {
      number: 'ZZ400',
      depAirportId: dest.id,
      arrAirportId: home.id,
      stdUTCMin: 7 * 60, // 07:00 UTC next day (~20h after the out leg's 11:00 UTC arrival)
      staUTCMin: 12 * 60,
      arrivalDayOffset: 1,
      blockTimeMin: 300,
      advertisedType: 'A350',
      daysOfWeek: '1111111',
      effectiveFrom: new Date(`${YEAR}-02-01T00:00:00.000Z`),
      effectiveTo: new Date(`${YEAR}-02-28T00:00:00.000Z`),
      source: 'MANUAL_JSON',
    },
  });
  flightOutId = out.id;
  flightRetId = ret.id;
});

afterAll(async () => {
  await prisma.flightInstance.deleteMany({ where: { flightId: { in: [flightOutId, flightRetId] } } });
  await prisma.flight.deleteMany({ where: { id: { in: [flightOutId, flightRetId] } } });
  await prisma.airport.deleteMany({ where: { iata: { in: [HOME_IATA, DEST_IATA] } } });
});

describe('loadPairingById — synthetic fixture month', () => {
  it('reconstructs an equivalent GeneratedPairing from what persistPairing wrote', async () => {
    const rosterMonth = await getOrCreateRosterMonth(prisma, YEAR, MONTH);

    const candidates = await generatePairingsForMonth(prisma, YEAR, MONTH, {
      maxTripDays: 4,
      minLayoverMinutes: 8 * 60,
      maxLayoverMinutes: 48 * 60,
      homeBase: HOME_IATA,
    });
    const candidate =
      candidates.find((p) => p.startServiceDate === `${YEAR}-02-01` && p.legs.length >= 2) ??
      candidates.find((p) => p.startServiceDate === `${YEAR}-02-01`);
    if (!candidate) {
      throw new Error('Test fixture assumption broken: no candidate pairing starting 2099-02-01.');
    }

    const startDate = new Date(`${candidate.startServiceDate}T00:00:00.000Z`);

    const entry = await assignPairingDuty(prisma, rosterMonth.id, startDate, candidate);
    const pairingId = entry.pairingId as string;
    expect(pairingId).toBeTruthy();

    try {
      const loaded = await loadPairingById(prisma, pairingId);

      expect(loaded.id).toBe(pairingId);
      expect(loaded.fleetType).toBe(candidate.fleetType);
      expect(loaded.startServiceDate).toBe(candidate.startServiceDate);
      expect(loaded.endServiceDate).toBe(candidate.endServiceDate);
      expect(loaded.tripDays).toBe(candidate.tripDays);
      expect(loaded.legs).toHaveLength(candidate.legs.length);

      candidate.legs.forEach((expectedLeg, i) => {
        const actualLeg = loaded.legs[i];
        expect(actualLeg.instance.number).toBe(expectedLeg.instance.number);
        expect(actualLeg.instance.depIata).toBe(expectedLeg.instance.depIata);
        expect(actualLeg.instance.arrIata).toBe(expectedLeg.instance.arrIata);
        expect(actualLeg.instance.serviceDate).toBe(expectedLeg.instance.serviceDate);
        expect(actualLeg.instance.depUTC.getTime()).toBe(expectedLeg.instance.depUTC.getTime());
        expect(actualLeg.instance.arrUTC.getTime()).toBe(expectedLeg.instance.arrUTC.getTime());
        expect(actualLeg.instance.blockTimeMin).toBe(expectedLeg.instance.blockTimeMin);
        expect(actualLeg.instance.aircraftType).toBe(expectedLeg.instance.aircraftType);
        expect(actualLeg.layoverMinutesBeforeThisLeg).toBe(expectedLeg.layoverMinutesBeforeThisLeg);
      });
      // First leg never has a preceding layover (starts the pairing at the fixture home base).
      expect(loaded.legs[0].layoverMinutesBeforeThisLeg).toBeNull();
    } finally {
      // This fixture month is exclusively this test's own — safe to remove
      // the whole RosterMonth (cascades its RosterEntry rows) and the
      // Pairing (cascades its PairingLeg rows) unconditionally.
      await prisma.rosterMonth.delete({ where: { id: rosterMonth.id } });
      await prisma.pairing.delete({ where: { id: pairingId } });
    }
  });

  it('throws a clear error when the pairing does not exist', async () => {
    await expect(loadPairingById(prisma, 'does-not-exist-pairing-id')).rejects.toThrow(
      /does-not-exist-pairing-id/
    );
  });
});
