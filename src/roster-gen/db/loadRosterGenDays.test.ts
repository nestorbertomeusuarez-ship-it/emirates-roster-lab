/**
 * Integration test: reconstructs a `RosterGenDay[]` from a mixed persisted
 * roster month (a real generated pairing, an explicit OFF, and a STANDBY)
 * against the real seeded SQLite DB — same pattern as
 * `src/roster-gen/db/rosterGen.test.ts` (imports `prisma` from
 * `@/lib/prisma`, no mocking).
 *
 * This is Phase 5 Slice 1's actual point: proving `loadRosterGenDaysForMonth`
 * plugs a persisted roster into the real `evaluateRosterDays()` evaluator —
 * the reverse-direction counterpart to Phase 2's
 * `toFlightDutyPeriod.test.ts` integration test (PLAN.md), which proved the
 * FORWARD direction (a freshly generated pairing -> evaluateDuty()).
 *
 * SELF-CONTAINED SYNTHETIC FIXTURE (2026-09-18, docs item 25's own review):
 * this test used to depend on finding a free date span in the real seeded
 * Oct 2026 schedule (the only month with real flight data) — see a real
 * data-loss near-miss this same session's earlier "DATA-SAFETY FIX" fixed
 * by querying existing entries first. That fix made the test SAFE, but not
 * ROBUST: as the roster generator got better at filling the whole month
 * (items 20-23), this test started failing more and more often purely
 * because the user's own real roster left no free span — not a regression.
 * Fixed properly by giving this test its OWN dedicated synthetic month
 * (2099-01, `ZZ1`/`ZZ2` — IATA codes containing a digit, guaranteed never
 * to collide with a real all-alphabetic code or with
 * `src/pairing/db/loadPairing.test.ts`'s own disjoint 2099-02/`ZZ3`/`ZZ4`
 * fixture if both files run in parallel — `vitest.config.ts` has no
 * `fileParallelism: false`). `Airport`/`Flight` rows are created directly
 * in `beforeAll` (bypassing the real seed script entirely) and torn down in
 * `afterAll`, scoped strictly to the IDs this file itself created — this
 * test no longer depends on, or can ever affect, the real Oct 2026 data or
 * the user's real roster.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { generatePairingsForMonth } from '@/pairing/db/pairings';
import { assignPairingDuty, assignSimpleDuty, getOrCreateRosterMonth } from '@/pairing/db/roster';
import { getAirportTimeZones } from '@/lib/airportTimeZones';
import { evaluateRosterDays } from '../generateMonthlyRoster';
import { loadRosterGenDaysForMonth } from './loadRosterGenDays';

const YEAR = 2099;
const MONTH = 1;
const DAYS_IN_MONTH = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();
const HOME_IATA = 'ZZ1';
const DEST_IATA = 'ZZ2';
const OFF_DATE = `${YEAR}-01-05`;
const STANDBY_DATE = `${YEAR}-01-06`;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  // day X+1) — a 2-day pairing every day of the fixture month, matching the
  // original test's preference for a multi-day candidate to exercise
  // FLIGHT continuation-day expansion.
  const out = await prisma.flight.create({
    data: {
      number: 'ZZ100',
      depAirportId: home.id,
      arrAirportId: dest.id,
      stdUTCMin: 6 * 60,
      staUTCMin: 11 * 60,
      arrivalDayOffset: 0,
      blockTimeMin: 300,
      advertisedType: 'A350',
      daysOfWeek: '1111111',
      effectiveFrom: new Date(`${YEAR}-01-01T00:00:00.000Z`),
      effectiveTo: new Date(`${YEAR}-01-31T00:00:00.000Z`),
      source: 'MANUAL_JSON',
    },
  });
  const ret = await prisma.flight.create({
    data: {
      number: 'ZZ200',
      depAirportId: dest.id,
      arrAirportId: home.id,
      stdUTCMin: 7 * 60, // 07:00 UTC next day (~20h after the out leg's 11:00 UTC arrival)
      staUTCMin: 12 * 60,
      arrivalDayOffset: 1,
      blockTimeMin: 300,
      advertisedType: 'A350',
      daysOfWeek: '1111111',
      effectiveFrom: new Date(`${YEAR}-01-01T00:00:00.000Z`),
      effectiveTo: new Date(`${YEAR}-01-31T00:00:00.000Z`),
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

describe('loadRosterGenDaysForMonth — synthetic fixture month', () => {
  it('reconstructs FLIGHT continuation days, maps OFF/STANDBY correctly, and plugs into evaluateRosterDays()', async () => {
    const rosterMonth = await getOrCreateRosterMonth(prisma, YEAR, MONTH);

    const candidates = await generatePairingsForMonth(prisma, YEAR, MONTH, {
      maxTripDays: 4,
      minLayoverMinutes: 8 * 60,
      maxLayoverMinutes: 48 * 60,
      homeBase: HOME_IATA,
    });
    const candidate = candidates.find((p) => p.startServiceDate === `${YEAR}-01-01`);
    if (!candidate) {
      throw new Error('Test fixture assumption broken: no candidate pairing starting 2099-01-01.');
    }

    const flightStart = new Date(`${candidate.startServiceDate}T00:00:00.000Z`);
    const offDate = new Date(`${OFF_DATE}T00:00:00.000Z`);
    const standbyDate = new Date(`${STANDBY_DATE}T00:00:00.000Z`);

    let pairingId: string | null = null;
    try {
      const entry = await assignPairingDuty(prisma, rosterMonth.id, flightStart, candidate);
      pairingId = entry.pairingId;
      await assignSimpleDuty(prisma, rosterMonth.id, offDate, 'OFF');
      await assignSimpleDuty(prisma, rosterMonth.id, standbyDate, 'STANDBY');

      const days = await loadRosterGenDaysForMonth(prisma, rosterMonth.id, YEAR, MONTH);

      // Full month length.
      expect(days).toHaveLength(DAYS_IN_MONTH);
      expect(days.map((d) => d.date)).toEqual(
        Array.from({ length: DAYS_IN_MONTH }, (_, i) =>
          new Date(Date.UTC(YEAR, MONTH - 1, i + 1)).toISOString().slice(0, 10)
        )
      );

      // Explicit OFF day.
      const offDay = days.find((d) => d.date === OFF_DATE);
      expect(offDay?.assignment).toEqual({ type: 'OFF' });

      // STANDBY is treated as OFF-equivalent for evaluation purposes (see
      // docs/roster-gen-assumptions.md, item logged by this Phase 5 slice).
      const standbyDay = days.find((d) => d.date === STANDBY_DATE);
      expect(standbyDay?.assignment).toEqual({ type: 'OFF' });

      // FLIGHT continuation-day expansion: every day of the pairing's span
      // is a FLIGHT day with the correct incrementing dayOfPairing, and they
      // all reference an equivalent reconstructed pairing.
      for (let k = 0; k < candidate.tripDays; k += 1) {
        const dayDate = addDaysIso(candidate.startServiceDate, k);
        const day = days.find((d) => d.date === dayDate);
        expect(day).toBeDefined();
        expect(day!.assignment.type).toBe('FLIGHT');
        if (day!.assignment.type === 'FLIGHT') {
          expect(day!.assignment.dayOfPairing).toBe(k + 1);
          expect(day!.assignment.pairing.id).toBe(pairingId);
          expect(day!.assignment.pairing.fleetType).toBe(candidate.fleetType);
          expect(day!.assignment.pairing.legs.length).toBe(candidate.legs.length);
        }
      }

      // The actual point of Slice 1: the reconstructed days plug into the
      // real evaluator without throwing and produce a well-formed result.
      const airportTimeZones = await getAirportTimeZones(prisma);
      const evaluations = evaluateRosterDays(days, airportTimeZones);

      expect(Array.isArray(evaluations)).toBe(true);
      for (const dated of evaluations) {
        expect(typeof dated.date).toBe('string');
        expect(['GREEN', 'AMBER', 'RED']).toContain(dated.evaluation.severity);
        expect(dated.evaluation.citation).toBeDefined();
        expect(typeof dated.evaluation.message).toBe('string');
      }
    } finally {
      // This fixture month is exclusively this test's own — safe to remove
      // the whole RosterMonth (cascades its RosterEntry rows) and the
      // Pairing (cascades its PairingLeg rows) unconditionally.
      await prisma.rosterMonth.delete({ where: { id: rosterMonth.id } });
      if (pairingId) {
        await prisma.pairing.delete({ where: { id: pairingId } });
      }
    }
  });
});
