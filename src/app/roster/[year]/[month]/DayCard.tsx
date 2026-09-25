import Link from 'next/link';
import type { RosterEntry } from '@prisma/client';
import type { DutyType, GeneratedPairing } from '@/pairing/types';
import { DUTY_TYPES } from '@/pairing/types';
import type { Severity } from '@/ftl/types';
import type { CalendarBadgeCategory, DayCategory } from './dayPresentation';
import { resolveCalendarBadgeCategory } from './dayPresentation';
import type { FlightDaySummary } from './flightDaySummary';
import { cityLabel, routeLabel } from '@/lib/airportCityNames';
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

/** Small colored dot + sentence-case label for a non-flight, non-off duty type. */
const OTHER_DUTY_DOTS: Record<
  'STANDBY' | 'SIM' | 'GROUND_SCHOOL' | 'VACATION',
  { label: string; dotClassName: string }
> = {
  STANDBY: { label: 'Standby', dotClassName: 'bg-amber' },
  SIM: { label: 'Sim', dotClassName: 'bg-flight' },
  GROUND_SCHOOL: { label: 'Ground school', dotClassName: 'bg-ok' },
  VACATION: { label: 'Vacation', dotClassName: 'bg-muted' },
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

/** 'HhMM' — no trailing 'm', matching the header totals ("89h30", "104h30"). */
function formatHM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${String(mins).padStart(2, '0')}`;
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

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-flight';

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
  // Only show a duty label when a day actually carries a real assignment (an
  // entry, or a continuation day of one) — an unassigned day has nothing
  // decided yet and recedes to plain "Off" text below, rather than
  // presenting as a confirmed DXB day off (see
  // docs/roster-gen-assumptions.md item 12).
  const resolvedCategory: CalendarBadgeCategory | null =
    category && (entry || isPairingContinuation)
      ? // `RosterEntry.dutyType` is a Prisma `String` column (SQLite has no
        // native enum support — see prisma/schema.prisma's documented
        // deviation), constrained to `DutyType` at the application layer.
        resolveCalendarBadgeCategory(category, entry?.dutyType as DutyType | undefined)
      : null;

  const otherDutyBadge =
    resolvedCategory && resolvedCategory in OTHER_DUTY_DOTS
      ? OTHER_DUTY_DOTS[resolvedCategory as keyof typeof OTHER_DUTY_DOTS]
      : null;

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

  // A day belongs to a pairing's trip band when it's the pairing's own
  // FLIGHT-dutyType entry (start day) or a continuation day of one.
  const isTripDay = isPairingContinuation || entry?.dutyType === 'FLIGHT';
  const spansDays = entry?.spansDays ?? null;
  const isSingleDayTrip = dayOfPairing === null || spansDays === null || spansDays <= 1;
  const isFirstDayOfTrip = isSingleDayTrip || dayOfPairing === 1;
  const isLastDayOfTrip = isSingleDayTrip || (spansDays !== null && dayOfPairing === spansDays);
  const bandRoundingClass = [
    isFirstDayOfTrip ? 'rounded-l-md' : '',
    isLastDayOfTrip ? 'rounded-r-md' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const bandLabel = (() => {
    if (category === 'FLIGHT' && flightSummary?.category === 'FLIGHT') {
      // Every station gets its city, e.g. "KIX (Osaka)–DXB" on a return leg
      // or "DXB–BOM (Mumbai)–DXB" on a turnaround.
      return routeLabel(flightSummary.route.split('→'));
    }
    if (category === 'LAYOVER' && flightSummary?.category === 'LAYOVER') {
      return `${cityLabel(flightSummary.atIata)} layover`;
    }
    return category === 'FLIGHT' ? 'Flight' : 'Layover';
  })();

  const bandContent = (
    <div
      className={`-mx-3 md:-mx-2 min-h-[26px] flex items-center px-2 text-xs md:text-[11px] font-display font-semibold ${bandRoundingClass} ${
        category === 'FLIGHT' ? 'bg-flight text-white' : 'bg-flight-soft text-ink'
      }`}
    >
      {bandLabel}
    </div>
  );

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
          className={`flex-1 min-w-0 rounded border border-rule bg-surface px-1 py-0.5 text-ink text-xs md:text-[10px] ${focusRing}`}
          defaultValue="OFF"
          aria-label={`Duty type for ${date}`}
        >
          {DUTY_TYPES.filter((d) => d !== 'FLIGHT').map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className={`rounded border border-rule px-1.5 py-0.5 text-xs md:text-[10px] text-ink hover:bg-flight-soft ${focusRing}`}
          aria-label={`Set duty type for ${date}`}
        >
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
            className={`flex-1 min-w-0 rounded border border-rule bg-surface px-1 py-0.5 text-ink text-xs md:text-[10px] ${focusRing}`}
            aria-label={`Pairing candidate for ${date}`}
          >
            {candidates.map((pairing, index) => (
              <option key={index} value={index}>
                {summarizePairing(pairing)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className={`rounded border border-rule px-1.5 py-0.5 text-xs md:text-[10px] text-ink hover:bg-flight-soft ${focusRing}`}
            aria-label={`Assign pairing for ${date}`}
          >
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
            className={`text-muted underline text-xs md:text-[10px] ${focusRing}`}
            aria-label={`Clear duty for ${date}`}
          >
            Clear
          </button>
        </form>
      )}
    </>
  );

  return (
    <div
      className={`group relative flex flex-col gap-1.5 bg-surface border border-rule rounded-lg p-3 text-sm md:rounded-none md:border-0 md:p-2 md:text-xs md:min-h-[8.5rem] ${
        isToday ? 'ring-2 ring-inset ring-flight' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        {isToday ? (
          <span className="inline-flex items-center justify-center rounded-full bg-flight text-white w-6 h-6 font-display text-sm font-semibold">
            {dayNumber}
          </span>
        ) : (
          <span
            className={`font-display font-semibold text-base md:text-[15px] ${
              !isTripDay && !otherDutyBadge ? 'text-muted' : 'text-ink'
            }`}
          >
            {dayNumber}
          </span>
        )}
        <span className="md:hidden font-normal text-xs text-muted">{weekdayLabelFor(date)}</span>
      </div>

      {severity && severity !== 'GREEN' && (
        <Link
          href={`#${date}`}
          className={`absolute top-2 right-2 md:top-1.5 md:right-1.5 inline-flex items-center gap-1 rounded text-[10px] font-medium ${
            severity === 'RED' ? 'text-red' : 'text-amber'
          } ${focusRing}`}
          title={`Worst GCAA compliance severity: ${severity} — jump to detail`}
          aria-label={`Worst GCAA compliance severity ${severity} for ${date} — jump to compliance detail`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              severity === 'RED' ? 'bg-red' : 'bg-amber'
            }`}
            aria-hidden="true"
          />
          {severity === 'RED' ? 'Illegal' : 'Check'}
        </Link>
      )}

      <div className="flex-1 flex flex-col gap-1">
        {isTripDay ? (
          <>
            {pairingHref ? (
              <Link href={pairingHref} className={`block rounded ${focusRing}`}>
                {bandContent}
              </Link>
            ) : (
              bandContent
            )}
            {flightSummary?.category === 'FLIGHT' && (
              <div className="flex flex-col gap-0.5 text-muted tabular-nums">
                <span>Report {flightSummary.reportLocalTime}</span>
                <span>
                  {formatHM(flightSummary.blockMinutes)} block{' '}
                  <span className="ml-1.5">{formatHM(flightSummary.dutyMinutes)} duty</span>
                </span>
              </div>
            )}
            {flightSummary?.category === 'LAYOVER' && (
              <div className="text-muted tabular-nums">
                {formatHM(flightSummary.layoverMinutes)} on the ground
              </div>
            )}
          </>
        ) : otherDutyBadge ? (
          <div className="flex items-center gap-1.5 text-muted">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${otherDutyBadge.dotClassName}`}
              aria-hidden="true"
            />
            {otherDutyBadge.label}
          </div>
        ) : (
          <div className="text-muted">Off</div>
        )}
      </div>

      {!isPairingContinuation &&
        (entry ? (
          // `<details>` needs no client JS and keeps this component's
          // established "no client-side state" scope (see this file's top
          // comment) — a `'use client'` + `useState` toggle was considered
          // and rejected as a bigger architectural change than this slice
          // calls for, since the native element already does the job.
          <details className="mt-auto md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 open:opacity-100">
            <summary
              className="cursor-pointer select-none text-muted text-xs md:text-[10px]"
              aria-label={`Change duty for ${date}`}
            >
              Change
            </summary>
            <div className="flex flex-col gap-1.5 md:gap-1 mt-1">{reassignmentForms}</div>
          </details>
        ) : (
          <div className="flex flex-col gap-1.5 md:gap-1 mt-auto">{reassignmentForms}</div>
        ))}
    </div>
  );
}
