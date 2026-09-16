import Link from 'next/link';
import type { RosterEntry } from '@prisma/client';
import type { DutyType, GeneratedPairing } from '@/pairing/types';
import { DUTY_TYPES } from '@/pairing/types';
import type { Severity } from '@/ftl/types';
import type { CalendarBadgeCategory, DayCategory } from './dayPresentation';
import { resolveCalendarBadgeCategory } from './dayPresentation';
import type { FlightDaySummary } from './flightDaySummary';
import {
  assignPairingDutyAction,
  assignSimpleDutyAction,
  clearDutyAction,
} from './actions';

interface DayCardProps {
  rosterMonthId: string;
  year: number;
  month: number;
  date: string; // 'YYYY-MM-DD'
  entry: RosterEntry | null;
  isPairingContinuation: boolean;
  dayOfPairing: number | null;
  candidates: GeneratedPairing[];
  /**
   * Phase 5 Slice 3 — this day's category (FLIGHT / DXB_OFF / LAYOVER), null
   * only when the caller has no roster-gen day for this date at all (should
   * not happen for a real month, but kept optional defensively).
   */
  category: DayCategory | null;
  /**
   * Phase 5 Slice 3 (part A) — this day's worst GCAA compliance severity,
   * null when `evaluateRosterDays` produced no evaluation for this date
   * (normal for LAYOVER/DXB_OFF days — see dayPresentation.ts). When set,
   * rendered as a `#YYYY-MM-DD` anchor link down to this date's detail in
   * `CompliancePanel` (see that component's `id={day.date}` on each day's
   * group) — the calendar renders above the panel, so this is a real
   * jump-to-detail link.
   */
  severity: Severity | null;
  /**
   * Direct user feedback (2026-09-16): compact per-day route/block/duty for
   * a FLIGHT-category day (or the crew's current outstation for a
   * LAYOVER-category day within an active pairing), computed by
   * `flightDaySummary.ts` from data `page.tsx` already loads — see that
   * module's doc comment. Null for a DXB_OFF day or a day with no FLIGHT
   * assignment at all.
   */
  flightSummary: FlightDaySummary | null;
  /**
   * Whether this cell is today's real-world date, pre-computed by the page
   * (UTC-day convention, see docs/roster-gen-assumptions.md item 16) —
   * kept out of this component so it stays a dumb presentational piece,
   * matching every other prop here.
   */
  isToday: boolean;
}

const CATEGORY_BADGES: Record<CalendarBadgeCategory, { label: string; icon: string; className: string }> = {
  FLIGHT: {
    label: 'Flight',
    icon: '✈',
    className: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  },
  LAYOVER: {
    label: 'Layover',
    icon: '\u{1F319}',
    className: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  },
  DXB_OFF: {
    label: 'Off · DXB',
    icon: '\u{1F3E0}',
    className: 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
  },
  // Real duty types that classifyDayCategory collapses to DXB_OFF for
  // evaluation purposes (item 11) — resolveCalendarBadgeCategory widens
  // them back out for the calendar badge so they don't misread as a real
  // day off (see dayPresentation.ts's doc comment).
  STANDBY: {
    label: 'Standby',
    icon: '\u{1F4DE}',
    className: 'bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100',
  },
  SIM: {
    label: 'Sim',
    icon: '\u{1F5A5}',
    className: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100',
  },
  GROUND_SCHOOL: {
    label: 'Ground school',
    icon: '\u{1F4DA}',
    className: 'bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100',
  },
  VACATION: {
    label: 'Vacation',
    icon: '\u{1F334}',
    className: 'bg-lime-100 text-lime-900 dark:bg-lime-900 dark:text-lime-100',
  },
};

const SEVERITY_BADGES: Record<Severity, string> = {
  RED: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  AMBER: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  GREEN: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
};

// Mon-first, matching page.tsx's WEEKDAY_HEADERS order and its established
// UTC-day convention (see page.tsx's `firstWeekdayIndex`/today-highlighting
// comments and docs/pairing-assumptions.md item 2). Only rendered below
// `md`, where the column header row (which normally carries this label) is
// hidden — see page.tsx's responsive grid.
const MOBILE_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekdayLabelFor(date: string): string {
  const utcDay = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return MOBILE_WEEKDAY_LABELS[(utcDay + 6) % 7];
}

// Same 'HhMMm' format `PairingTimeline.tsx#formatMinutes` already uses for
// block/duty times — kept consistent rather than inventing a third format
// (see this project's dutyTimes.ts / CompliancePanel.tsx conventions).
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${String(mins).padStart(2, '0')}m`;
}

/**
 * Compact one-line flight/layover summary rendered directly under a FLIGHT-
 * category day's existing "FLIGHT (2d)" label/link — not replacing it (see
 * flightDaySummary.ts's doc comment). Deliberately terse: this project just
 * went through a decluttering pass to reduce card density (see the
 * `<details>` disclosure below), so this is a quick at-a-glance addition,
 * not a repeat of the full pairing-detail timeline.
 */
function FlightSummaryLine({ summary }: { summary: FlightDaySummary }) {
  if (summary.category === 'LAYOVER') {
    return (
      <div className="text-zinc-500 dark:text-zinc-400 text-xs md:text-[10px]">
        at {summary.atIata} &middot; {formatMinutes(summary.layoverMinutes)} layover
      </div>
    );
  }
  return (
    <div className="text-zinc-500 dark:text-zinc-400 text-xs md:text-[10px]">
      {summary.route} &middot; {formatMinutes(summary.blockMinutes)} blk &middot;{' '}
      {formatMinutes(summary.dutyMinutes)} duty
    </div>
  );
}

function summarizePairing(pairing: GeneratedPairing): string {
  const route = pairing.legs.map((leg) => leg.instance.depIata).concat(
    pairing.legs[pairing.legs.length - 1].instance.arrIata
  );
  const layoverNote =
    pairing.legs.length > 1
      ? ` (layover ${Math.round(
          (pairing.legs[1].layoverMinutesBeforeThisLeg ?? 0) / 60
        )}h${(pairing.legs[1].layoverMinutesBeforeThisLeg ?? 0) % 60}m)`
      : '';
  return `${pairing.fleetType} ${route.join('→')}${layoverNote} — ${pairing.tripDays}d`;
}

/**
 * One calendar-day cell in the roster grid. Plain click-to-assign forms —
 * no drag-and-drop (see page.tsx's scope note).
 */
export default function DayCard({
  rosterMonthId,
  year,
  month,
  date,
  entry,
  isPairingContinuation,
  dayOfPairing,
  candidates,
  category,
  severity,
  flightSummary,
  isToday,
}: DayCardProps) {
  const dayNumber = Number(date.slice(8, 10));
  // Only show the category chip when a day actually carries a real
  // assignment (an entry, or a continuation day of one) — an unassigned day
  // has nothing decided yet and stays as plain "unassigned" text below,
  // rather than presenting as a confirmed DXB day off (see
  // docs/roster-gen-assumptions.md item 12).
  const resolvedCategory =
    category && (entry || isPairingContinuation)
      ? // `RosterEntry.dutyType` is a Prisma `String` column (SQLite has no
        // native enum support — see prisma/schema.prisma's documented
        // deviation), constrained to `DutyType` at the application layer.
        resolveCalendarBadgeCategory(category, entry?.dutyType as DutyType | undefined)
      : null;
  const categoryBadge = resolvedCategory ? CATEGORY_BADGES[resolvedCategory] : null;

  // Phase 5 Slice 4 — deep-link a FLIGHT-category day (an actual flying leg
  // operates this exact date, per dayPresentation.ts#classifyDayCategory)
  // to its pairing's full leg-by-leg timeline. Both the pairing's start day
  // and any later continuation day within the same pairing can be
  // FLIGHT-category (a multi-leg pairing may fly on more than one of its
  // days) — `entry` is the same RosterEntry row (and so the same
  // `pairingId`) in both cases, since only the start day gets its own row
  // (see prisma/schema.prisma's RosterEntry doc comment).
  const pairingHref =
    category === 'FLIGHT' && entry?.dutyType === 'FLIGHT' && entry.pairingId
      ? `/roster/${year}/${month}/pairing/${entry.pairingId}`
      : null;

  // Declutter (Phase 5 UI slice, 2026-09-15): the duty-type form, the
  // pairing-reassignment form, and the "clear" link (the last only relevant
  // once `entry` exists) used to render unconditionally for every
  // non-continuation day. On an already-assigned day that's up to 3 extra
  // stacked rows on top of the badges/entry label already shown, so this
  // same JSX is now shown directly for an unassigned day (assigning IS the
  // primary action there) but hidden behind a disclosure for an
  // already-assigned day (reassignment is secondary) — see below.
  const reassignmentForms = (
    <>
      <form action={assignSimpleDutyAction} className="flex gap-1">
        <input type="hidden" name="rosterMonthId" value={rosterMonthId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />
        <select
          name="dutyType"
          className="border rounded flex-1 min-w-0"
          defaultValue="OFF"
          aria-label={`Duty type for ${date}`}
        >
          {DUTY_TYPES.filter((d) => d !== 'FLIGHT').map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button type="submit" className="border rounded px-1" aria-label={`Set duty type for ${date}`}>
          Set
        </button>
      </form>

      {candidates.length > 0 && (
        <form action={assignPairingDutyAction} className="flex gap-1">
          <input type="hidden" name="rosterMonthId" value={rosterMonthId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <select
            name="pairingIndex"
            className="border rounded flex-1 min-w-0"
            aria-label={`Pairing candidate for ${date}`}
          >
            {candidates.map((pairing, index) => (
              <option key={index} value={index}>
                {summarizePairing(pairing)}
              </option>
            ))}
          </select>
          <button type="submit" className="border rounded px-1" aria-label={`Assign pairing for ${date}`}>
            Fly
          </button>
        </form>
      )}

      {entry && (
        <form action={clearDutyAction}>
          <input type="hidden" name="rosterMonthId" value={rosterMonthId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <button
            type="submit"
            className="text-zinc-400 underline"
            aria-label={`Clear duty for ${date}`}
          >
            clear
          </button>
        </form>
      )}
    </>
  );

  return (
    <div
      className={`border rounded p-3 md:p-2 md:min-h-[9rem] flex flex-col gap-1.5 md:gap-1 text-sm md:text-xs ${
        isToday ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
      }`}
    >
      <div className="font-semibold text-base md:text-sm flex items-center gap-1.5 md:gap-1">
        {dayNumber}
        <span className="md:hidden font-normal text-xs text-zinc-500 dark:text-zinc-400">
          {weekdayLabelFor(date)}
        </span>
        {isToday && (
          <span
            className="rounded px-1 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100"
            title="Today"
          >
            Today
          </span>
        )}
      </div>

      {(categoryBadge || severity) && (
        <div className="flex flex-wrap gap-1">
          {categoryBadge && (
            <span
              className={`rounded px-1 py-0.5 inline-flex items-center gap-0.5 ${categoryBadge.className}`}
              title={`Day category: ${categoryBadge.label}`}
            >
              <span aria-hidden="true">{categoryBadge.icon}</span>
              {categoryBadge.label}
            </span>
          )}
          {severity && (
            <Link
              href={`#${date}`}
              className={`rounded px-1 py-0.5 font-semibold ${SEVERITY_BADGES[severity]}`}
              title={`Worst GCAA compliance severity: ${severity} — jump to detail`}
              aria-label={`Worst GCAA compliance severity ${severity} for ${date} — jump to compliance detail`}
            >
              {severity}
            </Link>
          )}
        </div>
      )}

      {isPairingContinuation ? (
        <>
          {pairingHref ? (
            <Link
              href={pairingHref}
              className="rounded bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100 px-1 py-0.5 block underline"
            >
              Pairing cont&apos;d (day {dayOfPairing})
            </Link>
          ) : (
            <div className="rounded bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100 px-1 py-0.5">
              Pairing cont&apos;d (day {dayOfPairing})
            </div>
          )}
          {flightSummary && <FlightSummaryLine summary={flightSummary} />}
        </>
      ) : entry ? (
        <>
          {pairingHref ? (
            <Link
              href={pairingHref}
              className="rounded bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 px-1 py-0.5 block underline"
            >
              {entry.dutyType}
              {entry.dutyType === 'FLIGHT' && entry.spansDays
                ? ` (${entry.spansDays}d)`
                : ''}
            </Link>
          ) : (
            <div className="rounded bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 px-1 py-0.5">
              {entry.dutyType}
              {entry.dutyType === 'FLIGHT' && entry.spansDays
                ? ` (${entry.spansDays}d)`
                : ''}
            </div>
          )}
          {flightSummary && <FlightSummaryLine summary={flightSummary} />}
        </>
      ) : (
        <div className="text-zinc-400">unassigned</div>
      )}

      {!isPairingContinuation &&
        (entry ? (
          // `<details>` needs no client JS and keeps this component's
          // established "no client-side state" scope (see this file's top
          // comment) — a `'use client'` + `useState` toggle was considered
          // and rejected as a bigger architectural change than this slice
          // calls for, since the native element already does the job.
          <details className="mt-0.5">
            <summary
              className="cursor-pointer select-none text-zinc-500 dark:text-zinc-400 underline text-xs md:text-[10px]"
              aria-label={`Change duty for ${date}`}
            >
              change
            </summary>
            <div className="flex flex-col gap-1.5 md:gap-1 mt-1">{reassignmentForms}</div>
          </details>
        ) : (
          <div className="flex flex-col gap-1.5 md:gap-1">{reassignmentForms}</div>
        ))}
    </div>
  );
}
