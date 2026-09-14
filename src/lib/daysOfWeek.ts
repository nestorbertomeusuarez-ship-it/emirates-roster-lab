/**
 * Encode/decode helpers for the 7-character "days of week" strings used
 * throughout the schedule (e.g. Flight.daysOfWeek). Each character is '1'
 * (operates) or '0' (does not operate), in Monday..Sunday order, e.g.
 * "1111100" = Monday through Friday.
 */

export const WEEKDAY_LABELS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

export type WeekdayLabel = (typeof WEEKDAY_LABELS)[number];

const DAYS_OF_WEEK_PATTERN = /^[01]{7}$/;

/**
 * Returns true if `s` is a valid 7-character days-of-week string: exactly
 * 7 characters, each either '0' or '1'.
 */
export function isValidDaysOfWeek(s: string): boolean {
  return DAYS_OF_WEEK_PATTERN.test(s);
}

/**
 * Decodes a days-of-week string into an ordered boolean array (index 0 =
 * Monday, index 6 = Sunday). Throws if the input is not valid.
 */
export function daysOfWeekToBooleans(s: string): boolean[] {
  if (!isValidDaysOfWeek(s)) {
    throw new Error(`Invalid daysOfWeek string: "${s}"`);
  }
  return s.split('').map((c) => c === '1');
}

/**
 * Encodes an ordered 7-element boolean array (Monday..Sunday) into a
 * days-of-week string. Throws if the array does not have exactly 7 entries.
 */
export function booleansToDaysOfWeek(days: boolean[]): string {
  if (days.length !== 7) {
    throw new Error(
      `Expected exactly 7 boolean values (Mon..Sun), got ${days.length}`
    );
  }
  return days.map((d) => (d ? '1' : '0')).join('');
}

/**
 * Decodes a days-of-week string into the set of weekday labels on which the
 * flight operates. Throws if the input is not valid.
 */
export function daysOfWeekToLabels(s: string): WeekdayLabel[] {
  const flags = daysOfWeekToBooleans(s);
  return WEEKDAY_LABELS.filter((_, i) => flags[i]);
}

/**
 * Produces a human-readable label for a days-of-week string:
 * - "Daily" when all 7 days are set
 * - "Mon-Fri" when the set is a single contiguous run of 2+ days
 * - a comma-separated list otherwise (e.g. "Mon, Wed, Fri")
 * - "None" when no days are set
 * Throws if the input is not a valid days-of-week string.
 */
export function daysOfWeekToLabel(s: string): string {
  const flags = daysOfWeekToBooleans(s);

  if (flags.every((f) => f)) {
    return 'Daily';
  }

  const activeIndexes = flags
    .map((f, i) => (f ? i : -1))
    .filter((i) => i !== -1);

  if (activeIndexes.length === 0) {
    return 'None';
  }

  const isContiguousRun =
    activeIndexes.length >= 2 &&
    activeIndexes.every(
      (idx, pos) => pos === 0 || idx === activeIndexes[pos - 1] + 1
    );

  if (isContiguousRun) {
    const first = WEEKDAY_LABELS[activeIndexes[0]];
    const last = WEEKDAY_LABELS[activeIndexes[activeIndexes.length - 1]];
    return `${first}-${last}`;
  }

  return activeIndexes.map((i) => WEEKDAY_LABELS[i]).join(', ');
}
