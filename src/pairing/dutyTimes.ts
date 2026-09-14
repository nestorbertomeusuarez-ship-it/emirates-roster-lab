/**
 * Report time, block time, duty time/FDP, layover, and rest calculations.
 *
 * These are kept as explicit, separate named functions rather than folded
 * together, per PLAN.md's Phase 2 working rule: "Explicit, separate
 * concepts: report time, block time, duty time, FDP, rest, layover — not
 * conflated."
 *
 * Pure module: no Prisma, no I/O. `Intl.DateTimeFormat` (used for
 * UTC-to-station-local time-of-day formatting) is a JS runtime built-in,
 * not an external/DB dependency, so this stays consistent with the
 * zero-dependency discipline of `src/ftl/`.
 */

/**
 * ASSUMPTION, not confirmed data (see docs/pairing-assumptions.md and
 * PLAN.md Phase 2 note): default report time is STD minus 90 minutes. This
 * is a common short/medium-haul industry default, NOT sourced from an
 * actual Emirates roster or OM-A extract. Every value this module returns
 * that depends on it is flagged via `ReportTimeResult.isAssumption` so a
 * caller (and eventually the Phase 5 UI) can render an "ASSUMPTION" badge
 * next to it rather than presenting it as confirmed operational data.
 */
export const DEFAULT_REPORT_OFFSET_MINUTES = 90;

export interface ReportTimeResult {
  reportUTC: Date;
  reportOffsetMinutesUsed: number;
  /** Always true: report time is always derived from an assumed offset in this tool (see DEFAULT_REPORT_OFFSET_MINUTES doc comment). */
  isAssumption: true;
}

/**
 * Computes report time as `stdUTC - reportOffsetMinutes`.
 *
 * @param stdUTC the leg's scheduled departure instant.
 * @param reportOffsetMinutes minutes before STD; defaults to
 *   `DEFAULT_REPORT_OFFSET_MINUTES` (an assumption — see that constant's
 *   doc comment).
 */
export function computeReportTime(
  stdUTC: Date,
  reportOffsetMinutes: number = DEFAULT_REPORT_OFFSET_MINUTES
): ReportTimeResult {
  if (reportOffsetMinutes < 0) {
    throw new Error(
      `computeReportTime: reportOffsetMinutes must be >= 0 (got ${reportOffsetMinutes})`
    );
  }
  return {
    reportUTC: new Date(stdUTC.getTime() - reportOffsetMinutes * 60_000),
    reportOffsetMinutesUsed: reportOffsetMinutes,
    isAssumption: true,
  };
}

/**
 * Formats a UTC instant as a 24h 'HH:MM' local time-of-day string for the
 * given IANA timezone (e.g. 'Asia/Dubai'), using the runtime's built-in
 * `Intl` support — no external timezone-conversion dependency needed.
 * Used to derive the local report time that `src/ftl/rules/fdpTables.ts`'s
 * Table A start-time bands require.
 */
export function formatLocalHHMM(utcInstant: Date, ianaTimeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ianaTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcInstant);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // en-GB with hour12:false can render midnight as '24:00' in some ICU
  // versions; normalize to '00:00' to satisfy fdpTables.ts's 'HH:MM' 24h
  // parser (which only accepts 00-23 for the hour component).
  const normalizedHour = hour === '24' ? '00' : hour;
  return `${normalizedHour}:${minute}`;
}

/** Sums each leg's block time. `legs` need only carry `blockTimeMin`. */
export function totalBlockMinutes(legs: ReadonlyArray<{ blockTimeMin: number }>): number {
  return legs.reduce((sum, leg) => sum + leg.blockTimeMin, 0);
}

/**
 * Duty time / FDP length for a day's flying: from report time to the last
 * sector's on-blocks (arrival).
 *
 * ENGINEERING-APPROXIMATION NOTE (surfaced, not silent — see
 * docs/pairing-assumptions.md): this tool defines FDP end as "on-blocks of
 * the last sector," matching the shape `src/ftl/types.ts`'s
 * `FlightDutyPeriod.actualOrPlannedFdpMinutes` expects to receive. The
 * exact FDP start/end boundary convention (e.g. whether GCAA's own text
 * defines the end instant identically) was NOT independently re-verified
 * against the GCAA source text beyond what Phase 3 already confirmed for
 * the *maximum permitted* values in `src/ftl/rules/fdpTables.ts` — this is
 * this tool's own approximation of how to measure an *actual* duty against
 * that maximum, not itself a re-sourced regulatory definition.
 */
export function computeDutyMinutes(reportUTC: Date, lastOnBlocksUTC: Date): number {
  const minutes = Math.round((lastOnBlocksUTC.getTime() - reportUTC.getTime()) / 60_000);
  if (minutes <= 0) {
    throw new Error(
      `computeDutyMinutes: lastOnBlocksUTC must be after reportUTC (got ${minutes} min)`
    );
  }
  return minutes;
}

/** Ground time at an outstation between one leg's arrival and the next leg's departure, within the same pairing. */
export function layoverMinutes(prevArrUTC: Date, nextDepUTC: Date): number {
  const minutes = Math.round((nextDepUTC.getTime() - prevArrUTC.getTime()) / 60_000);
  if (minutes < 0) {
    throw new Error(
      `layoverMinutes: nextDepUTC must not be before prevArrUTC (got ${minutes} min)`
    );
  }
  return minutes;
}

/** Rest between two separate duties: last on-blocks of one duty to the next duty's report time. */
export function restMinutes(lastOnBlocksUTC: Date, nextReportUTC: Date): number {
  const minutes = Math.round((nextReportUTC.getTime() - lastOnBlocksUTC.getTime()) / 60_000);
  if (minutes < 0) {
    throw new Error(
      `restMinutes: nextReportUTC must not be before lastOnBlocksUTC (got ${minutes} min)`
    );
  }
  return minutes;
}
