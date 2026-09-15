'use server';

/**
 * Server Actions backing the manual roster constructor's plain
 * click-to-assign forms (see page.tsx's scope note: no drag-and-drop, no
 * client-side state — every mutation is a full form submit + server-side
 * revalidation, which is enough for this phase).
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import {
  assignPairingDuty,
  assignSimpleDuty,
  clearRosterEntry,
  getOrCreateRosterMonth,
} from '@/pairing/db/roster';
import { generatePairingsForMonth } from '@/pairing/db/pairings';
import type { DutyType } from '@/pairing/types';
import {
  buildMonthlyRosterForFleet,
  countExistingRosterEntries,
  persistGeneratedRoster,
} from '@/roster-gen/db/rosterGen';

/**
 * Pairing-search constraints used by the UI. Not user-configurable yet
 * (that's a reasonable future enhancement, out of scope for this minimal
 * Phase 2 constructor) — see docs/pairing-assumptions.md.
 */
const UI_PAIRING_CONSTRAINTS = {
  maxTripDays: 4,
  minLayoverMinutes: 8 * 60,
  maxLayoverMinutes: 48 * 60,
};

function requireString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required form field "${key}"`);
  }
  return value;
}

export async function assignSimpleDutyAction(formData: FormData): Promise<void> {
  const rosterMonthId = requireString(formData, 'rosterMonthId');
  const dateStr = requireString(formData, 'date');
  const dutyType = requireString(formData, 'dutyType') as Exclude<DutyType, 'FLIGHT'>;
  const year = Number(requireString(formData, 'year'));
  const month = Number(requireString(formData, 'month'));

  await assignSimpleDuty(prisma, rosterMonthId, new Date(`${dateStr}T00:00:00.000Z`), dutyType);
  revalidatePath(`/roster/${year}/${month}`);
}

export async function assignPairingDutyAction(formData: FormData): Promise<void> {
  const rosterMonthId = requireString(formData, 'rosterMonthId');
  const dateStr = requireString(formData, 'date');
  const pairingIndex = Number(requireString(formData, 'pairingIndex'));
  const year = Number(requireString(formData, 'year'));
  const month = Number(requireString(formData, 'month'));

  // Re-derive the exact candidate list rather than trusting a serialized
  // pairing from the client — the form only carries an index, the server
  // regenerates the same deterministic candidate set and picks by index.
  const pairings = await generatePairingsForMonth(
    prisma,
    year,
    month,
    UI_PAIRING_CONSTRAINTS
  );
  const candidatesForDay = pairings.filter((p) => p.startServiceDate === dateStr);
  const chosen = candidatesForDay[pairingIndex];
  if (!chosen) {
    throw new Error(
      `assignPairingDutyAction: no candidate pairing at index ${pairingIndex} for ${dateStr}`
    );
  }

  await assignPairingDuty(prisma, rosterMonthId, new Date(`${dateStr}T00:00:00.000Z`), chosen);
  revalidatePath(`/roster/${year}/${month}`);
}

export async function clearDutyAction(formData: FormData): Promise<void> {
  const rosterMonthId = requireString(formData, 'rosterMonthId');
  const dateStr = requireString(formData, 'date');
  const year = Number(requireString(formData, 'year'));
  const month = Number(requireString(formData, 'month'));

  await clearRosterEntry(prisma, rosterMonthId, new Date(`${dateStr}T00:00:00.000Z`));
  revalidatePath(`/roster/${year}/${month}`);
}

/**
 * Automatic monthly roster generation (Phase 4). Two-step confirm: if the
 * month already has RosterEntry rows (manual or a previous generation) and
 * the caller hasn't confirmed yet, redirects back with query params the
 * page reads to render a "this will overwrite N entries" confirmation
 * form (see page.tsx) instead of silently destroying existing work.
 */
export async function generateRosterAction(formData: FormData): Promise<void> {
  const year = Number(requireString(formData, 'year'));
  const month = Number(requireString(formData, 'month'));
  const fleetType = requireString(formData, 'fleetType');
  const confirmed = formData.get('confirm') === 'true';

  const rosterMonth = await getOrCreateRosterMonth(prisma, year, month);
  const existingCount = await countExistingRosterEntries(prisma, rosterMonth.id);

  if (existingCount > 0 && !confirmed) {
    redirect(
      `/roster/${year}/${month}?genConfirm=${encodeURIComponent(fleetType)}&genExisting=${existingCount}`
    );
  }

  const result = await buildMonthlyRosterForFleet(prisma, year, month, fleetType);
  await persistGeneratedRoster(prisma, rosterMonth.id, result);

  const redCount = result.evaluations.filter((e) => e.evaluation.severity === 'RED').length;
  const summary = [
    fleetType,
    result.summary.flightDays,
    result.summary.offDays,
    result.summary.totalBlockMinutes,
    result.summary.pairingsAssigned,
    redCount,
  ].join(':');

  revalidatePath(`/roster/${year}/${month}`);
  redirect(`/roster/${year}/${month}?genSummary=${encodeURIComponent(summary)}`);
}
