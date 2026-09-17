/**
 * Integration test: round-trips a real persisted `Pairing` through
 * `loadPairingById` against the REAL seeded database (same pattern as
 * `src/roster-gen/db/rosterGen.test.ts` — imports `prisma` from
 * `@/lib/prisma`, hits the real seeded SQLite DB, no mocking).
 *
 * Phase 5 Slice 1: `loadPairingById` is the exact inverse of
 * `persistPairing` (src/pairing/db/pairings.ts) — this test proves that
 * inverse round-trips a real persisted pairing back into an equivalent
 * `GeneratedPairing`.
 *
 * DATE ISOLATION NOTE: restricted to the second half of the month
 * (service date day >= 16) so this file's RosterEntry writes never collide
 * with `src/roster-gen/db/loadRosterGenDays.test.ts`'s first-half-of-month
 * writes against the same shared RosterMonth row (both integration tests
 * necessarily share the one real seeded month, October 2026 — see
 * PLAN.md / docs/roster-gen-assumptions.md).
 *
 * DATA-SAFETY FIX (2026-09-17): this test used to pick the first matching
 * second-half candidate and `clearRosterEntry`+overwrite its start date
 * unconditionally — this app's one real user actively assigns/regenerates
 * real rosters against this same shared dev DB, and a real near-miss
 * happened this session from an identical pattern in the sibling
 * first-half test. Fixed to query existing entries first and only pick a
 * candidate whose FULL multi-day span is confirmed free, so this test
 * never touches a pre-existing entry at all.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { generatePairingsForMonth } from './pairings';
import {
  assignPairingDuty,
  clearRosterEntry,
  getOrCreateRosterMonth,
  listRosterEntries,
} from './roster';
import { loadPairingById } from './loadPairing';

// The seed schedule (prisma/seed-data/dxb-seed-schedule.json) only covers
// October 2026 (effectiveFrom/effectiveTo both 2026-10-*).
const YEAR = 2026;
const MONTH = 10;
const SECOND_HALF_FIRST_DAY = 16;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('loadPairingById — real seeded DB', () => {
  it('reconstructs an equivalent GeneratedPairing from what persistPairing wrote', async () => {
    const rosterMonth = await getOrCreateRosterMonth(prisma, YEAR, MONTH);

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
    // round-trip, and widening the candidate pool improves the odds of
    // finding a span the real user's actual roster hasn't already occupied
    // (see the data-safety fix note above).
    const candidates = await generatePairingsForMonth(prisma, YEAR, MONTH, {
      maxTripDays: 4,
      minLayoverMinutes: 8 * 60,
      maxLayoverMinutes: 48 * 60,
    });
    const isFreeSpan = (startIso: string, tripDays: number): boolean => {
      if (Number(startIso.slice(8, 10)) < SECOND_HALF_FIRST_DAY) return false;
      for (let k = 0; k < tripDays; k += 1) {
        if (occupied.has(addDaysIso(startIso, k))) return false;
      }
      return true;
    };
    const freeSecondHalfCandidates = candidates.filter((p) =>
      isFreeSpan(p.startServiceDate, p.tripDays)
    );
    const candidate =
      freeSecondHalfCandidates.find((p) => p.legs.length >= 2) ?? freeSecondHalfCandidates[0];
    if (!candidate) {
      throw new Error(
        'No candidate pairing has a fully free span on or after the 16th of the real seeded ' +
          'Oct 2026 schedule — the real user roster currently occupies every day in that range. ' +
          'This is expected (not a bug) when the real month is fully generated; re-run once it ' +
          'has a gap, or see the data-safety note at the top of this file.'
      );
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
      // First leg never has a preceding layover (starts the pairing at DXB).
      expect(loaded.legs[0].layoverMinutesBeforeThisLeg).toBeNull();
    } finally {
      await clearRosterEntry(prisma, rosterMonth.id, startDate);
      await prisma.pairing.delete({ where: { id: pairingId } });
    }
  });

  it('throws a clear error when the pairing does not exist', async () => {
    await expect(loadPairingById(prisma, 'does-not-exist-pairing-id')).rejects.toThrow(
      /does-not-exist-pairing-id/
    );
  });
});
