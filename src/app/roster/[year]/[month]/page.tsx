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
import type { OffReason } from '@/roster-gen/types';
import { getAirportTimeZones } from '@/lib/airportTimeZones';
import { EMIRATES_OPERATOR_CONFIG } from '@/ftl/operatorConfig';
import DayCard from './DayCard';
import CompliancePanel from './CompliancePanel';
import { generateRosterAction } from './actions';
import { buildDayCategoryMap, buildWorstSeverityMap } from './dayPresentation';
import { buildFlightDaySummaryMap } from './flightDaySummary';
import { buildMonthSummary } from './monthSummary';
import { nextMonth, previousMonth, type YearMonth } from './adjacentMonth';
import { hasNoScheduleDataForMonth } from './emptyScheduleData';

const UI_PAIRING_CONSTRAINTS = {
  maxTripDays: 4,
  minLayoverMinutes: 8 * 60,
  maxLayoverMinutes: 48 * 60,
};

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flight rounded';

/** 'HhMM' — no trailing 'm', e.g. "89h30". */
function formatHM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${String(mins).padStart(2, '0')}`;
}

function monthTitle(ym: YearMonth): string {
  return new Date(Date.UTC(ym.year, ym.month - 1, 1)).toLocaleString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  });
}

function monthShortName(ym: YearMonth): string {
  return new Date(Date.UTC(ym.year, ym.month - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });
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
  /** docs/roster-gen-assumptions.md item 25 — see actions.ts's OFF_REASON_KEYS for the fixed field order this is parsed back in. */
  offReasonCounts: Record<OffReason, number>;
}

// Must match actions.ts's OFF_REASON_KEYS exactly (same order, same set) —
// the 5 trailing genSummary fields are parsed back positionally.
const OFF_REASON_KEYS: readonly OffReason[] = [
  'MONTH_PACING',
  'CONSECUTIVE_CAP',
  'WEEKLY_PACING',
  'STREAK_EXTENSION',
  'NO_ELIGIBLE_CANDIDATE',
];

const OFF_REASON_LABELS: Record<OffReason, string> = {
  MONTH_PACING: 'month pacing',
  CONSECUTIVE_CAP: 'consecutive-duty cap',
  WEEKLY_PACING: 'weekly pacing',
  STREAK_EXTENSION: 'streak extension',
  NO_ELIGIBLE_CANDIDATE: 'no eligible candidate',
};

/** Skips zero counts — e.g. "3 weekly pacing, 2 month pacing, 1 no eligible candidate". */
function formatOffReasonCounts(counts: Record<OffReason, number>): string {
  return OFF_REASON_KEYS.filter((key) => counts[key] > 0)
    .map((key) => `${counts[key]} ${OFF_REASON_LABELS[key]}`)
    .join(', ');
}

function parseGenSummary(raw: string | undefined): GenerationSummary | null {
  if (!raw) return null;
  const fields = raw.split(':');
  const [fleetType, flightDays, offDays, totalBlockMinutes, pairingsAssigned, redCount] = fields;
  if (!fleetType) return null;

  // The 5 OffReason counts (docs item 25) are optional trailing fields —
  // defensively defaulted to 0 so an old-format URL (from before this item)
  // still parses its first 6 fields fine instead of breaking.
  const offReasonCounts = OFF_REASON_KEYS.reduce<Record<OffReason, number>>(
    (acc, key, i) => {
      acc[key] = Number(fields[6 + i]) || 0;
      return acc;
    },
    {} as Record<OffReason, number>
  );

  return {
    fleetType,
    flightDays: Number(flightDays),
    offDays: Number(offDays),
    totalBlockMinutes: Number(totalBlockMinutes),
    pairingsAssigned: Number(pairingsAssigned),
    redCount: Number(redCount),
    offReasonCounts,
  };
}

export default async function RosterMonthPage({ params, searchParams }: RosterMonthPageProps) {
  const { year: yearParam, month: monthParam } = await params;
  const sp = await searchParams;
  const year = Number(yearParam);
  const month = Number(monthParam);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return (
      <main className="p-6 max-w-xl mx-auto bg-paper text-ink">
        <p className="text-red">
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
    <main className="w-full max-w-6xl mx-auto px-4 md:px-8 py-8 bg-paper text-ink">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[28px] md:text-[32px] font-semibold text-ink">
              {monthTitle({ year, month })} {year}
            </h1>
            <nav className="flex items-center gap-3 text-xs text-muted mt-1">
              <Link
                href={`/roster/${prev.year}/${prev.month}`}
                aria-label="Previous month"
                className={`hover:text-ink ${focusRing}`}
              >
                ‹ {monthShortName(prev)}
              </Link>
              <Link
                href={`/roster/${next.year}/${next.month}`}
                aria-label="Next month"
                className={`hover:text-ink ${focusRing}`}
              >
                {monthShortName(next)} ›
              </Link>
              <Link href="/roster" className={`hover:text-ink ${focusRing}`}>
                All months
              </Link>
            </nav>
          </div>

          {/* Direct user feedback (2026-09-17): whole-month totals at a
              glance — see monthSummary.ts. */}
          <div className="flex items-start gap-5">
            <div className="text-right">
              <div className="font-display text-lg font-semibold text-ink tabular-nums">
                {formatHM(monthSummary.totalBlockMinutes)}
              </div>
              <div className="text-muted text-xs mt-0.5">Block</div>
            </div>
            <div className="text-right">
              <div className="font-display text-lg font-semibold text-ink tabular-nums">
                {formatHM(monthSummary.totalDutyMinutes)}
              </div>
              <div className="text-muted text-xs mt-0.5">Duty</div>
            </div>
            <div className="text-right">
              <div className="font-display text-lg font-semibold text-ink tabular-nums">
                {monthSummary.dxbDaysOff}
              </div>
              <div className="text-muted text-xs mt-0.5">Days off at DXB</div>
            </div>
          </div>
        </div>
      </header>

      {/* Moved above the calendar (direct user feedback, 2026-09-17):
          generation is the primary "build my month" action, not a footnote
          below the compliance panel. */}
      <section className="bg-surface border border-rule rounded-lg p-3 mb-6 text-xs">
        <h2 className="font-display text-sm font-semibold mb-2 text-ink">
          Automatic roster generation
        </h2>
        <p className="text-muted mb-3">
          Builds a legal FLIGHT/OFF month for one fleet. You can still change any day afterwards.
        </p>

        {genSummary && (
          <div
            className={`bg-paper border-l-[3px] rounded px-3 py-2 mb-3 ${
              genSummary.redCount > 0 ? 'border-red' : 'border-ok'
            }`}
          >
            <div className="text-ink">
              {genSummary.fleetType} roster generated: {genSummary.flightDays} flight day
              {genSummary.flightDays === 1 ? '' : 's'}, {genSummary.offDays} day
              {genSummary.offDays === 1 ? '' : 's'} off,{' '}
              {(genSummary.totalBlockMinutes / 60).toFixed(1)}h block across{' '}
              {genSummary.pairingsAssigned} pairing{genSummary.pairingsAssigned === 1 ? '' : 's'}.
            </div>
            <div className={genSummary.redCount > 0 ? 'text-red' : 'text-muted'}>
              {genSummary.redCount > 0
                ? `${genSummary.redCount} compliance flag${
                    genSummary.redCount === 1 ? '' : 's'
                  } — this indicates a generator bug, review before flying this.`
                : 'No compliance flags from the check.'}
            </div>
            {genSummary.offDays > 0 && (
              <div className="text-muted mt-1">
                Off days: {formatOffReasonCounts(genSummary.offReasonCounts)}
              </div>
            )}
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
          <label className="flex items-center gap-1.5 text-ink">
            Fleet
            <select
              name="fleetType"
              className={`rounded border border-rule bg-surface px-1.5 py-1 ${focusRing}`}
              defaultValue="A350"
            >
              <option value="A350">A350</option>
              <option value="A380">A380</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-ink">
            Block hours
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
              // settings infrastructure) — defaulting to a range here means
              // every future generate keeps this target range unless
              // explicitly cleared. Refined the same day (still direct user
              // feedback) from a single open floor (defaultValue 85) to an
              // explicit min/max range after the floor overshot to 106h40m
              // in one real run, then again to a HARD max + selectable
              // haul-mix/flying/days-off strategy after a further overshoot
              // to 102h20m (docs item 20). Lowered from 80 to 70 once the
              // min became an ENFORCED floor (docs item 23) and real
              // generation runs were landing at 67-79h — 70 is reachable
              // most months without starving legality/pacing to chase it.
              defaultValue={70}
              placeholder="e.g. 70"
              className={`w-14 rounded border border-rule bg-surface px-1.5 py-1 tabular-nums ${focusRing}`}
            />
            <span className="text-muted">to</span>
            <input
              type="number"
              name="targetBlockHoursMax"
              min="0"
              step="1"
              defaultValue={90}
              placeholder="e.g. 90"
              className={`w-14 rounded border border-rule bg-surface px-1.5 py-1 tabular-nums ${focusRing}`}
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
            className={`rounded border border-rule px-2.5 py-1 text-ink hover:bg-flight-soft ${focusRing}`}
          >
            Max flying
          </button>
          <button
            type="submit"
            name="strategy"
            value="MAX_DAYS_OFF"
            className={`rounded border border-rule px-2.5 py-1 text-ink hover:bg-flight-soft ${focusRing}`}
          >
            Max days off
          </button>
          <button
            type="submit"
            name="strategy"
            value="MIX"
            className={`rounded bg-flight px-2.5 py-1 text-white hover:opacity-90 ${focusRing}`}
          >
            Generate roster
          </button>
        </form>
      </section>

      {hasNoScheduleData && (
        <div className="bg-surface border-l-[3px] border-amber rounded px-3 py-2 mb-4 text-sm text-ink">
          No flight schedule for {year}-{String(month).padStart(2, '0')} — nothing to generate
          pairings from or check for compliance here yet.
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
      <div className="hidden md:grid md:grid-cols-7 mb-1">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="text-xs font-medium text-muted text-center py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:grid md:grid-cols-7 md:gap-px md:rounded-lg md:border md:border-rule md:bg-rule md:overflow-hidden mb-2">
        {Array.from({ length: firstWeekdayIndex }).map((_, i) => (
          // Week-alignment padding only means anything in the 7-column
          // desktop grid; the mobile agenda list has no columns to align.
          <div key={`pad-${i}`} className="hidden md:block md:bg-surface" />
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
        {Array.from({ length: (7 - ((firstWeekdayIndex + cells.length) % 7)) % 7 }).map((_, i) => (
          // Trailing padding completes the last week so the grid's rule-colored
          // background never shows through as an empty grey cell.
          <div key={`tail-${i}`} className="hidden md:block md:bg-surface" />
        ))}
      </div>

      <p className="text-muted text-[11px] mb-6">
        {pairings.length} candidate pairing{pairings.length === 1 ? '' : 's'} this month (trips up
        to {UI_PAIRING_CONSTRAINTS.maxTripDays} days,{' '}
        {UI_PAIRING_CONSTRAINTS.minLayoverMinutes / 60}–
        {UI_PAIRING_CONSTRAINTS.maxLayoverMinutes / 60}h layovers).
      </p>

      <CompliancePanel evaluations={complianceEvaluations} />
    </main>
  );
}
