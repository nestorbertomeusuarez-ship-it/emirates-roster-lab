# Pairing engine assumptions (Phase 2)

Every judgment call Phase 2 (the pairing engine + manual roster
constructor) introduced, per `PLAN.md`'s working rule that every default or
judgment call about real-world operating behavior must be logged, not
buried silently in code. See `docs/assumptions.md` for the pointer to this
file and Phase 1's own (empty) assumption log.

## 1. Default report-time offset: STD − 90 minutes

`src/pairing/dutyTimes.ts`'s `DEFAULT_REPORT_OFFSET_MINUTES = 90`. This is a
common short/medium-haul industry default, **not** sourced from an actual
Emirates roster, OM-A extract, or published crew-reporting-time policy.
Every `ReportTimeResult` this module returns carries `isAssumption: true` so
a future UI can render an explicit "ASSUMPTION" badge rather than
presenting it as confirmed operational data. A caller can override it via
`computeReportTime(stdUTC, customOffsetMinutes)`.

## 2. `daysOfWeek` is evaluated against the UTC calendar date

`src/pairing/expandScheduleToInstances.ts` reads each schedule line's
`daysOfWeek` pattern against the **UTC** calendar day, not a station-local
day. Phase 1's `Flight.stdUTCMin`/`staUTCMin` are minutes-since-UTC-midnight
with no associated local date field per flight — there is no station-local
calendar day to evaluate `daysOfWeek` against without additional per-flight
timezone context this schema doesn't carry. This is a judgment call, not
sourced operator scheduling behavior; a real published schedule likely
expresses "daily" relative to local departure date, which for most of the
seed data's routes coincides with the UTC date anyway (departures cluster
in UTC morning/evening, well away from UTC midnight), but this has not been
independently verified against a real Emirates schedule publication.

## 3. Same-aircraft-type-per-pairing (fleet-type-consistency)

`src/pairing/generatePairings.ts` requires every leg of a pairing to share
the **exact same** `aircraftType` string as the pairing's first leg (e.g.
all legs "A380", never mixing "A380" and "A350" within one pairing). This
models a single rotation flown on one physical airframe, which is how a
real pairing operates. It is deliberately NOT a fuzzy "same type rating"
match (which would, e.g., treat A350 and a hypothetical shared-rating type
as interchangeable) — Phase 1 only stores flat `advertisedType`/
`observedType` strings, and silently conflating two distinct type strings
would be exactly the kind of unsourced assumption this project forbids.

`aircraftType` itself is resolved as `observedType ?? advertisedType`
(prefer the confirmed/observed aircraft over the advertised one when Phase
1 has both) — see `src/pairing/db/flightInstances.ts`.

## 4. Default 2-pilot crew, no augmented-crew modeling

`src/pairing/toFlightDutyPeriod.ts` defaults `crewCount` to `2` (a plain
short/medium-haul two-pilot crew) unless the caller explicitly supplies
more. ULR-specific augmented-crew modeling (3/4-pilot crews, in-flight
relief scheduling) is explicitly out of scope for this bridge function —
Phase 3's own `src/ftl/rules/operatorSpecific.ts` already flags the
augmented-crew rest-facility table as `OPERATOR_SPECIFIC` (not publicly
published), so guessing augmented-crew behavior here would just be
compounding an unsourced assumption on top of an already-flagged gap.

## 5. FDP start/end boundary convention is an engineering approximation

`src/pairing/dutyTimes.ts#computeDutyMinutes` (used by
`toFlightDutyPeriod.ts` to populate
`FlightDutyPeriod.actualOrPlannedFdpMinutes`) measures duty/FDP as
"report time to last sector's on-blocks (arrival)". This matches the shape
Phase 3's `src/ftl/types.ts` expects to receive, but the exact FDP
start/end boundary convention (e.g. whether GCAA's own text defines the
end instant identically, handles post-flight duties, etc.) was **not**
independently re-verified against the GCAA source text beyond what Phase 3
already confirmed for the *maximum permitted* FDP values in
`src/ftl/rules/fdpTables.ts` (see `docs/gcaa-sources.md`). This is this
tool's own approximation of how to measure an *actual* duty against that
maximum, not itself a re-sourced regulatory definition.

## 6. Manual constructor: plain click-to-assign, not drag-and-drop

The Phase 2 UI (`src/app/roster/[year]/[month]/page.tsx`) is a simple
7-column month grid where each day is assigned via a plain HTML
`<select>` + submit-button form (Server Actions), not a drag-and-drop
calendar. This is a deliberate scope decision, not an oversight: PLAN.md's
own phase split reserves the calendar view / polished UI/UX investment for
Phase 5 ("Monthly calendar view... Compliance panel... ICS/CSV export").
Phase 2 only needed to prove the underlying pairing engine works and to
give the user *some* way to manually build a roster from it; click-to-
assign satisfies that without pulling Phase 5 work forward.

## 7. Pairing persistence: only assigned pairings are persisted

Only pairings a user actually assigns to a roster day are written to the
`Pairing`/`PairingLeg` tables (`src/pairing/db/pairings.ts#persistPairing`).
The much larger set of *candidate* pairings a month's search produces
(hundreds, even for the small seed schedule — see the verification run
below) is generated on demand by the pure `generatePairings` search and
never persisted; only the one the user picks needs a stable database
identity. See the `Pairing` model's doc comment in `prisma/schema.prisma`
for the full rationale.

## 8. RosterEntry: one row per pairing, not one row per occupied day

A multi-day pairing occupies `spansDays` consecutive calendar cells via a
**single** `RosterEntry` row on the pairing's start date (carrying
`spansDays`), not one row per occupied day. See the `RosterEntry` model's
doc comment in `prisma/schema.prisma` for the full rationale (a pairing
assignment is one atomic write; the alternative — one row per day, each
carrying `pairingId` + a day-index — would need an N-row transaction per
assignment and N rows that must always agree about which pairing/day-index
they represent). `src/pairing/db/roster.ts#buildRosterGrid` derives which
calendar cells are "occupied by pairing X, day N" purely by reading that
one row — no extra database rows are created for continuation days.
