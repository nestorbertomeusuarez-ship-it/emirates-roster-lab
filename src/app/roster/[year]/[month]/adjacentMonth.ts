/**
 * Phase 5 UI navigation — pure year/month arithmetic for the "prev/next
 * month" links on the roster month page. Deliberately separated out (per
 * this project's established precedent of unit-testing pure logic rather
 * than the page/component — see `complianceGrouping.ts`'s doc comment) so
 * the December->January and January->December year-rollover cases are
 * covered by a real test, not just eyeballed in JSX.
 */

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

/** Returns the year/month immediately before `{ year, month }`, rolling over the year at January. */
export function previousMonth({ year, month }: YearMonth): YearMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Returns the year/month immediately after `{ year, month }`, rolling over the year at December. */
export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
