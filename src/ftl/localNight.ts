/**
 * Local-night window math, needed by the extended-duty rest rule
 * (`src/ftl/rules/minRest.ts`'s `evaluateLocalNightAfterExtendedDuty`,
 * ORO.FTL.225.G(e)) — whether a rest period includes a "local night" at a
 * given station's timezone.
 *
 * SOURCE NOTE: both the "local night" definition (an 8-hour period falling
 * between 2200 and 0800 local time) and ORO.FTL.225.G(e) itself (a preceding
 * duty >18h requires the ensuing rest to include a local night) are
 * independently verified against the primary GCAA source PDF (CAR-AIR OPS
 * Part-ORO Issue 03), extracted via `pdftotext` once gcaa.gov.ae came back
 * online — see docs/gcaa-sources.md. This SUPERSEDES an earlier
 * implementation of this file that used a fixed 22:00-06:00 window based on
 * direct pilot confirmation given while the primary source was unreachable;
 * that confirmation turned out not to match GCAA's actual published
 * definition (8h *somewhere* within the wider 2200-0800 band, not a fixed
 * 22:00-06:00 slice) — see docs/roster-gen-assumptions.md item 28.
 *
 * Pure module: no Prisma, no pairing dependency. `Intl.DateTimeFormat` is a
 * JS runtime built-in, consistent with `src/pairing/dutyTimes.ts`'s own
 * zero-external-dependency use of it for local-time formatting.
 */

/** Local clock hour the night band starts (22:00). */
export const LOCAL_NIGHT_BAND_START_HOUR = 22;
/** Local clock hour the night band ends (08:00, the following calendar day). */
export const LOCAL_NIGHT_BAND_END_HOUR = 8;
/** Minimum contiguous hours within the band required to count as "a local night". */
export const LOCAL_NIGHT_REQUIRED_HOURS = 8;

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
 * Whether `[restStartUTC, restEndUTC)` includes "a local night" per the
 * real GCAA definition: at least `LOCAL_NIGHT_REQUIRED_HOURS` (8) contiguous
 * hours falling within the `[LOCAL_NIGHT_BAND_START_HOUR, LOCAL_NIGHT_BAND_END_HOUR)`
 * (22:00-08:00) local band on some local calendar day. This is NOT "fully
 * contains the whole 10h band" — any 8h stretch within it satisfies the
 * definition, so it's computed as "does the rest period's overlap with a
 * given band instance reach >=8h" (the overlap of two intervals is itself
 * one contiguous interval, so an >=8h overlap always contains an 8h local
 * night). Returns `false` for an empty/inverted rest period.
 */
export function restPeriodIncludesLocalNight(
  restStartUTC: Date,
  restEndUTC: Date,
  ianaTimeZone: string
): boolean {
  if (restEndUTC.getTime() <= restStartUTC.getTime()) return false;

  const offsetMs = utcOffsetMinutesAt(restStartUTC, ianaTimeZone) * 60_000;
  const localStartMs = restStartUTC.getTime() + offsetMs;
  const localEndMs = restEndUTC.getTime() + offsetMs;
  const requiredMs = LOCAL_NIGHT_REQUIRED_HOURS * HOUR_MS;

  // Scan from one local calendar day before the rest period's own start
  // day, to one day past its end, so a band instance starting the day
  // before `localStartMs` (but still overlapping the rest period) is never
  // missed.
  let localDayCursor = Math.floor(localStartMs / DAY_MS) * DAY_MS - DAY_MS;
  const scanEnd = localEndMs + DAY_MS;

  while (localDayCursor < scanEnd) {
    const bandStart = localDayCursor + LOCAL_NIGHT_BAND_START_HOUR * HOUR_MS;
    const bandEnd = localDayCursor + DAY_MS + LOCAL_NIGHT_BAND_END_HOUR * HOUR_MS;
    const overlapStart = Math.max(bandStart, localStartMs);
    const overlapEnd = Math.min(bandEnd, localEndMs);
    if (overlapEnd - overlapStart >= requiredMs) return true;
    localDayCursor += DAY_MS;
  }
  return false;
}
