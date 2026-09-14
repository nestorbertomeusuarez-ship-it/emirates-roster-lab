/**
 * Manual roster constructor — Phase 2's UI: a simple 7-column month grid,
 * click-to-assign duty per day.
 *
 * SCOPE DECISION (see docs/pairing-assumptions.md and PLAN.md): this is
 * deliberately NOT a polished drag-and-drop calendar. That visual/UX
 * investment belongs to Phase 5 per the project's own phase split (see
 * PLAN.md's Phase 5 entry). Every interaction here is a plain HTML
 * `<select>` + submit-button form bound to a Server Action
 * (src/app/roster/[year]/[month]/actions.ts) — no client-side state, no
 * drag-and-drop library. This satisfies "manual constructor" for Phase 2:
 * the user can see every day of the month and assign a duty to it.
 */

import { prisma } from '@/lib/prisma';
import {
  buildRosterGrid,
  getOrCreateRosterMonth,
  listRosterEntries,
} from '@/pairing/db/roster';
import { generatePairingsForMonth } from '@/pairing/db/pairings';
import type { GeneratedPairing } from '@/pairing/types';
import DayCard from './DayCard';

const UI_PAIRING_CONSTRAINTS = {
  maxTripDays: 4,
  minLayoverMinutes: 8 * 60,
  maxLayoverMinutes: 48 * 60,
};

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface RosterMonthPageProps {
  params: Promise<{ year: string; month: string }>;
}

export default async function RosterMonthPage({ params }: RosterMonthPageProps) {
  const { year: yearParam, month: monthParam } = await params;
  const year = Number(yearParam);
  const month = Number(monthParam);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <p className="text-red-600">
          Invalid roster URL — expected /roster/&lt;year&gt;/&lt;month 1-12&gt;.
        </p>
      </main>
    );
  }

  const rosterMonth = await getOrCreateRosterMonth(prisma, year, month);
  const entries = await listRosterEntries(prisma, rosterMonth.id);
  const cells = buildRosterGrid(year, month, entries);

  const pairings = await generatePairingsForMonth(prisma, year, month, UI_PAIRING_CONSTRAINTS);
  const candidatesByStartDate = new Map<string, GeneratedPairing[]>();
  for (const pairing of pairings) {
    const bucket = candidatesByStartDate.get(pairing.startServiceDate) ?? [];
    bucket.push(pairing);
    candidatesByStartDate.set(pairing.startServiceDate, bucket);
  }

  // Pad the grid to whole weeks (Mon-start) so it renders as a real
  // calendar, not just a flat list of day cells.
  const firstDayIso = cells[0]?.date ?? `${year}-${String(month).padStart(2, '0')}-01`;
  const firstWeekdayIndex = (new Date(`${firstDayIso}T00:00:00.000Z`).getUTCDay() + 6) % 7; // Mon=0

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">
        Roster — {year}-{String(month).padStart(2, '0')}
      </h1>
      <p className="text-sm text-zinc-500 mb-1">
        Personal planning tool, not an operational document — does not
        replace the official roster or the operator&apos;s OM-A.
      </p>
      <p className="text-xs text-zinc-400 mb-6">
        {pairings.length} candidate pairing{pairings.length === 1 ? '' : 's'} generated
        for this month (max {UI_PAIRING_CONSTRAINTS.maxTripDays} trip days,{' '}
        {UI_PAIRING_CONSTRAINTS.minLayoverMinutes / 60}-{UI_PAIRING_CONSTRAINTS.maxLayoverMinutes / 60}h
        layover window, same-fleet-type-per-pairing assumption — see
        docs/pairing-assumptions.md).
      </p>

      <div className="grid grid-cols-7 gap-2 mb-2">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="text-xs font-medium text-zinc-500 text-center">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: firstWeekdayIndex }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {cells.map((cell) => (
          <DayCard
            key={cell.date}
            rosterMonthId={rosterMonth.id}
            year={year}
            month={month}
            date={cell.date}
            entry={cell.entry}
            isPairingContinuation={cell.isPairingContinuation}
            dayOfPairing={cell.dayOfPairing}
            candidates={candidatesByStartDate.get(cell.date) ?? []}
          />
        ))}
      </div>
    </main>
  );
}
