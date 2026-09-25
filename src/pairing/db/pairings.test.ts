/**
 * Regression test for the field-copying bug the coordinator fixed directly
 * (commit cbec482): `generatePairingsForMonth` used to copy `constraints`
 * field-by-field into the object passed to the pure `generatePairings`,
 * silently dropping `turnaroundMinMinutes`/`turnaroundMaxMinutes`/
 * `turnaroundOnlyStations` whenever they were added to
 * `PairingSearchConstraints` — so the DB-backed generation path never
 * produced a turnaround even though the pure `generatePairings` (exercised
 * directly by `generatePairings.test.ts`) already supported it. The fix
 * spreads `...constraints` instead.
 *
 * NO DATABASE: `ensureFlightInstancesForMonth` (the only Prisma-touching
 * call `generatePairingsForMonth` makes) is mocked out entirely via
 * `vi.mock` — this test never opens a real connection, reads, or writes
 * anything. This is a deliberate deviation from this codebase's usual
 * `src/pairing/db/*.test.ts` convention (see `loadPairing.test.ts`'s own
 * doc comment: real integration tests against the seeded dev DB) — that
 * pattern needs synthetic DB writes/teardown, which this task's own scope
 * explicitly forbids; mocking is the only way to regression-test this
 * specific wrapper without one.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DatedFlightInstance } from '../types';

const FIXTURE_INSTANCES: DatedFlightInstance[] = [
  {
    scheduleLineId: 'line-out',
    number: 'EK801',
    depIata: 'DXB',
    arrIata: 'MCT',
    serviceDate: '2026-10-01',
    depUTC: new Date('2026-10-01T06:00:00.000Z'),
    arrUTC: new Date('2026-10-01T07:15:00.000Z'),
    blockTimeMin: 75,
    aircraftType: 'A350',
  },
  {
    scheduleLineId: 'line-ret',
    number: 'EK802',
    depIata: 'MCT',
    arrIata: 'DXB',
    serviceDate: '2026-10-01',
    depUTC: new Date('2026-10-01T08:30:00.000Z'), // 75min ground — turnaround-window only
    arrUTC: new Date('2026-10-01T09:45:00.000Z'),
    blockTimeMin: 75,
    aircraftType: 'A350',
  },
];

describe('generatePairingsForMonth — forwards every constraints field to generatePairings', () => {
  it('finds the turnaround pairing when turnaroundMinMinutes/turnaroundMaxMinutes are set (regression: field-by-field copying used to drop these)', async () => {
    vi.resetModules();
    vi.doMock('./flightInstances', () => ({
      ensureFlightInstancesForMonth: async () => FIXTURE_INSTANCES,
    }));
    const { generatePairingsForMonth } = await import('./pairings');

    const pairings = await generatePairingsForMonth(
      {} as unknown as import('@prisma/client').PrismaClient,
      2026,
      10,
      {
        maxTripDays: 4,
        minLayoverMinutes: 8 * 60,
        maxLayoverMinutes: 48 * 60,
        turnaroundMinMinutes: 45,
        turnaroundMaxMinutes: 150,
        fleetTypes: ['A350'],
      }
    );

    expect(pairings).toHaveLength(1);
    expect(pairings[0].tripDays).toBe(1);
  });

  it('forwards turnaroundOnlyStations too (rejects the ordinary layover window at a listed station)', async () => {
    vi.resetModules();
    const longLayoverInstances: DatedFlightInstance[] = [
      FIXTURE_INSTANCES[0],
      {
        ...FIXTURE_INSTANCES[1],
        serviceDate: '2026-10-02',
        depUTC: new Date('2026-10-02T07:00:00.000Z'), // ~25h ground — ordinary layover window
        arrUTC: new Date('2026-10-02T08:15:00.000Z'),
      },
    ];
    vi.doMock('./flightInstances', () => ({
      ensureFlightInstancesForMonth: async () => longLayoverInstances,
    }));
    const { generatePairingsForMonth } = await import('./pairings');

    const pairings = await generatePairingsForMonth(
      {} as unknown as import('@prisma/client').PrismaClient,
      2026,
      10,
      {
        maxTripDays: 4,
        minLayoverMinutes: 8 * 60,
        maxLayoverMinutes: 48 * 60,
        turnaroundMinMinutes: 45,
        turnaroundMaxMinutes: 150,
        turnaroundOnlyStations: ['MCT'],
        fleetTypes: ['A350'],
      }
    );

    expect(pairings).toHaveLength(0);
  });
});
