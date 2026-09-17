/**
 * Prisma-aware CRUD helpers for RosterMonth / RosterEntry — the manual
 * roster constructor's persistence layer. Kept separate from the pure
 * pairing-search/duty-time modules; this file is allowed to know about
 * Prisma and the Next.js server actions that call it.
 */

import type { PrismaClient, RosterEntry, RosterMonth } from '@prisma/client';
import type { DutyType, GeneratedPairing } from '../types';
import { persistPairing } from './pairings';

export async function getOrCreateRosterMonth(
  prisma: PrismaClient,
  year: number,
  month: number
): Promise<RosterMonth> {
  return prisma.rosterMonth.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { year, month },
  });
}

/**
 * Read-only — the RosterMonth row for year/month, or `null` if none exists
 * yet. Never creates one (unlike `getOrCreateRosterMonth`) — fabricating a
 * phantom row here would be wrong for a best-effort lookup
 * (docs/roster-gen-assumptions.md item 24: this is used to find whether a
 * PREVIOUS month's real roster exists to carry rest/consecutive-duty
 * history from, not to guarantee one exists).
 */
export async function findRosterMonth(
  prisma: PrismaClient,
  year: number,
  month: number
): Promise<RosterMonth | null> {
  return prisma.rosterMonth.findUnique({ where: { year_month: { year, month } } });
}

export async function listRosterEntries(
  prisma: PrismaClient,
  rosterMonthId: string
): Promise<RosterEntry[]> {
  return prisma.rosterEntry.findMany({
    where: { rosterMonthId },
    orderBy: { date: 'asc' },
  });
}

/**
 * Assigns a non-FLIGHT duty type (OFF / STANDBY / SIM / GROUND_SCHOOL /
 * VACATION) to a single calendar day, replacing whatever was there before.
 */
export async function assignSimpleDuty(
  prisma: PrismaClient,
  rosterMonthId: string,
  date: Date,
  dutyType: Exclude<DutyType, 'FLIGHT'>
): Promise<RosterEntry> {
  return prisma.rosterEntry.upsert({
    where: { rosterMonthId_date: { rosterMonthId, date } },
    update: { dutyType, pairingId: null, spansDays: null },
    create: { rosterMonthId, date, dutyType, pairingId: null, spansDays: null },
  });
}

/**
 * Assigns a FLIGHT duty: persists the selected candidate pairing (see
 * db/pairings.ts#persistPairing) and creates/replaces the single
 * RosterEntry on the pairing's start date, carrying `spansDays` (see the
 * RosterEntry doc comment in prisma/schema.prisma for why only the start
 * date gets a row).
 */
export async function assignPairingDuty(
  prisma: PrismaClient,
  rosterMonthId: string,
  startDate: Date,
  pairing: GeneratedPairing
): Promise<RosterEntry> {
  const pairingId = pairing.id ?? (await persistPairing(prisma, pairing));

  return prisma.rosterEntry.upsert({
    where: { rosterMonthId_date: { rosterMonthId, date: startDate } },
    update: { dutyType: 'FLIGHT', pairingId, spansDays: pairing.tripDays },
    create: {
      rosterMonthId,
      date: startDate,
      dutyType: 'FLIGHT',
      pairingId,
      spansDays: pairing.tripDays,
    },
  });
}

export async function clearRosterEntry(
  prisma: PrismaClient,
  rosterMonthId: string,
  date: Date
): Promise<void> {
  await prisma.rosterEntry.deleteMany({ where: { rosterMonthId, date } });
}

/**
 * Derives, for each day 1..N of the month, which RosterEntry (if any)
 * "occupies" that day — expanding multi-day FLIGHT entries (spansDays > 1)
 * across their continuation days, WITHOUT creating extra DB rows for them
 * (see the RosterEntry doc comment in prisma/schema.prisma). Pure
 * function: takes plain entry rows, returns a plain day -> cell map.
 */
export interface RosterDayCell {
  /** ISO date 'YYYY-MM-DD' for this calendar day. */
  date: string;
  entry: RosterEntry | null;
  /** True when this day is a continuation day (day 2+) of a multi-day FLIGHT entry that started on an earlier day. */
  isPairingContinuation: boolean;
  /** 1-based day-of-pairing index when this cell belongs to a FLIGHT entry (1 = the start day). */
  dayOfPairing: number | null;
}

export function buildRosterGrid(
  year: number,
  month: number,
  entries: RosterEntry[]
): RosterDayCell[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDate = new Map<string, RosterEntry>();
  for (const entry of entries) {
    byDate.set(entry.date.toISOString().slice(0, 10), entry);
  }

  // Pre-compute which continuation days belong to which starting entry.
  const continuationOwner = new Map<string, { entry: RosterEntry; dayOfPairing: number }>();
  for (const entry of entries) {
    if (entry.dutyType === 'FLIGHT' && entry.spansDays && entry.spansDays > 1) {
      const start = new Date(entry.date);
      for (let offset = 1; offset < entry.spansDays; offset += 1) {
        const day = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
        continuationOwner.set(day.toISOString().slice(0, 10), {
          entry,
          dayOfPairing: offset + 1,
        });
      }
    }
  }

  const cells: RosterDayCell[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    const directEntry = byDate.get(iso);
    if (directEntry) {
      cells.push({ date: iso, entry: directEntry, isPairingContinuation: false, dayOfPairing: directEntry.dutyType === 'FLIGHT' ? 1 : null });
      continue;
    }
    const continuation = continuationOwner.get(iso);
    if (continuation) {
      cells.push({
        date: iso,
        entry: continuation.entry,
        isPairingContinuation: true,
        dayOfPairing: continuation.dayOfPairing,
      });
      continue;
    }
    cells.push({ date: iso, entry: null, isPairingContinuation: false, dayOfPairing: null });
  }
  return cells;
}
