/**
 * Local-night window math, needed by the days-off/recovery-rest rules
 * (`src/ftl/rules/daysOff.ts`) — how many DISTINCT local nights a rest
 * period fully covers, at a given station's timezone.
 *
 * SOURCE NOTE: the local-night window itself (22:00-06:00) is NOT sourced
 * from the public GCAA primary text (the primary source PDF was
 * unreachable — gcaa.gov.ae was serving a maintenance page — when this was
 * written; see docs/gcaa-sources.md's own note on this). It is DIRECT
 * PILOT CONFIRMATION (an actual Emirates line pilot, this app's real user,
 * confirming their own operating scheme's definition), the same footing
 * this project already uses for `src/ftl/operatorConfig.ts`'s "confirmed
 * no pairings cap" precedent — a real domain-expert confirmation, not an
 * independently re-verified document citation. Re-verify against the
 * primary source once reachable and upgrade this note if it differs.
 *
 * Pure module: no Prisma, no pairing dependency. `Intl.DateTimeFormat` is a
 * JS runtime built-in, consistent with `src/pairing/dutyTimes.ts`'s own
 * zero-external-dependency use of it for local-time formatting.
 */

/** Local clock hour a "night" is considered to start (22:00). */
export const LOCAL_NIGHT_START_HOUR = 22;
/** Local clock hour a "night" is considered to end (06:00, the following calendar day). */
export const LOCAL_NIGHT_END_HOUR = 6;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The station's UTC offset (in minutes) at the given instant, via
 * `Intl.DateTimeFormat`'s `shortOffset` name. Treated as CONSTANT across
 * whatever window it's used for below — correct for a fixed-offset
 * station (e.g. Asia/Dubai, which never observes daylight saving) and a
 * reasonable approximation elsewhere; a DST transition occurring mid-window
 * is a documented limitation, not silently mishandled (mirrors this
 * project's existing "engineering approximation, surfaced not silent"
 * precedent — see docs/pairing-assumptions.md item 5).
 */
function utcOffsetMinutesAt(instantUTC: Date, ianaTimeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimeZone,
    timeZoneName: 'shortOffset',
  });
  const offsetPart = formatter
    .formatToParts(instantUTC)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = offsetPart?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

/**
 * Counts how many DISTINCT local nights (`LOCAL_NIGHT_START_HOUR` on one
 * local calendar day through `LOCAL_NIGHT_END_HOUR` the next) are FULLY
 * contained within `[windowStartUTC, windowEndUTC)` at `ianaTimeZone` — a
 * night only counts if the rest period covers the whole night, not a
 * partial overlap. Returns 0 for an empty/inverted window.
 */
export function countLocalNightsWithinWindow(
  windowStartUTC: Date,
  windowEndUTC: Date,
  ianaTimeZone: string
): number {
  if (windowEndUTC.getTime() <= windowStartUTC.getTime()) return 0;

  const offsetMs = utcOffsetMinutesAt(windowStartUTC, ianaTimeZone) * 60_000;
  const localStartMs = windowStartUTC.getTime() + offsetMs;
  const localEndMs = windowEndUTC.getTime() + offsetMs;

  // Scan from one local calendar day before the window's own start day, to
  // one day past its end, so a night that starts the day before
  // `localStartMs` (but still ends inside the window) is never missed.
  let localDayCursor = Math.floor(localStartMs / DAY_MS) * DAY_MS - DAY_MS;
  const scanEnd = localEndMs + DAY_MS;

  let count = 0;
  while (localDayCursor < scanEnd) {
    const nightStart = localDayCursor + LOCAL_NIGHT_START_HOUR * HOUR_MS;
    const nightEnd = localDayCursor + DAY_MS + LOCAL_NIGHT_END_HOUR * HOUR_MS;
    if (nightStart >= localStartMs && nightEnd <= localEndMs) {
      count += 1;
    }
    localDayCursor += DAY_MS;
  }
  return count;
}
