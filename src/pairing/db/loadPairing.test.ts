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
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { generatePairingsForMonth } from './pairings';
import { assignPairingDuty, clearRosterEntry, getOrCreateRosterMonth } from './roster';
import { loadPairingById } from './loadPairing';

// The seed schedule (prisma/seed-data/dxb-seed-schedule.json) only covers
// October 2026 (effectiveFrom/effectiveTo both 2026-10-*).
const YEAR = 2026;
const MONTH = 10;

describe('loadPairingById — real seeded DB', () => {
  it('reconstructs an equivalent GeneratedPairing from what persistPairing wrote', async () => {
    const rosterMonth = await getOrCreateRosterMonth(prisma, YEAR, MONTH);

    const candidates = await generatePairingsForMonth(prisma, YEAR, MONTH, {
      maxTripDays: 4,
      minLayoverMinutes: 8 * 60,
      maxLayoverMinutes: 48 * 60,
      fleetTypes: ['A350'],
    });
    const secondHalfCandidates = candidates.filter(
      (p) => Number(p.startServiceDate.slice(8, 10)) >= 16
    );
    const candidate = secondHalfCandidates.find((p) => p.legs.length >= 2) ?? secondHalfCandidates[0];
    if (!candidate) {
      throw new Error(
        'Test fixture assumption broken: no A350 candidate pairing starts on or after the ' +
          '16th of the real seeded Oct 2026 schedule — adjust this test fixture.'
      );
    }

    const startDate = new Date(`${candidate.startServiceDate}T00:00:00.000Z`);
    await clearRosterEntry(prisma, rosterMonth.id, startDate);

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
