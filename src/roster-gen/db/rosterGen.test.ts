/**
 * Integration test: runs the automatic monthly roster generator against
 * the REAL seeded database (post Part A's expanded DXB route network), for
 * both fleet types, over one real month. This is the test that actually
 * proves the deliverable works end-to-end against real data, not just a
 * hand-built synthetic fixture (see generateMonthlyRoster.test.ts for the
 * fast unit-level coverage).
 *
 * Slower than the rest of the suite (hits sqlite via Prisma) — kept in its
 * own file so it's easy to spot in test output, per the task's request for
 * "a slower integration test using the REAL seeded data."
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { buildMonthlyRosterForFleet } from './rosterGen';

// The expanded seed schedule (prisma/seed-data/dxb-seed-schedule.json) is
// dated for October 2026 — see Part A's generator script.
const YEAR = 2026;
const MONTH = 10;
const DAYS_IN_MONTH = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();

describe.each(['A350', 'A380'] as const)(
  'generateMonthlyRoster — real seeded data, fleet %s',
  (fleetType) => {
    it('produces a full, non-trivial, GCAA-compliant month', async () => {
      const result = await buildMonthlyRosterForFleet(prisma, YEAR, MONTH, fleetType);

      expect(result.days).toHaveLength(DAYS_IN_MONTH);
      expect(result.summary.flightDays).toBeGreaterThan(0);
      expect(result.summary.totalBlockMinutes).toBeGreaterThan(0);

      const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
      expect(reds).toEqual([]);
    }, 60_000);
  }
);
