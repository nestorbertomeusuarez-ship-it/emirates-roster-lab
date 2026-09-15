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

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  buildRosterGrid,
  getOrCreateRosterMonth,
  listRosterEntries,
} from '@/pairing/db/roster';
import { generatePairingsForMonth } from '@/pairing/db/pairings';
import { countFlightInstancesForMonth } from '@/pairing/db/flightInstances';
import type { GeneratedPairing } from '@/pairing/types';
import { loadRosterGenDaysForMonth } from '@/roster-gen/db/loadRosterGenDays';
import { evaluateRosterDays } from '@/roster-gen/generateMonthlyRoster';
import { getAirportTimeZones } from '@/lib/airportTimeZones';
import { EMIRATES_OPERATOR_CONFIG } from '@/ftl/operatorConfig';
import DayCard from './DayCard';
import CompliancePanel from './CompliancePanel';
import { generateRosterAction } from './actions';
import { buildDayCategoryMap, buildWorstSeverityMap } from './dayPresentation';
import { nextMonth, previousMonth } from './adjacentMonth';
import { hasNoScheduleDataForMonth } from './emptyScheduleData';

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
  // This app has exactly one user — see src/ftl/operatorConfig.ts for why a
  // hardcoded constant (not a settings UI) is the correct wiring here.
  const complianceEvaluations = evaluateRosterDays(
    rosterGenDays,
    airportTimeZones,
    EMIRATES_OPERATOR_CONFIG
  );

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

  // Phase 5 UX audit item 3 — distinguishes "nothing was ever seeded for
  // this month" from "seeded but nothing assigned yet" (the latter is
  // already handled by CompliancePanel's own empty state). Counted AFTER
  // generatePairingsForMonth above, which has already called
  // ensureFlightInstancesForMonth and so materialized every FlightInstance
  // this month's seed data actually covers — see emptyScheduleData.ts and
  // flightInstances.ts#countFlightInstancesForMonth.
  const flightInstanceCount = await countFlightInstancesForMonth(prisma, year, month);
  const hasNoScheduleData = hasNoScheduleDataForMonth(flightInstanceCount, pairings.length);

  // Pad the grid to whole weeks (Mon-start) so it renders as a real
  // calendar, not just a flat list of day cells.
  const firstDayIso = cells[0]?.date ?? `${year}-${String(month).padStart(2, '0')}-01`;
  const firstWeekdayIndex = (new Date(`${firstDayIso}T00:00:00.000Z`).getUTCDay() + 6) % 7; // Mon=0

  // Prev/next month navigation — pure year/month arithmetic, see
  // adjacentMonth.ts (unit-tested there for the year-rollover cases).
  const prev = previousMonth({ year, month });
  const next = nextMonth({ year, month });

  // Today highlighting — see docs/roster-gen-assumptions.md item 16.
  // Reuses this codebase's established UTC-day convention (see
  // docs/pairing-assumptions.md item 2) rather than introducing a new one:
  // "today" is today's UTC calendar date, and a day cell is only ever
  // marked "today" when the requested /roster/[year]/[month] is the real
  // current UTC year/month.
  const nowUTC = new Date();
  const todayIso = `${nowUTC.getUTCFullYear()}-${String(nowUTC.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(nowUTC.getUTCDate()).padStart(2, '0')}`;
  const isCurrentMonth = nowUTC.getUTCFullYear() === year && nowUTC.getUTCMonth() + 1 === month;

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h1 className="text-xl font-semibold">
          Roster — {year}-{String(month).padStart(2, '0')}
        </h1>
        <nav className="flex items-center gap-3 text-xs">
          <Link href={`/roster/${prev.year}/${prev.month}`} className="underline">
            ← Prev
          </Link>
          <Link href={`/roster/${next.year}/${next.month}`} className="underline">
            Next →
          </Link>
          <Link href="/roster" className="underline text-zinc-400">
            ← All months
          </Link>
        </nav>
      </div>
      <p className="text-xs text-zinc-400 mb-6">
        {pairings.length} candidate pairing{pairings.length === 1 ? '' : 's'} generated
        for this month (max {UI_PAIRING_CONSTRAINTS.maxTripDays} trip days,{' '}
        {UI_PAIRING_CONSTRAINTS.minLayoverMinutes / 60}-{UI_PAIRING_CONSTRAINTS.maxLayoverMinutes / 60}h
        layover window, same-fleet-type-per-pairing assumption — see
        docs/pairing-assumptions.md).
      </p>

      {hasNoScheduleData && (
        <div className="rounded border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-100 px-3 py-2 mb-4 text-sm">
          No flight schedule data exists for this month &mdash; the seeded schedule does not
          cover {year}-{String(month).padStart(2, '0')}. There is nothing to generate pairings
          from or evaluate for compliance here; this is different from a covered month with
          nothing assigned yet.
        </div>
      )}

      {/*
        Responsive layout: below `md` there is no room for 7 fixed-width
        columns (each holding a multi-row DayCard) — that renders but is
        genuinely unusable at phone width, not just unpolished. Below `md`
        the grid collapses to a single-column stacked "agenda" list (each
        DayCard shows its own date/weekday inline, see DayCard.tsx), so the
        weekday header row — which only makes sense as column labels — is
        hidden entirely below `md`.
      */}
      <div className="hidden md:grid md:grid-cols-7 gap-2 mb-2">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="text-xs font-medium text-zinc-500 text-center">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-2 mb-6">
        {Array.from({ length: firstWeekdayIndex }).map((_, i) => (
          // Week-alignment padding only means anything in the 7-column
          // desktop grid; the mobile agenda list has no columns to align.
          <div key={`pad-${i}`} className="hidden md:block" />
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
            isToday={isCurrentMonth && cell.date === todayIso}
          />
        ))}
      </div>

      <CompliancePanel evaluations={complianceEvaluations} />

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
    </main>
  );
}
