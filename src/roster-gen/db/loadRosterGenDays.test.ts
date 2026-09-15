/**
 * Integration test: reconstructs a `RosterGenDay[]` from a REAL mixed
 * persisted roster month (some FLIGHT via a real generated pairing, some
 * explicit OFF, at least one STANDBY) against the real seeded SQLite DB —
 * same pattern as `src/roster-gen/db/rosterGen.test.ts` (imports `prisma`
 * from `@/lib/prisma`, no mocking).
 *
 * This is Phase 5 Slice 1's actual point: proving `loadRosterGenDaysForMonth`
 * plugs a persisted roster into the real `evaluateRosterDays()` evaluator —
 * the reverse-direction counterpart to Phase 2's
 * `toFlightDutyPeriod.test.ts` integration test (PLAN.md), which proved the
 * FORWARD direction (a freshly generated pairing -> evaluateDuty()).
 *
 * DATE ISOLATION NOTE: restricted to the first half of the month (day <=
 * 15) so this file's RosterEntry writes never collide with
 * `src/pairing/db/loadPairing.test.ts`'s second-half-of-month writes
 * against the same shared RosterMonth row (both integration tests
 * necessarily share the one real seeded month, October 2026).
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { generatePairingsForMonth } from '@/pairing/db/pairings';
import {
  assignPairingDuty,
  assignSimpleDuty,
  clearRosterEntry,
  getOrCreateRosterMonth,
} from '@/pairing/db/roster';
import { getAirportTimeZones } from '@/lib/airportTimeZones';
import { evaluateRosterDays } from '../generateMonthlyRoster';
import { loadRosterGenDaysForMonth } from './loadRosterGenDays';

const YEAR = 2026;
const MONTH = 10;
const DAYS_IN_MONTH = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();

const OFF_DATE = '2026-10-01';
const STANDBY_DATE = '2026-10-04';

describe('loadRosterGenDaysForMonth — real seeded DB', () => {
  it('reconstructs FLIGHT continuation days, maps OFF/STANDBY correctly, and plugs into evaluateRosterDays()', async () => {
    const rosterMonth = await getOrCreateRosterMonth(prisma, YEAR, MONTH);

    const candidates = await generatePairingsForMonth(prisma, YEAR, MONTH, {
      maxTripDays: 4,
      minLayoverMinutes: 8 * 60,
      maxLayoverMinutes: 48 * 60,
      fleetTypes: ['A380'],
    });
    const firstHalfCandidates = candidates.filter(
      (p) => Number(p.startServiceDate.slice(8, 10)) <= 15
    );
    // Prefer a multi-day pairing so the FLIGHT continuation-day expansion is
    // actually exercised, and make sure it doesn't overlap OFF_DATE/STANDBY_DATE.
    const candidate =
      firstHalfCandidates.find(
        (p) =>
          p.tripDays >= 2 &&
          p.startServiceDate !== OFF_DATE &&
          p.startServiceDate !== STANDBY_DATE &&
          Number(p.startServiceDate.slice(8, 10)) > 5
      ) ??
      firstHalfCandidates.find(
        (p) => p.startServiceDate !== OFF_DATE && p.startServiceDate !== STANDBY_DATE && Number(p.startServiceDate.slice(8, 10)) > 5
      );
    if (!candidate) {
      throw new Error(
        'Test fixture assumption broken: no A380 candidate pairing starts in the first half of ' +
          'the real seeded Oct 2026 schedule (after day 5) — adjust this test fixture.'
      );
    }

    const flightStart = new Date(`${candidate.startServiceDate}T00:00:00.000Z`);
    const offDate = new Date(`${OFF_DATE}T00:00:00.000Z`);
    const standbyDate = new Date(`${STANDBY_DATE}T00:00:00.000Z`);

    await clearRosterEntry(prisma, rosterMonth.id, flightStart);
    await clearRosterEntry(prisma, rosterMonth.id, offDate);
    await clearRosterEntry(prisma, rosterMonth.id, standbyDate);

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
        const dayDate = new Date(flightStart.getTime() + k * 86_400_000).toISOString().slice(0, 10);
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

      // Every day with no RosterEntry maps to OFF too.
      const untouchedDay = days.find(
        (d) =>
          d.date !== OFF_DATE &&
          d.date !== STANDBY_DATE &&
          Number(d.date.slice(8, 10)) < Number(candidate.startServiceDate.slice(8, 10)) &&
          d.date !== OFF_DATE
      );
      if (untouchedDay) {
        expect(untouchedDay.assignment).toEqual({ type: 'OFF' });
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
      await clearRosterEntry(prisma, rosterMonth.id, flightStart);
      await clearRosterEntry(prisma, rosterMonth.id, offDate);
      await clearRosterEntry(prisma, rosterMonth.id, standbyDate);
      if (pairingId) {
        await prisma.pairing.delete({ where: { id: pairingId } });
      }
    }
  });
});
