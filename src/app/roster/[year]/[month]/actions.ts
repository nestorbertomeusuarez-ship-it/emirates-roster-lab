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
import { buildMonthlyRosterForFleet, persistGeneratedRoster } from '@/roster-gen/db/rosterGen';
import type { GenerationStrategy, OffReason } from '@/roster-gen/types';

const GENERATION_STRATEGIES: readonly GenerationStrategy[] = ['MIX', 'MAX_FLYING', 'MAX_DAYS_OFF'];
const DEFAULT_GENERATION_STRATEGY: GenerationStrategy = 'MIX';

/**
 * Fixed order the 5 `OffReason` counts are appended to `genSummary` in
 * (docs/roster-gen-assumptions.md item 25) — `page.tsx`'s `parseGenSummary`
 * must read them back in this exact same order.
 */
const OFF_REASON_KEYS: readonly OffReason[] = [
  'MONTH_PACING',
  'CONSECUTIVE_CAP',
  'WEEKLY_PACING',
  'STREAK_EXTENSION',
  'NO_ELIGIBLE_CANDIDATE',
];

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

/**
 * Reads one optional "target block hours" number input (see page.tsx's
 * generation form, `fieldName` is either `targetBlockHoursMin` or
 * `targetBlockHoursMax`) and converts it to minutes for
 * `buildMonthlyRosterForFleet`/`generateMonthlyRoster`'s soft block-hours
 * target-range bias (docs/roster-gen-assumptions.md item 19). Blank/absent
 * -> `undefined` (unchanged prior behavior for that bound, no bias from it).
 * A present-but-invalid value fails fast rather than silently ignoring what
 * the user typed.
 */
function parseOptionalTargetBlockMinutes(
  formData: FormData,
  fieldName: 'targetBlockHoursMin' | 'targetBlockHoursMax'
): number | undefined {
  const raw = formData.get(fieldName);
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;

  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error(`Invalid "${fieldName}" value: "${raw}"`);
  }
  return Math.round(hours * 60);
}

/**
 * Reads the optional "strategy" form field (see page.tsx's generation
 * form's preset buttons: MIX / MAX_FLYING / MAX_DAYS_OFF, all sharing
 * `name="strategy"` with different `value`s on the same form as the
 * min/max range inputs — see docs/roster-gen-assumptions.md item 20).
 * Blank/absent -> `DEFAULT_GENERATION_STRATEGY` ('MIX'), matching
 * `generateMonthlyRoster`'s own default. A present-but-invalid value fails
 * fast rather than silently falling back.
 */
function parseGenerationStrategy(formData: FormData): GenerationStrategy {
  const raw = formData.get('strategy');
  if (typeof raw !== 'string' || raw.trim().length === 0) return DEFAULT_GENERATION_STRATEGY;
  if (!GENERATION_STRATEGIES.includes(raw as GenerationStrategy)) {
    throw new Error(`Invalid "strategy" value: "${raw}"`);
  }
  return raw as GenerationStrategy;
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
 * Automatic monthly roster generation (Phase 4).
 *
 * Direct user feedback (2026-09-17): "no hay necesidad de confirmar el
 * 'nuevo roster overwrite'" — this used to require an explicit second
 * confirmation click before overwriting a month that already had entries
 * (see docs/roster-gen-assumptions.md item 9, now superseded there). That
 * extra step also made the 3 strategy buttons feel unresponsive: clicking
 * any of them when the month already had entries (which, in practice, it
 * almost always does once you're iterating on a real roster) redirected to
 * a generic "overwrite?" prompt instead of immediately regenerating, which
 * read as the buttons "doing nothing." Generation now always proceeds
 * immediately and replaces the whole month — see
 * `persistGeneratedRoster`'s own doc comment for why a full replace (not a
 * merge) is still the correct semantics once you're past the confirm step.
 */
export async function generateRosterAction(formData: FormData): Promise<void> {
  const year = Number(requireString(formData, 'year'));
  const month = Number(requireString(formData, 'month'));
  const fleetType = requireString(formData, 'fleetType');
  const targetBlockMinutesMin = parseOptionalTargetBlockMinutes(formData, 'targetBlockHoursMin');
  const targetBlockMinutesMax = parseOptionalTargetBlockMinutes(formData, 'targetBlockHoursMax');
  const generationStrategy = parseGenerationStrategy(formData);

  const rosterMonth = await getOrCreateRosterMonth(prisma, year, month);

  const result = await buildMonthlyRosterForFleet(
    prisma,
    year,
    month,
    fleetType,
    targetBlockMinutesMin,
    targetBlockMinutesMax,
    generationStrategy
  );
  await persistGeneratedRoster(prisma, rosterMonth.id, result);

  const redCount = result.evaluations.filter((e) => e.evaluation.severity === 'RED').length;
  // The first 6 fields are the original genSummary format — the 5
  // OffReason counts (docs item 25) are appended at the end, in
  // OFF_REASON_KEYS's fixed order, so an old-format URL still parses its
  // first 6 fields fine even if it predates this item.
  const summary = [
    fleetType,
    result.summary.flightDays,
    result.summary.offDays,
    result.summary.totalBlockMinutes,
    result.summary.pairingsAssigned,
    redCount,
    ...OFF_REASON_KEYS.map((key) => result.summary.offReasonCounts[key]),
  ].join(':');

  revalidatePath(`/roster/${year}/${month}`);
  redirect(`/roster/${year}/${month}?genSummary=${encodeURIComponent(summary)}`);
}
