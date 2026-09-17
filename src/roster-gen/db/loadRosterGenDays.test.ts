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
 * DATA-SAFETY FIX (2026-09-17): this test used to hardcode OFF_DATE=Oct 1 /
 * STANDBY_DATE=Oct 4 and only checked that its chosen FLIGHT candidate's
 * *start* date avoided them — not its full multi-day span, and not whatever
 * a real user might already have assigned elsewhere in October (this app's
 * one real user actively assigns/regenerates real rosters against this same
 * shared dev DB). A real near-miss happened this session: a live-generated
 * roster occupied Oct 1, and this test's own `clearRosterEntry`+`finally`
 * cleanup would have deleted it and never restored it. Fixed by querying
 * `listRosterEntries` FIRST and dynamically picking a FLIGHT candidate
 * (full span) plus two standalone OFF/STANDBY dates that are ALL
 * confirmed free — this test now never touches a pre-existing entry at
 * all, so there is nothing to restore. Still restricted to the first half
 * of the month (day <= 15) so this file's writes can't collide with
 * `src/pairing/db/loadPairing.test.ts`'s second-half-of-month writes
 * against the same shared RosterMonth row.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { generatePairingsForMonth } from '@/pairing/db/pairings';
import {
  assignPairingDuty,
  assignSimpleDuty,
  clearRosterEntry,
  getOrCreateRosterMonth,
  listRosterEntries,
} from '@/pairing/db/roster';
import { getAirportTimeZones } from '@/lib/airportTimeZones';
import { evaluateRosterDays } from '../generateMonthlyRoster';
import { loadRosterGenDaysForMonth } from './loadRosterGenDays';

const YEAR = 2026;
const MONTH = 10;
const DAYS_IN_MONTH = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();
const FIRST_HALF_LAST_DAY = 15;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('loadRosterGenDaysForMonth — real seeded DB', () => {
  it('reconstructs FLIGHT continuation days, maps OFF/STANDBY correctly, and plugs into evaluateRosterDays()', async () => {
    const rosterMonth = await getOrCreateRosterMonth(prisma, YEAR, MONTH);

    // Build the set of dates already occupied by a REAL pre-existing entry
    // (start day) or by a multi-day FLIGHT entry's span — never touch any
    // of these.
    const existingEntries = await listRosterEntries(prisma, rosterMonth.id);
    const occupied = new Set<string>();
    for (const entry of existingEntries) {
      const iso = entry.date.toISOString().slice(0, 10);
      const span = entry.dutyType === 'FLIGHT' && entry.spansDays ? entry.spansDays : 1;
      for (let k = 0; k < span; k += 1) {
        occupied.add(addDaysIso(iso, k));
      }
    }

    // No fleetTypes filter — this test only needs SOME real pairing to
    // round-trip through the evaluator, and widening the candidate pool
    // improves the odds of finding a span the real user's actual roster
    // hasn't already occupied (see the data-safety fix note above).
    const candidates = await generatePairingsForMonth(prisma, YEAR, MONTH, {
      maxTripDays: 4,
      minLayoverMinutes: 8 * 60,
      maxLayoverMinutes: 48 * 60,
    });

    const isFreeSpan = (startIso: string, tripDays: number): boolean => {
      if (Number(startIso.slice(8, 10)) + tripDays - 1 > FIRST_HALF_LAST_DAY) return false;
      for (let k = 0; k < tripDays; k += 1) {
        if (occupied.has(addDaysIso(startIso, k))) return false;
      }
      return true;
    };

    const candidate =
      candidates.find((p) => p.tripDays >= 2 && isFreeSpan(p.startServiceDate, p.tripDays)) ??
      candidates.find((p) => isFreeSpan(p.startServiceDate, p.tripDays));
    if (!candidate) {
      throw new Error(
        'No candidate pairing has a fully free span in the first half of the real seeded Oct ' +
          '2026 schedule — the real user roster currently occupies every day in that range. This ' +
          'is expected (not a bug) when the real month is fully generated; re-run once it has a ' +
          'gap, or see the data-safety note at the top of this file.'
      );
    }
    for (let k = 0; k < candidate.tripDays; k += 1) {
      occupied.add(addDaysIso(candidate.startServiceDate, k));
    }

    // Pick two more standalone free dates, distinct from the candidate's
    // span and each other, for the explicit-OFF and STANDBY fixtures.
    const freeDates: string[] = [];
    for (let day = 1; day <= FIRST_HALF_LAST_DAY && freeDates.length < 2; day += 1) {
      const iso = `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!occupied.has(iso)) {
        freeDates.push(iso);
        occupied.add(iso);
      }
    }
    if (freeDates.length < 2) {
      throw new Error(
        'Test fixture assumption broken: fewer than 2 free standalone dates in the first half of ' +
          'the real seeded Oct 2026 schedule — adjust this test fixture.'
      );
    }
    const [OFF_DATE, STANDBY_DATE] = freeDates;

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
      // Every date touched here was confirmed free of any pre-existing
      // entry before this test wrote to it — clearing is always safe,
      // never a loss of real data.
      await clearRosterEntry(prisma, rosterMonth.id, flightStart);
      await clearRosterEntry(prisma, rosterMonth.id, offDate);
      await clearRosterEntry(prisma, rosterMonth.id, standbyDate);
      if (pairingId) {
        await prisma.pairing.delete({ where: { id: pairingId } });
      }
    }
  });
});
