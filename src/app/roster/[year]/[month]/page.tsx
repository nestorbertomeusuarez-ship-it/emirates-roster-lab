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
import { buildFlightDaySummaryMap } from './flightDaySummary';
import { buildMonthSummary } from './monthSummary';
import { nextMonth, previousMonth } from './adjacentMonth';
import { hasNoScheduleDataForMonth } from './emptyScheduleData';

const UI_PAIRING_CONSTRAINTS = {
  maxTripDays: 4,
  minLayoverMinutes: 8 * 60,
  maxLayoverMinutes: 48 * 60,
};

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Same 'HhMMm' format DayCard.tsx/PairingTimeline.tsx already use for
// block/duty times — kept consistent rather than inventing a fourth format.
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${String(mins).padStart(2, '0')}m`;
}

interface RosterMonthPageProps {
  params: Promise<{ year: string; month: string }>;
  searchParams: Promise<{
    genSummary?: string;
  }>;
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

  // Direct user feedback (2026-09-16): show the actual pairing/route/block/
  // duty right on the calendar card instead of forcing a click-through to
  // the pairing detail page for a FLIGHT day. Built from the exact same
  // `rosterGenDays` data as the maps above (see flightDaySummary.ts) — no
  // new evaluation, no additional DB query.
  const flightDaySummaryByDate = buildFlightDaySummaryMap(rosterGenDays, airportTimeZones);

  // Direct user feedback (2026-09-17): whole-month totals (block/duty hours,
  // DXB days off) in the header, at a glance — see monthSummary.ts.
  const monthSummary = buildMonthSummary(cells, dayCategoryByDate, flightDaySummaryByDate);

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
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h1 className="text-xl font-semibold">
          Roster — {year}-{String(month).padStart(2, '0')}
        </h1>
        <div className="flex flex-col items-end gap-1">
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
          {/* Direct user feedback (2026-09-17): whole-month totals at a
              glance — see monthSummary.ts. */}
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span title="Total block time this month">
              {formatMinutes(monthSummary.totalBlockMinutes)} blk
            </span>
            <span>&middot;</span>
            <span title="Total duty time this month">
              {formatMinutes(monthSummary.totalDutyMinutes)} duty
            </span>
            <span>&middot;</span>
            <span title="Days off at home base (DXB) this month">
              {monthSummary.dxbDaysOff} DXB off
            </span>
          </div>
        </div>
      </div>

      {/* Moved above the calendar (direct user feedback, 2026-09-17):
          generation is the primary "build my month" action, not a footnote
          below the compliance panel. */}
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

        {/* Direct user feedback (2026-09-17): "no hay necesidad de
            confirmar el 'nuevo roster overwrite'" — removed the
            confirm-before-overwrite step entirely (see actions.ts's own
            doc comment and docs/roster-gen-assumptions.md item 9, now
            superseded). Generation always proceeds immediately. */}
        <form action={generateRosterAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <label className="flex items-center gap-1">
            Fleet:
            <select name="fleetType" className="border rounded" defaultValue="A350">
              <option value="A350">A350</option>
              <option value="A380">A380</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            Target block hours (optional):
            <input
              type="number"
              name="targetBlockHoursMin"
              min="0"
              step="1"
              // Direct user feedback (2026-09-17): "cuando genero nuevo
              // roster vuelve a las 75hrs block" — the field had no
              // persistent memory, so a plain re-generate (without
              // retyping) silently reverted to the unbiased default. This
              // app has exactly one user (see src/ftl/operatorConfig.ts's
              // own precedent for a hardcoded single-user default over
              // settings infrastructure) — defaulting to 80-90 here means
              // every future generate keeps this target range unless
              // explicitly cleared. Refined the same day (still direct user
              // feedback) from a single open floor (defaultValue 85) to an
              // explicit min/max range after the floor overshot to 106h40m
              // in one real run, then again to a HARD max + selectable
              // haul-mix/flying/days-off strategy after a further overshoot
              // to 102h20m — see docs/roster-gen-assumptions.md item 20.
              defaultValue={80}
              placeholder="e.g. 80"
              className="border rounded w-16"
            />
            to
            <input
              type="number"
              name="targetBlockHoursMax"
              min="0"
              step="1"
              defaultValue={90}
              placeholder="e.g. 90"
              className="border rounded w-16"
            />
          </label>
          {/* Direct user feedback (2026-09-17): the goal isn't maximizing
              flying, it's a MIX of short/medium/long-haul plus days off,
              always within the range above — MIX is the default "Generate
              roster" button below; these two presets are optional
              alternatives, per the user's own "couple of buttons" framing
              (see docs/roster-gen-assumptions.md item 20). All three share
              the same min/max range inputs above. */}
          <button
            type="submit"
            name="strategy"
            value="MAX_FLYING"
            className="border rounded px-2 py-0.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Max flying
          </button>
          <button
            type="submit"
            name="strategy"
            value="MAX_DAYS_OFF"
            className="border rounded px-2 py-0.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Max days off
          </button>
          <button
            type="submit"
            name="strategy"
            value="MIX"
            className="border rounded px-2 py-0.5 cursor-pointer bg-black text-white dark:bg-white dark:text-black hover:opacity-80"
          >
            Generate roster
          </button>
        </form>
      </section>

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
            flightSummary={flightDaySummaryByDate.get(cell.date) ?? null}
            isToday={isCurrentMonth && cell.date === todayIso}
          />
        ))}
      </div>

      <CompliancePanel evaluations={complianceEvaluations} />
    </main>
  );
}
