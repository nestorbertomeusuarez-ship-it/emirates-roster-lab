/**
 * Phase 5 UI — pure logic for detecting when a requested month has NO
 * schedule data at all: no `Flight` schedule line was ever seeded to cover
 * this month (see the seed data's `effectiveFrom`/`effectiveTo` in
 * `prisma/seed-data/dxb-seed-schedule.json`), so zero `FlightInstance` rows
 * and zero candidate pairings can ever be produced for it.
 *
 * This is distinct from a month that DOES have schedule data but simply has
 * nothing assigned yet (an empty `pairings`/`RosterEntry` set with a
 * non-zero flight-instance count) — that case is already handled by
 * `CompliancePanel`'s own "nothing assigned yet" empty state and must not be
 * conflated with this one.
 *
 * Deliberately separated out per this project's established precedent of
 * unit-testing pure logic rather than the page/component — see
 * `complianceGrouping.ts`'s doc comment.
 */

/**
 * True only when neither persisted flight instances nor generated candidate
 * pairings exist for the month — i.e. nothing was ever seeded to cover it.
 * Candidate pairings are always derived from flight instances (see
 * `src/pairing/db/pairings.ts#generatePairingsForMonth`), so a non-zero
 * pairing count with a zero instance count should not occur in practice;
 * both are checked defensively rather than assuming that invariant holds.
 */
export function hasNoScheduleDataForMonth(
  flightInstanceCount: number,
  candidatePairingCount: number
): boolean {
  return flightInstanceCount === 0 && candidatePairingCount === 0;
}
