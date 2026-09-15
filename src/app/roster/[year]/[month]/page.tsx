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
import { loadRosterGenDaysForMonth } from '@/roster-gen/db/loadRosterGenDays';
import { evaluateRosterDays } from '@/roster-gen/generateMonthlyRoster';
import { getAirportTimeZones } from '@/lib/airportTimeZones';
import DayCard from './DayCard';
import CompliancePanel from './CompliancePanel';
import { generateRosterAction } from './actions';
import { buildDayCategoryMap, buildWorstSeverityMap } from './dayPresentation';

const UI_PAIRING_CONSTRAINTS = {
  maxTripDays: 4,
  minLayoverMinutes: 8 * 60,
  maxLayoverMinutes: 48 * 60,
};

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface RosterMonthPageProps {
  params: Promise<{ year: string; month: string }>;
  searchParams: Promise<{ genConfirm?: string; genExisting?: string; genSummary?: string }>;
}

interface GenerationSummary {
  fleetType: string;
  flightDays: number;
  offDays: number;
  totalBlockMinutes: number;
  pairingsAssigned: number;
  redCount: number;
}

function parseGenSummary(raw: string | undefined): GenerationSummary | null {
  if (!raw) return null;
  const [fleetType, flightDays, offDays, totalBlockMinutes, pairingsAssigned, redCount] =
    raw.split(':');
  if (!fleetType) return null;
  return {
    fleetType,
    flightDays: Number(flightDays),
    offDays: Number(offDays),
    totalBlockMinutes: Number(totalBlockMinutes),
    pairingsAssigned: Number(pairingsAssigned),
    redCount: Number(redCount),
  };
}

export default async function RosterMonthPage({ params, searchParams }: RosterMonthPageProps) {
  const { year: yearParam, month: monthParam } = await params;
  const sp = await searchParams;
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

  const genSummary = parseGenSummary(sp.genSummary);
  const genConfirmFleet = sp.genConfirm;
  const genExistingCount = sp.genExisting ? Number(sp.genExisting) : 0;

  const rosterMonth = await getOrCreateRosterMonth(prisma, year, month);
  const entries = await listRosterEntries(prisma, rosterMonth.id);
  const cells = buildRosterGrid(year, month, entries);

  // Always-current itemized compliance panel (Phase 5 Slice 2) — reconstructs
  // whatever is actually persisted for this month (manual or generated, via
  // Slice 1's loadRosterGenDaysForMonth) and re-runs the real evaluator on
  // every render, independent of the one-time genSummary banner above.
  const rosterGenDays = await loadRosterGenDaysForMonth(prisma, rosterMonth.id, year, month);
  const airportTimeZones = await getAirportTimeZones(prisma);
  const complianceEvaluations = evaluateRosterDays(rosterGenDays, airportTimeZones);

  // Phase 5 Slice 3 — per-day category (FLIGHT/DXB_OFF/LAYOVER) and
  // worst-severity lookups for the calendar grid, built from the exact same
  // data as the compliance panel above (see dayPresentation.ts) — no new
  // evaluation.
  const dayCategoryByDate = buildDayCategoryMap(rosterGenDays);
  const worstSeverityByDate = buildWorstSeverityMap(complianceEvaluations);

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
      <p className="text-xs text-zinc-400 mb-6">
        {pairings.length} candidate pairing{pairings.length === 1 ? '' : 's'} generated
        for this month (max {UI_PAIRING_CONSTRAINTS.maxTripDays} trip days,{' '}
        {UI_PAIRING_CONSTRAINTS.minLayoverMinutes / 60}-{UI_PAIRING_CONSTRAINTS.maxLayoverMinutes / 60}h
        layover window, same-fleet-type-per-pairing assumption — see
        docs/pairing-assumptions.md).
      </p>

      <section className="border rounded p-3 mb-6 text-xs">
        <h2 className="text-sm font-semibold mb-2">Automatic roster generation</h2>
        <p className="text-zinc-500 mb-2">
          Produces a full, GCAA-baseline-compliant 30-day FLIGHT/OFF assignment for one
          fleet type — see docs/roster-gen-assumptions.md for what this generator does NOT
          model (12-month rolling limits, Emirates FTL Variation/augmented-crew schemes,
          pay/fatigue optimization). You can still adjust individual days manually afterward.
        </p>

        {genSummary && (
          <div
            className={`rounded px-2 py-1 mb-2 ${
              genSummary.redCount > 0
                ? 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100'
                : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
            }`}
          >
            Generated {genSummary.fleetType} roster: {genSummary.flightDays} FLIGHT day
            {genSummary.flightDays === 1 ? '' : 's'}, {genSummary.offDays} OFF day
            {genSummary.offDays === 1 ? '' : 's'},{' '}
            {(genSummary.totalBlockMinutes / 60).toFixed(1)}h total block time across{' '}
            {genSummary.pairingsAssigned} pairing{genSummary.pairingsAssigned === 1 ? '' : 's'}.{' '}
            {genSummary.redCount > 0
              ? `${genSummary.redCount} RED FTL compliance flag(s) — this indicates a bug in the generator, review before relying on this roster.`
              : 'No FTL compliance flags from the post-generation verification pass.'}
          </div>
        )}

        {genConfirmFleet && (
          <form action={generateRosterAction} className="mb-2 flex flex-wrap items-center gap-2">
            <span>
              This month already has {genExistingCount} assigned day
              {genExistingCount === 1 ? '' : 's'}. Generating a {genConfirmFleet} roster will
              overwrite them.
            </span>
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="fleetType" value={genConfirmFleet} />
            <input type="hidden" name="confirm" value="true" />
            <button type="submit" className="border rounded px-2 py-0.5 bg-red-600 text-white">
              Generate anyway (overwrite)
            </button>
          </form>
        )}

        <form action={generateRosterAction} className="flex items-center gap-2">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="confirm" value="false" />
          <label className="flex items-center gap-1">
            Fleet:
            <select name="fleetType" className="border rounded" defaultValue="A350">
              <option value="A350">A350</option>
              <option value="A380">A380</option>
            </select>
          </label>
          <button
            type="submit"
            className="border rounded px-2 py-0.5 bg-black text-white dark:bg-white dark:text-black"
          >
            Generate roster
          </button>
        </form>
      </section>

      <CompliancePanel evaluations={complianceEvaluations} />

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
            category={dayCategoryByDate.get(cell.date) ?? null}
            severity={worstSeverityByDate.get(cell.date) ?? null}
          />
        ))}
      </div>
    </main>
  );
}
