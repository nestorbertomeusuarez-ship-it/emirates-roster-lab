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

## 9. Post-flight debrief time: 30 minutes added to on-blocks before rest starts

Direct user feedback (an actual line pilot's correction): a crew member
isn't released from duty the instant the aircraft comes to rest — there's
a real post-flight wind-down/debrief period before the duty is truly
complete for REST-PERIOD purposes. `src/pairing/dutyTimes.ts`'s
`DEFAULT_DEBRIEF_MINUTES = 30` and `computeDutyEndForRest(lastOnBlocksUTC,
debriefMinutes)` model this: it's `on-blocks + 30min`, not raw on-blocks,
that gets checked against the FOLLOWING duty's report time for minimum
rest (ORO.FTL.225.G/265.G(b)). Same footing as item 1's report-time
offset: a common industry default, **not** sourced from an actual Emirates
OM-A extract or published debrief-time policy.

**Deliberately scoped to REST only** — the FDP/duty-period LENGTH itself
(`computeDutyMinutes`, item 5's own engineering-approximation) still ends
at raw on-blocks, unaffected. Debrief only ever pushes the *next* duty's
minimum-rest floor requirement later; it never changes how long the
flying duty itself is measured as.

Wired into `restMinutes` (now takes an optional `debriefMinutes` param,
defaulting to `DEFAULT_DEBRIEF_MINUTES`) and, more importantly, into
`src/roster-gen/generateMonthlyRoster.ts`'s `prevDutyEnd.utc` — both sites
that record "when did the previous duty truly end" (the main construction/
verification loop, and `findPriorMonthDutyEnd` for docs item 24's
cross-month carry-over) now store `computeDutyEndForRest(lastOnBlocksUTC)`
instead of the raw on-blocks instant, so every downstream rest check
(construction-time candidate screening, the final verification pass, and
cross-month carry-over alike) picks this up automatically — no new
`GenerateMonthlyRosterInput` field needed.

Verified: `dutyTimes.test.ts` covers `computeDutyEndForRest` and the
updated `restMinutes` directly; `generateMonthlyRoster.test.ts` gained a
dedicated case proving a gap that's exactly legal on RAW arrival-to-report
timing (12h00m at the flight-crew home-base floor) becomes a real RED once
debrief is added (effective rest 11h30m) — a violation invisible without
this item. Real read-only `buildMonthlyRosterForFleet` check against the
live Oct 2026 schedule: still 0 RED both fleets, block hours essentially
unchanged (the construction loop transparently substituted a few
candidates that were only marginal under the old, less realistic rest
definition).

## 10. Turnaround ground-time window, distinct from an overnight layover

Direct user feedback (an actual line pilot, 2026-09-24): several destinations
this tool modeled as 2-3 day layovers (e.g. MCT, KWI, BAH) are, in real
Emirates operations, same-day TURNAROUNDS — the crew never leaves the
aircraft/airport, ~1-2h ground time, one FDP with 2 sectors, back at DXB the
same day. `src/pairing/generatePairings.ts` previously applied a single
`[minLayoverMinutes, maxLayoverMinutes]` window to EVERY connection, so a
short ground time (well under the 8h layover minimum) could never chain into
a pairing at all.

`PairingSearchConstraints` gained optional `turnaroundMinMinutes`/
`turnaroundMaxMinutes` (`src/pairing/types.ts`). A connection is now accepted
when its ground time falls in EITHER window — turnaround OR layover — never
a replacement for the layover window, and never accepted in the dead zone
between them (e.g. 151-479 minutes with the default bounds below). Both
fields absent reproduces the pre-item-10 single-window behavior exactly
(`generatePairings.ts#isAcceptableGroundTime`).

The three previously-duplicated constraint object literals
(`UI_PAIRING_CONSTRAINTS` in both `page.tsx` and `actions.ts`,
`ROSTER_GEN_PAIRING_CONSTRAINTS` in `rosterGen.ts`) are now ONE constant,
`src/pairing/constraints.ts#DEFAULT_PAIRING_CONSTRAINTS`:
`{ maxTripDays: 4, turnaroundMinMinutes: 45, turnaroundMaxMinutes: 150,
minLayoverMinutes: 480, maxLayoverMinutes: 2880 }`. `45`/`150` minutes is an
industry-standard-ish quick-turn window (not sourced from a specific
Emirates OM-A extract) — same footing as this file's other unsourced
scheduling-heuristic constants (see item 3's own framing).

This directly un-blocks the LCA-MLA tag-on limitation noted in
`docs/data-sources.md`'s 2026-09-23 entry ("a ~1h tag-on turnaround at LCA
can never chain") for the general turnaround case, though the specific
LCA-MLA multi-city tag-on itself remains modeled as two independent DXB
nonstops (deferred, unchanged by this item) — see `docs/data-sources.md`'s
2026-09-24 entry for which seed routes were actually switched to turnaround
scheduling and why LCA itself was deliberately excluded.

## 11. `turnaroundOnlyStations`: some outstations NEVER get a layover, only a turnaround

Direct DB simulation feedback (2026-09-25): with item 10's OR-of-both-windows
rule alone, a turnaround-flagged station with only ONE daily frequency each
way still legally chained into a ~24-25h "layover" (JED 3d, KWI 3d, RUH 2d,
BGW 2d, CAI 2d, BLR 2d observed) simply because that gap falls inside
`[minLayoverMinutes, maxLayoverMinutes]` — real EK crews do not lay over at
these stations at all.

`PairingSearchConstraints.turnaroundOnlyStations` (optional
`readonly string[]`) lists outstations where a connection is accepted ONLY
when its ground time falls in the turnaround window — the ordinary layover
window is never consulted for a listed station, regardless of how well the
ground time would otherwise fit it (`generatePairings.ts#isAcceptableGroundTime`,
keyed off the connection's own outstation, `lastLeg.arrIata`).

`src/pairing/constraints.ts#TURNAROUND_ONLY_STATIONS` = the 14
turnaround-flagged seed routes MINUS `AMD`: BAH, KWI, JED, RUH, DMM, MCT,
AMM, BGW, BOM, DEL, ISB, CAI, BLR. AMD kept its real published times (405min
ground — outside the turnaround window) per item 10's own scope decision;
listing it here would leave it with ZERO valid connections at all (405min
fits neither window). KWI (105min) and CAI (95min) were independently
verified against the seed JSON to have real/derived ground times genuinely
inside the window, so both are safely included.

### Verification

New `generatePairings.test.ts` describe block: a turnaround-only station
rejects an ordinary 24h-ish layover-window connection but still accepts a
genuine turnaround-window one; a non-listed station is unaffected. New
`seedSchedule.test.ts` describe block: every station in
`TURNAROUND_ONLY_STATIONS` has a daily (`daysOfWeek: '1111111'`) return
whose ground time is inside `[45,150]`min, read from the actual generated
seed JSON — and confirms `AMD` is NOT in the list.

## 12. Regression test for the constraints field-copying bug (fixed directly, commit cbec482)

`src/pairing/db/pairings.ts#generatePairingsForMonth` used to copy
`constraints` field-by-field into the object passed to the pure
`generatePairings`, silently dropping `turnaroundMinMinutes`/
`turnaroundMaxMinutes`/`turnaroundOnlyStations` whenever a new optional
field was added to `PairingSearchConstraints` — so the DB-backed generation
path never produced a turnaround even though the pure `generatePairings`
already supported it (caught only by comparing the pure engine's own unit
tests against a real DB simulation, see docs/data-sources.md's own
verification notes). Fixed by spreading `...constraints` instead.

`src/pairing/db/pairings.test.ts` (new) regression-tests this WITHOUT a real
database — `vi.doMock` stubs out `ensureFlightInstancesForMonth` (the only
Prisma-touching call this wrapper makes) with a synthetic in-memory instance
pool, so `generatePairingsForMonth` can be exercised end-to-end with a fake
`PrismaClient` that is never actually used. This is a deliberate deviation
from this codebase's usual `src/pairing/db/*.test.ts` convention (real
integration tests against the seeded dev DB, see `loadPairing.test.ts`'s own
doc comment) — that pattern needs synthetic DB writes/teardown, which this
task's own scope explicitly forbids.
