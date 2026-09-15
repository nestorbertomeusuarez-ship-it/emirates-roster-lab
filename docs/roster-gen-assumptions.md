# Automatic monthly roster generator assumptions (Phase 4)

Every judgment call the automatic roster generator (`src/roster-gen/`)
introduced, per `PLAN.md`'s working rule that every default or judgment
call about real-world operating behavior must be logged, not buried
silently in code. See `docs/assumptions.md` for the pointer to this file.

## 1. Single-month generation — no prior-month history

This generator only ever sees the one month it's asked to produce. Two
GCAA `ORO.FTL.200.G`/`ORO.FTL.205.G` checks are structurally unable to be
evaluated correctly against a genuine rolling window without that history:

- **900h/12-month block time.** `CumulativeTotals.blockMinutes12mo` is
  filled with this month's own running month-to-date total (see
  `generateMonthlyRoster.ts#evaluateRosterDays`) — always far below the
  900h ceiling for a single month, so it never produces a false RED, but it
  is **not** a real 12-month rolling check. A future multi-month version of
  this tool would need to carry real cross-month totals forward.
- **"Days off in any N consecutive days" (2-in-14, 7-in-28, and the
  8-per-28-over-3-periods average).** Early in any month, the trailing
  N-day window is necessarily smaller than N (e.g. day 5 only has 5 days of
  history), and a truncated window's "0 days off in 5 days" is not a real
  violation — it's an artifact of not enough days having happened yet.
  Rather than fabricate prior-month history, `evaluateRosterDays` omits
  those three specific sub-checks from its output until their window has
  fully elapsed *within this roster* (14/28 days in), while keeping every
  other check (FDP-table, minimum rest, the 7-consecutive-duty-day ceiling,
  and the block/duty absolute caps, which — unlike the days-off floors —
  are meaningful even against a partial window since they're upper bounds)
  active from day 1. The construction algorithm's own pacing bias (see #3
  below) still has to do real work to hit the days-off target by the time
  the window becomes checkable, so this isn't a loophole — the 30/31-day
  month is close enough to a 28-day window that a genuinely well-paced
  roster passes once the check activates.
- `avgDaysOffPer28dOver3Periods` is approximated by this single period's
  own trailing 28-day days-off count — a true 3-period average needs 3
  months of history this tool doesn't have.

## 2. Every duty is assumed acclimatised (Table A)

`src/ftl/rules/acclimatisation.ts` needs real consecutive-local-night
history to determine acclimatisation status; this generator doesn't track
it. Every constructed `FlightDutyPeriod` is built with `isAcclimatised:
true` (Table A limits), applied identically during construction-time
candidate screening and the final independent verification pass — since
both use the exact same assumption, this cannot itself cause the two
passes to disagree, but it is a real simplification, not sourced
per-pilot acclimatisation tracking.

## 3. Construction heuristics are the generator's own, not new GCAA numbers

`generateMonthlyRoster.ts` uses three tunable constants that are this
generator's *own* scheduling heuristics, not additional regulatory values:

- `CONSECUTIVE_DUTY_DAYS_SOFT_CAP = 6` — forces an OFF day once 6
  consecutive duty days have accumulated, one day of margin below the
  legal 7-day ceiling (`ORO.FTL.205.G`), rather than only reacting exactly
  at the limit.
- `TARGET_DAYS_OFF_PER_MONTH = 8` — a single-period stand-in for the
  combination of the ">=7 days off/28d" floor and the ">=8/28d over 3
  periods" average (see #1 above).
- `PACING_CHECK_FROM_DAY = 24` — from this day of the month onward, an OFF
  day is forced whenever the days-off pace could not otherwise reach the
  target by month end.

Every legal threshold used to actually PASS/FAIL a candidate (FDP-table
maxima, minimum rest, the 100h/28d and duty-hour caps, the 7-day
consecutive-duty ceiling, the days-off floors once their window is valid)
comes from calling the real `src/ftl/` functions — this module never
redefines a GCAA number itself.

## 4. A layover day within an active pairing is a duty day, not a day off

Every calendar day a pairing occupies (start through end date) counts
toward `consecutiveDutyDays`, even a day with no flying on it (a pure
layover at an outstation) — a crew member away from base mid-trip has not
been released for a qualifying rest period (`ORO.FTL.205.G` requires >=34h
including 2 local nights), so it is not a "day off" in the regulatory
sense. Only an explicitly assigned OFF day resets the consecutive-duty-day
counter.

## 5. Rest location is inferred from the previous duty's arrival station

`RestPeriodInput.awayFromBase` for the minimum-rest check
(`src/ftl/rules/minRest.ts`) is derived from where the immediately
preceding duty ended: `false` (at home base, DXB) between two pairings —
pairings always start and end at the home base — and `true` for a rest
period between two legs of the same pairing at an outstation layover.

## 6. The very first duty of the month is never rest-checked

With no prior-month history, there is no real "previous duty" to measure
the first flown day's rest against. This generator assumes the crew
starts the month already rested and skips the minimum-rest check only for
that first occurrence.

## 7. Deterministic (not true-random) candidate ordering

For route variety (per the task's "shuffle or round-robin" guidance),
candidate pairings starting on the same day are shuffled with a seeded
PRNG (`mulberry32`, seeded from `fleetType|year|month`) rather than
`Math.random()` — this keeps generation reproducible for a given
month/fleet, which matters for debugging and for deterministic tests.

## 8. Auto-generation only ever assigns FLIGHT or OFF

Per the task's explicit scope: STANDBY / SIM / GROUND_SCHOOL / VACATION
(Phase 2's other `DutyType` values) are never auto-assigned. They remain
available for manual editing afterward through the existing Phase 2
click-to-assign constructor, which this generator does not replace.

## 9. Regeneration replaces the whole month, not a merge

`src/roster-gen/db/rosterGen.ts#persistGeneratedRoster` deletes every
existing `RosterEntry` row for the target month before writing the
generated result — it does not attempt to merge with prior manual edits.
The UI (`src/app/roster/[year]/[month]/actions.ts#generateRosterAction`)
requires an explicit second confirmation before overwriting a month that
already has entries (manual or a previous generation), per the task's
instruction not to silently destroy manual work — but once confirmed, the
replacement is total.

## 10. Compliance-flag detail is summarized, not itemized, in the UI

**SUPERSEDED by Phase 5 Slice 2** — `src/app/roster/[year]/[month]/CompliancePanel.tsx`,
wired into `page.tsx` alongside the calendar grid, now shows the full
itemized, always-current GCAA evaluation (citation, message, margin,
explicit operator-specific tagging) for whatever is actually persisted for
the month, manual or generated, on every page render — built on top of
Phase 5 Slice 1's `loadRosterGenDaysForMonth` reconstruction plumbing. This
entry is kept for history rather than deleted, per this doc's own
update-don't-delete convention; the original limitation it describes no
longer applies.

The original limitation, as originally recorded, is preserved below:

> The post-generation summary banner (`page.tsx`) shows a RED-evaluation
> *count*, not the individual flagged messages — the generation result
> crosses a server-redirect as a compact colon-separated query-string value,
> and full per-evaluation detail (citation, message, margin) would need
> additional plumbing (e.g. a dedicated results view or session storage)
> that's out of scope for this minimal Phase 4 UI, consistent with Phase 2's
> own deliberate UI minimalism (see `page.tsx`'s existing scope note). A
> non-zero count is still always visibly surfaced, never hidden — and in
> practice should never be non-zero (see the generator's own verification
> pass, `generateMonthlyRoster.ts`'s module doc comment).
>
> Note: this ephemeral `genSummary` banner itself is UNCHANGED by Slice 2 —
> it remains a nice "just generated" confirmation, now complemented (not
> replaced) by the always-current itemized panel described above.

## 11. Reconstructing a persisted roster (Phase 5 Slice 1): non-FLIGHT duty types are OFF-equivalent for live re-evaluation

`src/roster-gen/db/loadRosterGenDays.ts#loadRosterGenDaysForMonth` reads
back whatever is actually PERSISTED for a roster month — `RosterEntry` rows,
which may be manually assembled via the Phase 2 constructor
(`assignSimpleDuty`/`assignPairingDuty`), not just rows this generator
itself produced — and reconstructs a `RosterGenDay[]` so the real
`evaluateRosterDays()` can be re-run against it. `RosterGenDayAssignment`
only has two cases, `FLIGHT` and `OFF` (see `src/roster-gen/types.ts`), but
a persisted `RosterEntry.dutyType` can also be `STANDBY` / `SIM` /
`GROUND_SCHOOL` / `VACATION` (Phase 2's full `DutyType` union). This
reconstruction maps every one of those four, and any day with no
`RosterEntry` at all, to `{ type: 'OFF' }` for evaluation purposes: none of
them represent flying, so none of them can contribute FDP/block/duty
minutes, and — per item #4 above — only an explicit rest release resets
`consecutiveDutyDays` in this tool's model; a day the crew member spends on
standby, in the simulator, in ground school, or on vacation is, for this
narrow GCAA-evaluation purpose, indistinguishable from an OFF day. This is
NOT a claim that GCAA treats standby/sim/ground-school/vacation duty as
legally equivalent to a day off in general (e.g. standby has its own
carrier-specific limits, already flagged `OPERATOR_SPECIFIC` in
`src/ftl/rules/operatorSpecific.ts`) — it is scoped strictly to what this
tool's evaluator can and does check (FDP tables, minimum rest, cumulative
block/duty limits, days-off floors), none of which a non-FLIGHT duty type
can violate in this tool's model.

This is a Phase 5 extension of the Phase 4 generator's own scope: item #8
above documents that auto-generation itself only ever ASSIGNS FLIGHT or
OFF, and explicitly says the other four duty types "remain available for
manual editing afterward through the existing Phase 2 click-to-assign
constructor, which this generator does not replace" — but it did not
specify how a live re-evaluation of a roster carrying one of those manually
assigned duty types should behave, because nothing before this slice
re-evaluated a persisted roster at all. This item closes that gap.

## 12. Calendar day category (Phase 5 Slice 3): FLIGHT vs LAYOVER is a same-date leg lookup, presentational only

Per explicit user request, the calendar grid (`src/app/roster/[year]/[month]/DayCard.tsx`)
distinguishes three day categories, not just the FLIGHT/OFF binary
`RosterGenDay` already models: an actual flying day, a day off at home base
(DXB), and a layover day at an outstation within an active multi-day
pairing where no leg departs or arrives that specific date.

`src/app/roster/[year]/[month]/dayPresentation.ts#classifyDayCategory`
derives this purely from data already available in `RosterGenDay` — no new
data source, no schema change, no extension of `RosterGenDayAssignment`
(`src/roster-gen/types.ts`) was needed:

- `{ type: 'OFF' }` -> `DXB_OFF`.
- `{ type: 'FLIGHT', pairing }` where at least one `pairing.legs[].instance.serviceDate`
  equals the day's own date -> `FLIGHT` (a real flying leg operates this
  day).
- `{ type: 'FLIGHT', pairing }` where no leg's `serviceDate` matches the
  day's date -> `LAYOVER` (a pure rest day within the pairing's span, at an
  outstation).

This is the exact same same-date leg lookup `generateMonthlyRoster.ts`'s own
internal (unexported) `legsOnDay` helper already performs to decide which
days actually contribute FDP/block/duty minutes — `classifyDayCategory` is
a re-derivation of that same logic for the UI, not new plumbing, since
`generateMonthlyRoster.ts` is frozen/done from Phase 4 and its helper isn't
exported.

**This is additive to item #4 above, not a contradiction of it.** Item #4
establishes that every calendar day a pairing occupies — including a pure
layover day with no flying — counts as duty for `consecutiveDutyDays` and
`ORO.FTL.205.G` purposes; that GCAA-evaluation behavior is completely
unchanged by this item. `LAYOVER` is a presentational label only, computed
in `src/app/roster/[year]/[month]/page.tsx` and rendered by `DayCard.tsx`
purely so the user can see at a glance which days involve actual flying vs.
which are outstation rest — it never feeds back into `evaluateRosterDays`
or any `src/ftl/` rule, and a LAYOVER day still evaluates, legally, exactly
as duty.

An unassigned day (no `RosterEntry` at all) also maps to `{ type: 'OFF' }`
per item #11, and so would classify as `DXB_OFF` — but `DayCard.tsx`
deliberately withholds the category badge in that case (nothing has
actually been decided for that day yet) and keeps showing its existing
plain "unassigned" label, so an empty day is never visually presented as a
confirmed day off.

## 13. Pairing detail timeline (Phase 5 Slice 4): "cumulative duty" granularity and out-of-month evaluation window

Two judgment calls introduced by
`src/app/roster/[year]/[month]/pairing/[pairingId]/`, the leg-by-leg
"zoom in" view for one pairing:

- **"Cumulative duty" is defined at calendar-day granularity, not leg
  granularity.** FDP/duty time (`src/pairing/dutyTimes.ts#computeDutyMinutes`)
  is a property of a whole duty day — report time to that day's last
  on-blocks — not of an individual sector; there is no well-defined "duty
  time so far mid-day" a partial FDP could represent without inventing a
  new concept `dutyTimes.ts` doesn't have. `pairingTimelineData.ts#buildPairingTimelineRows`
  groups a pairing's legs by `instance.serviceDate`, computes each day's
  duty minutes once (same report-time/last-on-blocks math
  `generateMonthlyRoster.ts#evaluateRosterDays` already uses), and shows
  every leg flown that day the same `dailyDutyMinutes` value plus a running
  `cumulativeDutyMinutes` sum across the pairing's days so far.
- **Compliance flags shown on this page come from the REQUESTED month's own
  evaluation window only**, sliced down to the pairing's
  `[startServiceDate, endServiceDate]` range —
  `page.tsx` re-runs the exact same `loadRosterGenDaysForMonth` +
  `getAirportTimeZones` + `evaluateRosterDays` composition the month page
  uses (it is a separate route/request and cannot receive props from it),
  which only ever sees that one month's own calendar cells (see item #11's
  `loadRosterGenDaysForMonth` scope). A pairing that starts on the
  requested month's last day(s) and continues into the next month will
  therefore show no compliance evaluation for its out-of-month days on this
  page — this is NOT a claim that those days are compliant, only that this
  route did not evaluate them (the pairing's *own* generation/assignment,
  if any, was already screened at generation time against whichever
  month(s) it was actually built for). Visiting the pairing's *other* month
  directly would show that month's own slice of the same pairing's
  evaluations instead.

## 14. Confirmed operator facts for item 3 (pairing/standby limits): explicit sentinels, not silent defaults

This pilot explicitly confirmed, in conversation, two real facts about their
own operating environment (not GCAA-sourced, not guessed): no
maximum-pairings-per-month cap applies to them, and standby duty is not part
of their actual roster at all. These are genuine confirmed facts, not "we
don't have data" — treating them the same as an unconfigured/unknown value
(AMBER) would misrepresent something this pilot has already told the tool.

**Sentinel semantics, not a silent default.** `OperatorSpecificOverrides`
(`src/ftl/types.ts`) gives `maxPairingsPerMonth` and
`standbyContactablePeriodDefinition` an explicit third state beyond
"unconfigured" (`undefined`, stays AMBER) and "a real configured
value/number" (GREEN, "using operator-configured value" wording): the
literal string sentinel `'none'` / `'not_used'` (GREEN, "operator confirmed"
wording). Without a distinct sentinel, "no cap configured" and "confirmed no
cap exists" are indistinguishable from plain `undefined`, and either this
pilot's confirmed fact would have to be silently defaulted into the type
(losing the "confirmed" framing and blocking a genuinely unconfigured future
user from ever seeing AMBER), or the check would have to stay AMBER forever
despite a real answered question. `evaluateOperatorPairingAndStandbyLimits`
(`src/ftl/rules/operatorSpecific.ts`) checks for the sentinel first, then
falls back to "a real value was supplied," then AMBER — an *empty* overrides
object (`{}`) still resolves AMBER, exactly as before this item, since
neither the sentinel nor a real value is present.

**Single hardcoded config file, not a settings UI.** Per `PLAN.md`'s own
framing ("A personal planning tool for an Emirates A350/A380 pilot"), this
app has exactly one user. `src/ftl/operatorConfig.ts` exports one constant,
`EMIRATES_OPERATOR_CONFIG`, carrying this pilot's two confirmed facts as the
sentinels above; `ulrFtlVariationMaxFdpMinutes` and
`augmentedCrewRestFacilityMaxFdpMinutes` are left `undefined` in it (see
item #15 below — no default crew size). A settings/config UI to let a user
edit `OperatorSpecificOverrides` interactively was explicitly out of scope
for this change — building one for a tool with exactly one, already-known
user would be speculative generality. `OperatorSpecificOverrides` itself
stays a general type, so a future multi-pilot version of this tool would
only need to replace `operatorConfig.ts`'s wiring, not the type or the
evaluators.

**Wiring.** Before this change, nothing in the app ever passed
`operatorConfig` to `evaluateDuty()` outside of direct unit tests —
`generateMonthlyRoster.ts`'s own internal `evaluateDuty(fdp, rest,
cumulative)` call (inside `evaluateRosterDays`) omitted the 4th argument
entirely, so every operator-specific check always showed AMBER everywhere in
the app regardless of what a caller might configure. This change threads an
optional `operatorConfig?: OperatorSpecificOverrides` from
`GenerateMonthlyRosterInput` through `generateMonthlyRoster` into both
`evaluateRosterDays` calls it makes (construction-time candidate screening
*and* the final independent verification pass — the same value, so this
cannot itself cause the two passes to disagree) and into `evaluateRosterDays`
itself, which was given the same new optional 3rd parameter and passes it on
to `evaluateDuty`. `src/roster-gen/db/rosterGen.ts#buildMonthlyRosterForFleet`
supplies `EMIRATES_OPERATOR_CONFIG` at the one real DB-aware call site that
builds a fresh month. The two UI routes that call `evaluateRosterDays`
directly on an already-persisted roster
(`src/app/roster/[year]/[month]/page.tsx` and
`src/app/roster/[year]/[month]/pairing/[pairingId]/page.tsx`) each import and
pass `EMIRATES_OPERATOR_CONFIG` themselves — `loadRosterGenDaysForMonth`
(`src/roster-gen/db/loadRosterGenDays.ts`) only reconstructs `RosterGenDay[]`
from persisted data and never itself calls `evaluateDuty`/`evaluateRosterDays`,
so it needed no change of its own.

## 15. EASA CS-FTL.1.205(c) as an explicit public proxy for items 1/2 (ULR variation scheme, augmented-crew rest-facility table) — still AMBER, no crew-size default

Per explicit user instruction this session ("if you can't find Emirates'
exact number, base it on EASA and UK CAA since they're similar"), the AMBER
default messages for `evaluateUlrFtlVariationScheme` and
`evaluateAugmentedCrewRestFacilityTable` (`src/ftl/rules/operatorSpecific.ts`)
now cite real, verified figures instead of purely vague wording: EASA
CS-FTL.1.205(c)'s augmented-crew rest-facility -> max-FDP table, corroborated
against the UK CAA Regulatory Library's own hosted copy of the same clause
(both accessed 2026-09-15 — see `src/ftl/citation.ts#easaProxyCitation`).
This pilot separately confirmed their rest facility is Class 1 (dedicated
flat/near-flat bunk); the two Class 1 figures now cited are 960 min max FDP
for a 3-pilot crew (+1) and 1020 min for a 4-pilot crew (+2). Class 2/3
figures are also kept in `EASA_AUGMENTED_CREW_REST_FACILITY_TABLE` for
traceability, since the source table has them, even though only Class 1 is
cited in the message text.

**This is a citation change to the message text only — it does NOT resolve
either check to GREEN.** Two reasons this stays AMBER: (1) it is EASA/UK CAA
public text, a different regulator from GCAA, corroborating what the closest
available public data says — NOT Emirates' actual confidential/approved
scheme, which remains unpublished; (2) this pilot's augmented-crew size (3
vs. 4 pilots) varies by route and has **no fixed default** — an explicit
user decision, not an oversight. Auto-resolving to GREEN would require
guessing a crew size this tool has no way to know per-route. `citation.ts`
gained a dedicated `easaProxyCitation()` helper (and
`EASA_UK_CAA_PROXY_DOCUMENT`/`_URL`/`_DATE_CONSULTED` constants) rather than
reusing `gcaaCitation` — reusing `gcaaCitation` would have falsely asserted
the GCAA document as this data's source, which `RuleCitation`'s
single-citation shape (`src/ftl/types.ts`) does not otherwise allow
expressing as "this is a proxy from a different regulator." The mechanism to
resolve either check to GREEN once a specific route's crew size is known was
already correctly wired end-to-end before this change
(`ulrFtlVariationMaxFdpMinutes`/`augmentedCrewRestFacilityMaxFdpMinutes` on
`OperatorSpecificOverrides`) — no UI to set them per-route was in scope for
this change, only keeping the message text honest and useful while they
remain unset.

## 16. "Today" highlighting on the calendar grid uses the UTC calendar day

Phase 5 UI polish (this session) — `src/app/roster/[year]/[month]/page.tsx`
computes today's date server-side and passes an `isToday: boolean` prop
into `DayCard` for the matching cell, only when the requested
`/roster/[year]/[month]` is the real current UTC year/month. This reuses the
project's existing UTC-day convention rather than introducing a new one —
see item 2 in `docs/pairing-assumptions.md` (`daysOfWeek` is evaluated
against the UTC calendar date) and this file's own use of
`T00:00:00.000Z` date parsing for the grid's Mon-start weekday padding.
"Today" is therefore `new Date().getUTCFullYear()/getUTCMonth()/getUTCDate()`,
not the server's local timezone — consistent with how every other date in
this codebase (flight instances, roster entries, pairing legs) is treated
as a UTC calendar day with no station-local component.
