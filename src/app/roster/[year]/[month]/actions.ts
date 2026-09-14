'use server';

/**
 * Server Actions backing the manual roster constructor's plain
 * click-to-assign forms (see page.tsx's scope note: no drag-and-drop, no
 * client-side state — every mutation is a full form submit + server-side
 * revalidation, which is enough for this phase).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  assignPairingDuty,
  assignSimpleDuty,
  clearRosterEntry,
} from '@/pairing/db/roster';
import { generatePairingsForMonth } from '@/pairing/db/pairings';
import type { DutyType } from '@/pairing/types';

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
