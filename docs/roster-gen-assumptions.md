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

**EXTENDED by item 21 — `TARGET_DAYS_OFF_PER_MONTH`'s pacing is no longer
checked at month-scope only.** `PACING_CHECK_FROM_DAY`'s month-level
reactive check (below) still exists unchanged, but item 21 adds an
ADDITIONAL, narrower per-week-slice version of the same days-off pacing
idea, because the month-level-only version let a purely day-by-day greedy
walk spend an entire block-hours budget in the first 2-3 weeks, forcing
every remaining day of the month OFF as one giant tail (diagnosed against
the user's real live October 2026 roster). `CONSECUTIVE_DUTY_DAYS_SOFT_CAP`
is untouched by item 21. This note is preserved per this doc's own
update-don't-delete convention (see item #10's precedent) — the original
text below is unchanged.

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
The replacement is always total.

**Confirm-before-overwrite REMOVED (2026-09-17, direct user feedback: "no
hay necesidad de confirmar el 'nuevo roster overwrite'").** The UI
originally required an explicit second confirmation click before
overwriting a month that already had entries. In practice, once a pilot
is iterating on a real month (which this session did repeatedly — 5
regenerations in one day, tuning the block-hours target and strategy),
that confirmation fires on nearly every generate and just adds friction;
it also made the 3 strategy buttons (`src/app/roster/[year]/[month]/page.tsx`)
feel unresponsive, since clicking one redirected to a generic "overwrite?"
prompt instead of immediately regenerating. `generateRosterAction` now
always proceeds immediately and replaces the whole month — the "no
silent destruction of manual work" concern this item originally recorded
no longer applies as a UI safeguard; the total-replacement *semantics*
above are unchanged, only the confirmation gate in front of them is gone.

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

## 17. Calendar badge widens STANDBY/SIM/GROUND_SCHOOL/VACATION back out from DXB_OFF — presentational only, found during this session's own review

`classifyDayCategory` (item 12) derives its 3-way category from
`RosterGenDay`, which — per item 11's OFF-equivalent evaluation mapping —
has already collapsed every non-FLIGHT `RosterEntry.dutyType`
(STANDBY/SIM/GROUND_SCHOOL/VACATION), and an unassigned day, down to
`{type:'OFF'}`. Taken at face value for the calendar badge, that collapse
would show "Off · DXB" for a pilot who is actually on standby, in the
simulator, in ground school, or on vacation — a real, misleading gap
between what the badge says and what the pilot is actually doing that day,
found while auditing the calendar's own visual clarity (not reported by the
user — self-identified and fixed per this session's standing instruction to
keep hunting for issues and resolve them with due diligence).

`src/app/roster/[year]/[month]/dayPresentation.ts#resolveCalendarBadgeCategory`
widens a `DXB_OFF` category back out using the real `RosterEntry.dutyType`
(already available wherever a day has an `entry` — `DayCard.tsx` already
receives it as a prop) whenever that duty type isn't actually `OFF`. `FLIGHT`
and `LAYOVER` categories are left untouched (they only ever occur when the
real duty type is genuinely `FLIGHT`). This is presentation only, exactly
like item 12's LAYOVER classification — it does NOT change
`classifyDayCategory`, `RosterGenDay`, or `evaluateRosterDays` in any way;
a STANDBY/SIM/GROUND_SCHOOL/VACATION day is still evaluated as OFF-equivalent
per item 11, only the calendar badge's label changed.

## 18. BUGFIX: `evaluateInFlightRest` (ORO.FTL.215.G(e)) compared against the wrong bound — confirmed false GREEN, found and fixed this session

Found by an independent review pass over the core rule engine (Phase 3
`src/ftl/rules/*.ts`), never previously cross-checked by a separate
reviewer — each rule was built and self-verified by whichever session
originally wrote it. This is a genuine correctness bug, not a documented
scope limitation like most other items in this file.

**The bug**: `evaluateInFlightRest` computed the correctly-derived allowance
(`maxAllowedFdpMinutes = min(baseFdp + extension, absoluteCap)`) but then
checked severity against `capMinutes` (the absolute ceiling) ALONE, not
against `maxAllowedFdpMinutes`. Worse, `maxAllowedFdpMinutes` itself used
`MIN_REST_FOR_EXTENSION_MIN` (the 3h rest-eligibility floor) in place of an
actual base FDP figure — there was no base FDP available at the call site at
all. Net effect: any planned FDP under the absolute ceiling (18h/19h bunk,
15h/16h seat) was approved GREEN regardless of how little in-flight rest was
actually taken, as long as it cleared the 3h eligibility floor. Confirmed
by the project's own pre-existing test, which asserted GREEN for a 10h
planned FDP with only the 3h rest floor taken — the real
`ORO.FTL.215.G(e)` formula (base FDP + extension) only justifies about half
that.

**The fix**: `evaluateInFlightRest` now takes a required `baseFdpMinutes`
parameter — the un-augmented max FDP from the FDP tables
(`fdpTables.ts#maxFdpMinutes`) — and checks `plannedFdpMinutes` against
`min(baseFdpMinutes + extensionMinutes, capMinutes)`, matching the formula
exactly. `src/ftl/evaluate.ts#evaluateDuty` already computed this exact
base-FDP figure for `evaluateFdpTable` (Table A/B) and, separately, as a
`plannedFdpMinutes` fallback when calling the in-flight-rest check — it
just never threaded it through as the base for the EXTENSION formula.
`evaluateFdpTable` now returns its computed `maxMinutes` (or `null` on a
lookup failure) alongside its `RuleEvaluation`, computed once and reused for
both checks rather than recomputed a second time (which also fixes a
pre-existing gap where a `factoredSectors`/`maxFdpMinutes` failure at the
in-flight-rest call site — not caught anywhere — could have thrown
uncaught out of `evaluateDuty`; it now degrades to a RED "could not
evaluate" result instead, matching `evaluateFdpTable`'s own error handling).

No open item's real-world impact was assessed further than what the review
already established (see the review's own scenario: ULR augmented crew,
short-report-time duty, 3h rest taken, previously approved a 15h duty the
formula only justified to 11.5h) — this fix directly closes that gap.

## 19. Optional block-hours TARGET RANGE bias — a soft candidate-ordering preference, never a legality relaxation

**SUPERSEDED AGAIN — see item 20.** Tested live against the user's real
October 2026 roster a second time, the min/max soft bias documented below
still overshot the 90h ceiling by 12h20m (102h20m final) — the ceiling was
only ever a candidate-ordering *preference*, never a hard filter, so once a
single day's pick pushed the running total past `targetBlockMinutesMax`
there was nothing stopping a later day from accepting another
already-over-budget candidate; a greedy day-by-day walk also can't undo an
earlier day's pick once made. Direct user feedback in response: the target
range must become a genuine hard ceiling (an OFF day is an acceptable
outcome, undershooting the floor is acceptable, exceeding the ceiling is
not), AND the underlying objective changes from "maximize flying toward the
target" to "a MIX of short/medium/long-haul pairings and days off," with
`MAX_FLYING`/`MAX_DAYS_OFF` offered as explicit alternative strategies. Item
20 is the current, superseding design (hard `targetBlockMinutesMax`
eligibility filter + `generationStrategy`); this item (including its own
already-superseded original entry below) is kept for history per this doc's
own update-don't-delete convention (see item #10's precedent) rather than
silently rewritten.

**SUPERSEDED (same session) — refined from a single open floor to an
explicit min/max range.** The original version of this item (preserved
below) added a single `targetBlockMinutes` soft floor: while under target,
prefer bigger candidates; once at/above it, no bias at all. Tested live
against the user's real October 2026 roster via `generateRosterAction` with
`targetBlockHours=85`, it overshot to 106h40m — an open floor has no
ceiling, so once a single day's pick pushed the running total past 85h, the
"under target" condition simply stopped firing and the bias went inert
rather than steering back down. Direct user feedback in response ("keep it
as an open floor, or add a ceiling near 85?"): **"80-90"** — an explicit
range, not an open-ended floor. This entry is kept for history per this
doc's own update-don't-delete convention (see item #10's precedent) rather
than silently rewritten.

**Current behavior.** `GenerateMonthlyRosterInput.targetBlockMinutesMin`
and `targetBlockMinutesMax` (`src/roster-gen/types.ts`) replace the single
`targetBlockMinutes` field with two independently-optional bounds. Both,
when set, change ONLY which already-legal candidate
`generateMonthlyRoster.ts`'s construction loop tries first on a given day —
never whether a day gets a duty at all beyond what was already legal, and
never any legal threshold:

- **Below `targetBlockMinutesMin`:** a day's fitting candidates are sorted
  by DESCENDING block time (prefer bigger) — identical to the original
  single-floor behavior, fills toward the floor faster.
- **At or above `targetBlockMinutesMin`** (whether still inside
  `[min, max]` or already past `targetBlockMinutesMax` from a single day's
  jump): sorted by ASCENDING block time (prefer smaller) instead — this is
  the actual fix for the overshoot case reported above. It keeps an
  in-band roster from needlessly jumping back out the top, and once a
  single day's jump has already pushed the total past `max`, it minimizes
  further overshoot on every subsequent day: a greedy day-by-day walk can
  never undo a prior day's pick, so the best it can do going forward is
  stop making things worse.
- **`targetBlockMinutesMin` set, `targetBlockMinutesMax` unset:** degrades
  to the original open-floor behavior exactly — no bias at all once the
  floor is met (there's no ceiling to steer away from).
- **`targetBlockMinutesMax` set, `targetBlockMinutesMin` unset:** no floor
  phase to fill toward first, so candidates are always tried smallest-first
  from day 1 — minimizes how far a single day's jump can overshoot the cap.
- **Both unset:** behavior is byte-for-byte identical to no bias at all.

`Array#sort` is stable in every branch, so candidates tied on block time
keep their shuffled relative order — route variety among ties is
unaffected (#7 above).

This bias sits entirely downstream of every existing constraint, never
upstream of it: the candidate still has to pass `dayIndex0 +
candidate.tripDays > daysInMonth`, the `MAX_CONSECUTIVE_DUTY_DAYS` check,
`CONSECUTIVE_DUTY_DAYS_SOFT_CAP`/`TARGET_DAYS_OFF_PER_MONTH`/
`PACING_CHECK_FROM_DAY` pacing, and the real `evaluateDuty()` zero-RED
screen exactly as before — those remain fully authoritative and are
evaluated identically regardless of the target range. This is a reordering
of "which legal candidate is tried first," never a relaxation of what
counts as legal.

**Soft range, not a guarantee.** This still cannot guarantee landing inside
`[targetBlockMinutesMin, targetBlockMinutesMax]`: a single available
pairing might be large enough to jump straight past `targetBlockMinutesMax`
from below `targetBlockMinutesMin` in one day (there is no smaller legal
candidate available that day to land inside the band with), or the month's
legal flying capacity might not reach `targetBlockMinutesMin` at all.
Generation still completes normally either way — `summary.totalBlockMinutes`
reports whatever was actually achieved. No hard failure/error is raised for
missing the range; this mirrors every other constant in this file (#3
above) in being this generator's own scheduling heuristic, not a new GCAA
number.

**Wiring.** Threaded from `GenerateMonthlyRosterInput.targetBlockMinutesMin`/
`targetBlockMinutesMax` through `generateMonthlyRoster` (both optional,
both `undefined` = unchanged prior behavior) into
`src/roster-gen/db/rosterGen.ts#buildMonthlyRosterForFleet` (two new
optional parameters) into
`src/app/roster/[year]/[month]/actions.ts#generateRosterAction` (reads
optional `targetBlockHoursMin`/`targetBlockHoursMax` form fields, in
whole/fractional HOURS for the human, each converted to minutes
independently) into the generation form and its confirm-before-overwrite
re-POST in `src/app/roster/[year]/[month]/page.tsx` (two plain
`<input type="number">`s next to the fleet `<select>`, defaulting to
80/90 per the user's stated range, both carried through the
`genConfirm`/`genExisting` redirect exactly like `fleetType` already is, so
a confirmed overwrite doesn't lose the chosen range).

---

**Original entry, as first recorded (single open floor, now superseded
above):**

> Direct user request this session: push a real generated roster toward a
> target monthly block-hour figure (e.g. 85h, a standard real-world minimum
> guaranteed block-hour threshold in airline pay structures), without ever
> relaxing GCAA legality or the days-off pacing heuristics (#3 above).
>
> `GenerateMonthlyRosterInput.targetBlockMinutes` (`src/roster-gen/types.ts`)
> is optional and, when set, changes ONLY which already-legal candidate
> `generateMonthlyRoster.ts`'s construction loop tries first on a given day —
> never whether a day gets a duty at all beyond what was already legal, and
> never any legal threshold. Concretely: while the running total block
> minutes assigned so far is below `targetBlockMinutes`, a day's fitting
> candidate pairings are sorted by descending total block time
> (`orderCandidatesForSelection`) instead of using the existing
> deterministic-shuffle order (#7 above); once the running total
> reaches/exceeds the target, ordering reverts to the existing shuffle
> exactly as before this field existed. `Array#sort` is stable, so candidates
> tied on block time keep their shuffled relative order — route variety among
> ties is unaffected.
>
> **Soft floor, not a guarantee.** If the month's legal flying capacity
> (given the candidate pool, the 7-consecutive-duty-day ceiling, and the
> days-off floor) simply cannot reach `targetBlockMinutes`, generation still
> completes normally — `summary.totalBlockMinutes` just reports whatever was
> actually achieved, under target. No hard failure/error is raised for
> undershooting.

## 20. Hard `targetBlockMinutesMax` ceiling + haul-type MIX/MAX_FLYING/MAX_DAYS_OFF selectable strategy (supersedes item 19)

**EXTENDED by item 21 — the hard ceiling below is still exactly correct at
MONTH scope, but was not sufficient on its own.** A purely day-by-day walk
enforcing only a month-level ceiling can still legally spend the ENTIRE
budget in the first 2-3 weeks (nothing below stops it), forcing a giant
end-of-month OFF tail once the budget runs out — this is exactly what was
diagnosed against the user's real live October 2026 roster (10 consecutive
OFF days, days 22-31). Item 21 adds an ADDITIONAL, narrower weekly-slice
budget layer on top of (never instead of) the month-level ceiling described
below, which remains completely unchanged and still authoritative at month
scope. This note is preserved per this doc's own update-don't-delete
convention (see item #10's precedent) — the original text below is
unchanged.

Direct user feedback, verbatim (translated): *"Between 80 and 90 [hours],
let it leave an OFF day if necessary. The goal shouldn't be assigning the
maximum number of flights, but a MIX between short-haul, medium-haul, and
long-haul, and days off. As an option, you could add a couple of buttons
with preset functions like 'max flying' / 'max days off', but always within
the 80-90 hour range."* This is a real redesign of the generator's
objective (item 19's ceiling was only ever a candidate-ordering
*preference*; it could still overshoot), not another refinement of the same
soft-bias mechanism.

### Haul-type classification (`src/roster-gen/haulType.ts`)

A pairing's haul type is this generator's OWN scheduling heuristic — like
`CONSECUTIVE_DUTY_DAYS_SOFT_CAP`/`TARGET_DAYS_OFF_PER_MONTH` (item #3
above), it is not a new GCAA regulatory value. `classifyHaulType(pairing)`
classifies by the pairing's SINGLE LONGEST leg's `blockTimeMin`, not an
average or total across the (possibly multi-day) trip — a real long-haul
pairing is defined by having at least one long sector, not by accumulated
multi-day total (a 3-day trip made of three short hops is not "long-haul"
just because its total block time is large). Boundaries, an
industry-standard-ish convention rather than a sourced regulatory or
Emirates-fleet-specific figure:

- **SHORT** — longest leg block time < 180 min (3h).
- **MEDIUM** — longest leg block time 180-360 min (3h-6h), inclusive at both
  ends.
- **LONG** — longest leg block time > 360 min (6h+).

### Hard range enforcement (replaces item 19's soft ordering bias)

`targetBlockMinutesMax`, when set, is now enforced in
`generateMonthlyRoster.ts#filterCandidatesWithinBudget` as a HARD
eligibility filter applied BEFORE any strategy-based ordering: a candidate
is only eligible for a day if `runningBlockMinutesSoFar +
candidateBlockMinutes <= targetBlockMinutesMax`. If no candidate is
eligible for a day (none legal, none fit the remaining month, or none fit
the remaining budget), the day is OFF — this is not new OFF-handling
machinery, it is one more reason the pre-existing "no candidate fits" path
can trigger, exactly like the existing month-fit and consecutive-duty-day
checks already sitting in the same loop. This can leave the month under
`targetBlockMinutesMin` at month end, which is an ACCEPTED outcome per the
user's own explicit priority quoted above, never an error —
`targetBlockMinutesMin` itself is no longer enforced as any kind of filter,
it is purely informational context for a human reading the generated
summary.

### Selectable strategy (`GenerateMonthlyRosterInput.generationStrategy`)

Among a day's already-budget-filtered eligible candidates,
`generateMonthlyRoster.ts#orderCandidatesByStrategy` picks which one is
tried first, per `generationStrategy` (default `'MIX'` when unset):

- **`MIX`** (default) — prefers whichever haul type is currently
  least-represented among pairings already assigned this month (tracked as
  a running `Record<HaulType, number>` count, incremented every time a
  candidate is actually accepted). Ties (including the common all-zero
  start-of-month case) fall through to `Array#sort`'s stability, preserving
  the existing deterministic-shuffle relative order (item #7) — so MIX
  never needs its own separate tie-break rule.
- **`MAX_FLYING`** — sorts ascending by total pairing block time (prefer
  smaller), packing more distinct flying days into the same budget.
- **`MAX_DAYS_OFF`** — sorts descending by total pairing block time (prefer
  bigger), reaching the budget with fewer, longer trips and therefore more
  days off.

All three strategies share the exact same hard budget filter above and the
exact same underlying legality/pacing machinery
(`CONSECUTIVE_DUTY_DAYS_SOFT_CAP`/`TARGET_DAYS_OFF_PER_MONTH`/
`PACING_CHECK_FROM_DAY`, and the real `evaluateDuty()` zero-RED screen) —
they only differ in which already-eligible candidate is preferred each day.
Every legal threshold that actually PASSES/FAILS a candidate still comes
exclusively from `src/ftl/` and the pre-existing structural checks (month
fit, consecutive-duty-day ceiling); the budget filter and the strategy
never turn an illegal candidate legal, only ever turn a legal candidate's
day into OFF or reorder which legal candidate is tried first.

### Wiring

`GenerateMonthlyRosterInput.generationStrategy?: GenerationStrategy`
(`src/roster-gen/types.ts`, `'MIX' | 'MAX_FLYING' | 'MAX_DAYS_OFF'`, default
`'MIX'`) threads through `generateMonthlyRoster` into
`src/roster-gen/db/rosterGen.ts#buildMonthlyRosterForFleet` (one new
optional parameter, alongside the existing min/max) into
`src/app/roster/[year]/[month]/actions.ts#generateRosterAction` (reads an
optional `strategy` form field, validated against the three allowed values,
defaulting to `'MIX'` when blank/absent, carried through the
`genConfirm`/`genExisting` redirect exactly like the min/max fields already
are) into the generation form
(`src/app/roster/[year]/[month]/page.tsx`), which keeps the existing
min/max number inputs (still defaulting to 80/90) and adds the user's own
requested "couple of preset buttons" as three submit buttons sharing
`name="strategy"` with different `value`s on the SAME form (a standard
no-JS-required HTML pattern — the browser only submits the clicked button's
name/value pair): "Max flying" (`MAX_FLYING`), "Max days off"
(`MAX_DAYS_OFF`), and the existing default "Generate roster" button, now
`value="MIX"` — all three still submit through whatever min/max range is
currently in those two inputs. The confirm-before-overwrite form carries
the chosen `strategy` through a hidden field, matching the existing
min/max pattern exactly.

## 21. Weekly-block pacing (extends items 3 and 20): the construction loop paces in ~7-day slices, not just day-by-day

**EXTENDED by item 22 — layer 2's own trigger (`forcedOffByWeeklyPacing`)
was completely correct at fixing the giant-tail failure mode below, but
turned out to be too mechanically rigid on its own.** Tested live and
against a synthetic fixture isolating layer 2 specifically, it fires on
exactly the same day every time a slice needs to catch up, and — because
`weeklyStillNeededOff` and `remainingDaysInSlice` then decrease in lockstep
every forced day — always runs for exactly `weeklyTargetOffDays` days, no
more, no less. Diagnosed against the user's real live October 2026 roster a
second time (`FFFFFOOFFFFOOFFFFFOOFFFFFFOOFFO`): every single OFF block is
EXACTLY 2 days long. Direct user feedback in response: 2-4 days off between
flying blocks is a normal AVERAGE, not something to enforce as a rule —
item 22 adds seeded natural variation to WHEN and for how long this exact
trigger fires, never touching layer 1, the month-level check, or any
legality/cap check, all of which remain exactly as described below. This
note is preserved per this doc's own update-don't-delete convention (see
item #10's precedent) — the original text below is unchanged.

Direct user feedback, verbatim (translated): *"The blocks of days off
shouldn't be so concentrated, I don't like the day-by-day scheduling
method, you have to think in weekly, monthly blocks."* Diagnosed root
cause, confirmed against the user's real live October 2026 roster
(`FFFFFFOFFFFFFOFFFFFFOOOOOOOOOOO` — days 1-20 reasonably paced, days
22-31, 10 consecutive days, ALL off): item 20's hard `targetBlockMinutesMax`
ceiling is completely correct at MONTH scope, but a purely day-by-day
greedy walk enforcing only a month-level ceiling can legally spend the
ENTIRE budget in the first 2-3 weeks — nothing in items 3 or 20 stops it —
forcing every remaining day of the month OFF once the budget runs out, not
because of any days-off pacing logic, but simply because the month "ran out
of money" partway through. This item adds pacing WITHIN the month, not a
relitigation of the hard ceiling itself (kept exactly as-is).

### Week slices: simple sequential 7-day buckets, not calendar ISO weeks

`generateMonthlyRoster.ts#numberOfWeekSlices`/`#weekSliceBoundsForDay`
divide the month into `Math.ceil(daysInMonth / 7)` sequential slices
starting from day 1 (days 1-7, 8-14, 15-21, 22-28, remainder) — plain
7-day-from-day-1 buckets, not Mon-Sun calendar weeks, kept deliberately
simple and month-agnostic (a 28/29/30/31-day month all divide the same way,
with only the LAST slice ever being shorter than 7 days).

### Layer 1 — weekly block-budget pacing (`filterCandidatesWithinWeeklyBudget`)

Active only when `targetBlockMinutesMax` is set. Each week slice gets its
own soft slice, `targetBlockMinutesMax / numberOfWeekSlices` (flat
division, matching the task's own suggested formula), plus a **50% tolerance**
(`WEEKLY_BLOCK_TOLERANCE_FRACTION`): a candidate is filtered out if
`weeklyBlockMinutesSoFar + candidateBlockMinutes` would exceed
`weeklySlice * 1.5`. **Why 50%:** this codebase's synthetic and real
pairings commonly run to roughly 1000-1700 block-minutes for a 3-4 day
trip — a flat (untolerated) weekly slice would often be smaller than a
SINGLE real pairing, permanently blocking that week's every candidate for
no reason. 50% tolerance lets one legitimately large pairing be absorbed by
a week without unblocking enough room for the ORIGINAL bug (an entire
month's budget landing in 2-3 weeks) to reappear — a week is still capped
at 1.5x an even month-wide split, nowhere close to 100% of a multi-week
budget.

**Exception — a week's own FIRST pick is never blocked by this filter**
(`weeklyBlockMinutesSoFar === 0` short-circuits to a no-op, leaving the
existing month-level `filterCandidatesWithinBudget` as the sole gate).
Found and fixed during this item's own TDD process: a tight month-level
budget spread over several week slices (e.g. a 1400-minute month ceiling
over 5 weeks is a 280-minute/week slice) can be smaller than almost any
real pairing, and without this exception the weekly filter would
incorrectly block even a week's very first, otherwise-legal pick —
starving the month of flying it could easily afford, which is a REGRESSION
of items 3/20's existing behavior, not "pacing." The whole point of this
layer is to stop one week from absorbing SEVERAL pairings' worth of budget
that other weeks then go without; it was never meant to block a week's
first pairing outright. This exception is confirmed by
`generateMonthlyRoster.test.ts`'s pre-existing `targetBlockMinutesMax`
enforcement suite (a 1400-min budget must still accept exactly one 1000-min
pairing).

### Layer 2 — weekly days-off pacing

Independent of `targetBlockMinutesMax` (always active, exactly like the
existing month-level `TARGET_DAYS_OFF_PER_MONTH`/`PACING_CHECK_FROM_DAY`
pacing it extends). Each week slice gets its own OFF-day target,
`targetOffDaysForWeekSlice`: `TARGET_DAYS_OFF_PER_MONTH` scaled to the
SLICE'S OWN LENGTH (`round(TARGET_DAYS_OFF_PER_MONTH * sliceLengthDays /
daysInMonth)`, clamped to `[0, sliceLengthDays]`) — deliberately NOT a flat
`TARGET_DAYS_OFF_PER_MONTH / numberOfWeekSlices` split (the brief's own
suggested starting formula), because a flat split holds a short trailing
remainder slice (e.g. a 2-3-day final slice in a 30/31-day month) to the
SAME target as a full 7-day slice — for `TARGET_DAYS_OFF_PER_MONTH = 8`
over ~5 slices that rounds to 2, which would force the ENTIRE remainder
slice OFF regardless of legality or budget headroom. Scaling by the slice's
own length is this item's own "rounded sensibly" judgment call (the task
brief explicitly invited this).

Exactly like the existing month-level `PACING_CHECK_FROM_DAY` check, this
forces OFF as soon as it becomes mathematically necessary to still hit the
slice's own target before the slice ends (`weeklyStillNeededOff >=
remainingDaysInSlice`), not only on the slice's literal last day — same
formula shape as the month-level check, just re-scoped to the current week
slice instead of the whole month's tail.

**A second, narrower guard was needed and added during TDD.** The day-level
check above only ever runs at whichever day the loop's cursor actually
lands on; a multi-day candidate accepted EARLIER in the same slice can span
straight past the single day where the day-level check would otherwise
have fired later that slice, silently skipping it and leaving a week with
zero OFF days despite the pacing target existing. Fixed with an additional
per-candidate guard in the construction loop's inner accept path: a
candidate is skipped if accepting it would leave fewer days remaining in
the CURRENT slice than `weeklyStillNeededOff` still requires
(`max(0, remainingDaysInSlice - candidate.tripDays) < weeklyStillNeededOff`).
Found via this item's own acceptance test (`buildFixturePairings`'s mixed
1/2/3-day routes reproduced exactly this gap against week slice 1) — not
theoretical.

### Stacking, not replacement

Per the task's own explicit requirement: both layers only ever narrow
eligibility or force OFF sooner — they can never turn an illegal candidate
legal, and they can never remove the existing month-level hard ceiling or
`CONSECUTIVE_DUTY_DAYS_SOFT_CAP` check. A day goes OFF if ANY forcing
condition (month-level pacing, the consecutive-duty-day cap, weekly
days-off pacing) says so, or if the candidate pool is left empty after
BOTH the month-level and weekly block-budget filters run — exactly the
same "one more independent reason a day might go OFF" pattern items 3 and
20 already established, not new OFF-handling machinery.

### Verification

`generateMonthlyRoster.test.ts` gained: a weekly block-budget spread test
(a single dominant 1000-block-min/3-day route with a 4000-min month
ceiling — the OLD day-by-day-only pacing spends the whole budget by day 14,
confirmed via a real pre-fix RED run of this exact test; the NEW code
spreads it across 4 of 5 week slices, `< 4000` block-minutes started in the
first two weeks); a weekly days-off floor test (no week slice ends with
zero OFF days, using the multi-route `buildFixturePairings` fixture —
confirmed pre-fix RED on week slice 1 specifically, tracing to the
mid-pairing-skip gap above); the core acceptance test reproducing the
diagnosed real-world failure mode at reduced scale (single-route fixture,
90h month ceiling — the OLD code's longest OFF run for this exact fixture
is 13 consecutive days, confirmed via a real pre-fix RED run; the NEW code
brings it to **6** consecutive days, asserted `<= 7`); and an
`it.each(['MIX','MAX_FLYING','MAX_DAYS_OFF'])` regression sweep confirming
zero RED, the 7-consecutive-duty-day cap, and the `>=7`-days-off floor all
still hold with weekly pacing active, combined with the existing 80-90h
hard range. All 22 pre-existing tests in this file continued to pass
unmodified — weekly pacing only ever adds forced-OFF opportunities or
narrows eligibility, it never relaxes anything those tests already assert.

**Real Oct 2026 regeneration (this session, live `generateRosterAction`
POST, A350, MIX strategy, 80-90h range).** Pattern (F=flight/continuation,
O=off, one char per day 1-31):

```
FFFFFOOFFFFOOFFFFFOOFFFFFFOOFFO
```

Longest consecutive OFF run: **2 days** (down from the pre-fix diagnosis's
10-day end-of-month tail). 22 flight days, 9 DXB days off, 9 pairings
assigned, 4380 total block minutes (73h00m — under the 80h floor, an
accepted outcome per item 20's own explicit priority: the hard ceiling and
weekly pacing narrow eligibility, they never force a candidate to exist
where a legal/paced one doesn't), zero RED evaluations. Confirms weekly
pacing fixes the diagnosed real-world failure mode on the actual live data
it was diagnosed against, not just the synthetic test fixtures above.

### Wiring

No new `GenerateMonthlyRosterInput` field was needed — this is purely an
internal construction-loop refinement, derived entirely from the existing
`targetBlockMinutesMax` (layer 1) and the existing
`TARGET_DAYS_OFF_PER_MONTH` constant (layer 2). Nothing downstream
(`src/roster-gen/db/rosterGen.ts`, `actions.ts`, the generation form) needed
any change — every existing caller gets weekly pacing automatically.

## 22. Natural OFF-block length/position variation (extends item 21's layer 2 only): a seeded, probabilistic soft nudge, never a min/max rule

Direct user feedback, verbatim (translated): *"OFF blocks between 2 and 4
days is the average, it's not necessary to have a hard rule for that, but
it's something normal and likely."* Diagnosed root cause, isolated with a
synthetic single-route fixture with no `targetBlockMinutesMax` set (so only
layer 2 and the consecutive-duty soft cap can force an OFF day): item 21's
layer 2 trigger, `weeklyStillNeededOff >= remainingDaysInSlice`, is a fixed
point once true — both sides of the inequality decrement by exactly 1 every
forced day, so the condition stays true, and therefore the streak's length,
for exactly as many days as were still needed the moment it first fired.
With `TARGET_DAYS_OFF_PER_MONTH = 8` over ~4-5 week slices,
`weeklyTargetOffDays` rounds to almost exactly 2 for nearly every full
7-day slice, so every layer-2-triggered block ends up mechanically,
uniformly 2 days long — confirmed against the real live October 2026
roster (see item 21's extension note above) and against a controlled
synthetic fixture (a single dominant 2-day route, no block ceiling): two
back-to-back OFF blocks, both exactly 2 days (days 5-6 and 12-13), before
this item's fix.

**The user was explicit that a hard min/max OFF-block-length rule (e.g.
"reject any block outside 2-4 days") is NOT wanted** — that would be
enforcing a number nobody asked for as a rule, the opposite of "normal and
likely" framing. The fix instead makes the TRIGGER itself vary, using the
existing seeded `mulberry32` PRNG mechanism this generator already uses for
candidate-order shuffling (docs item 7) — never `Math.random()`, and never
a `Math.random()`-style non-deterministic source — so a given
fleet/year/month still reproduces byte-for-byte identically.

### Two independent, additive knobs — both scoped strictly to layer 2's own trigger

Both live in `generateMonthlyRoster.ts`, draw from a SEPARATE seeded stream
(`weeklyPacingVariationRng`, seeded `${fleetType}|${year}|${month}|weekly-pacing-variation`,
independent of the candidate-shuffle `rng` so neither concern perturbs the
other's draw sequence), and are documented in full in the module's own
"NATURAL OFF-BLOCK VARIATION" doc comment:

1. **Trigger-window jitter** (`rollWeeklyPacingTriggerSlackDays`, rolled once
   per week slice) — lets the trigger fire up to 2 days earlier than the
   mathematically-latest-possible day in the slice (`sliceTriggerSlackDays`,
   subtracted from `remainingDaysInSlice` in the trigger comparison). Varies
   block POSITION. Requires an explicit `weeklyStillNeededOff > 0` guard:
   without it, near a slice's own last 1-2 days the slacked comparison would
   stay true even after the slice's target is already met (`remainingDaysInSlice
   <= slack` regardless of `weeklyStillNeededOff`), forcing unneeded extra OFF
   days — found and fixed during this item's own design derivation (see the
   worked fixed-point math above), before it ever reached a written test.
   Slack only ever pulls an ALREADY-still-needed trigger earlier — it can
   never fire later than the original mechanical deadline, so the slice's own
   days-off target is always still guaranteed to be met by slice end, exactly
   as before this item.
2. **Streak-length extension** (`rollOffStreakExtensionDays`, rolled once per
   FRESH OFF streak that starts specifically because `forcedOffByWeeklyPacing`
   was true that day) — a probabilistic 0-2 extra days beyond the trigger's own
   mechanical minimum (45% none, 35% one extra day, 20% two extra days; ~0.75
   day expected extra). Varies block LENGTH — jitter alone only ever varies
   *when* the fixed-length streak starts, not its length, per the fixed-point
   argument above. Combined with the ~2-day mechanical minimum, typical total
   block length lands in the 2-4 day range described as normal, without a
   hard cap: there is no `if (blockLength < 2 || blockLength > 4) reject`
   anywhere in this file. **Deliberately scoped to weekly-pacing-triggered
   streaks only** — never to a "no eligible candidate" OFF day caused by
   layer 1's block-budget exhaustion or plain legality — so this can never
   extend the OFF runs the item 21 "no giant end-of-month OFF tail" test
   protects against; that test's fixture (a single dominant route pushed
   against a hard month ceiling) exhausts its budget via layer 1, not layer
   2, and was re-confirmed to still pass, unchanged, after this item.

Both knobs only ever turn an already-OFF-eligible day OFF sooner, or keep an
already-started weekly-pacing streak going one extra day — neither ever
overrides `evaluateDuty()` legality (OFF is trivially always legal), the
month-level hard `targetBlockMinutesMax` ceiling (extending OFF only reduces
flying, never increases it), `CONSECUTIVE_DUTY_DAYS_SOFT_CAP` (unaffected —
only FLIGHT days count toward it), or the month-level
`TARGET_DAYS_OFF_PER_MONTH`/`PACING_CHECK_FROM_DAY` floor (more OFF days can
only help reach a floor sooner, never prevent it).

### Verification

`generateMonthlyRoster.test.ts` gained a new describe block
(`generateMonthlyRoster — natural OFF-block length variation`): a variation
test using a synthetic single-2-day-route fixture with no block ceiling,
restricted to the first 17 days (strictly before `PACING_CHECK_FROM_DAY`
can ever fire) so any OFF block found is attributable only to layer 2 or
the consecutive-duty cap — confirmed pre-fix RED (both blocks found were
uniformly 2 days, `distinctLengths.size === 1`), confirmed post-fix GREEN
(distinct lengths across the same two blocks); a re-run of the existing
"no giant end-of-month OFF tail" fixture/assertions, confirming the new
knobs never regress that fix (longest run stays `<= 7`, unchanged before
and after this item); and a determinism test building one pairings pool
and calling `generateMonthlyRoster` twice with the identical input,
asserting byte-for-byte identical `days`/`summary`/`evaluations` output.
All 6 pre-existing weekly-pacing tests from item 21 (and every other
pre-existing test in the file) continued to pass unmodified — none of them
asserted an exact day-by-day pattern or exact block length, only aggregate
properties (zero RED, the 7-consecutive-duty-day cap, the `>=7`-days-off
floor, "every week slice has at least one OFF day," "spreads across at
least 3 week slices," "longest run `<= 7`") that natural variation does not
disturb.

### Wiring

No new `GenerateMonthlyRosterInput` field was needed — purely an internal
construction-loop refinement to layer 2, using two new module-level
constants (`WEEKLY_PACING_TRIGGER_SLACK_MAX_DAYS = 2`,
`OFF_STREAK_EXTENSION_MAX_DAYS = 2`) and one new seeded PRNG stream. Nothing
downstream (`src/roster-gen/db/rosterGen.ts`, `actions.ts`, the generation
form) needed any change — every existing caller gets the natural variation
automatically, with no new opt-out: per the user's own framing ("normal and
likely," not a rule to toggle), this is not gated behind a new input field.

## 23. Enforced min block-hours floor (supersedes `targetBlockMinutesMin`'s informational-only design in item 20): a best-effort floor, never a legality override

Direct user feedback, verbatim: *"fuerza para que queden al menos entre 70
y 90 block hours"* ("force it so it lands at least between 70 and 90 block
hours"), sent right after a real read-only verification run against the
live Oct 2026 schedule landed at 67.17h (A350) and 78.67h (A380) — both
under the 80h `targetBlockMinutesMin` default at the time, which item 20
had explicitly designed to be purely informational.

**What changed**: `targetBlockMinutesMin` is now enforced, but strictly as
a best-effort floor that suppresses only this generator's OWN invented
pacing/spacing preferences — never a real legality check, and never the
two heuristics that stand in for an actual GCAA days-off/duty-day floor.
`belowMinFloor` (`runningBlockMinutesSoFar < targetBlockMinutesMin`,
recomputed every day in the construction loop) suppresses:

- Layer 1's weekly block-budget filter (`filterCandidatesWithinWeeklyBudget`,
  item 21) — its only purpose is stopping one week from absorbing several
  weeks' worth of budget, which is exactly what catching up on a floor
  needs to be allowed to do.
- Layer 2's weekly-pacing OFF trigger (`forcedOffByWeeklyPacing`, item 21)
  and item 22's streak-length extension (`forcedOffByStreakExtension`) — an
  in-progress weekly-pacing-triggered OFF streak is cut short and flying
  resumes the moment a legal, budget-eligible candidate exists again.
- The multi-day-candidate weekly-slice-headroom guard inside the
  construction loop (`remainingDaysInSliceAfterCandidate <
  weeklyStillNeededOff`) — it exists solely to protect layer 2's own
  trigger, which is itself suppressed while below the floor.

**Deliberately never suppressed**, even while below the floor:

- The month-level `targetBlockMinutesMax` filter
  (`filterCandidatesWithinBudget`) — the hard ceiling from item 20 stays
  hard regardless of the floor; a floor never gets to push the month over
  the ceiling.
- `forcedOffByPacing` (the month-level `TARGET_DAYS_OFF_PER_MONTH` check)
  and `forcedOffByConsecutiveCap` (margin below the real 7-consecutive-
  duty-day ceiling) — both are this generator's proxies for an actual GCAA
  legal minimum (ORO.FTL.205.G's days-off-per-28-days floor and the 7-day
  consecutive-duty ceiling), not a cosmetic preference. A block-hours floor
  never overrides a legality proxy.
- Every `evaluateDuty()` RED screen — unchanged, and still the ultimate
  backstop: even without the guards above, flying more without a real
  days-off floor would eventually surface as a RED evaluation and get
  rejected regardless of `belowMinFloor`.

The floor is therefore always best-effort, exactly mirroring how the
pre-existing ceiling already behaves in the opposite direction: if legality
and the real days-off/duty-day floors leave no room, the month can still
land under `targetBlockMinutesMin`, which remains an accepted outcome, not
an error — the change is that this generator now tries measurably harder
before accepting that outcome, instead of never trying at all.

### Verification

Re-ran the same read-only `buildMonthlyRosterForFleet` check (no
persistence) against the real live Oct 2026 schedule with
`targetBlockMinutesMin = 70h`, `targetBlockMinutesMax = 90h`, `MIX`: see
this item's commit message for the exact before/after block-hour totals.
Zero RED both fleets, `generateMonthlyRoster.test.ts` gained new coverage
confirming (a) a fixture that would otherwise land under the floor reaches
it once legally reachable, (b) the month-level hard ceiling is still never
exceeded, (c) `forcedOffByPacing`/`forcedOffByConsecutiveCap`-driven OFF
days are unaffected by the floor, and (d) determinism is preserved.

### Wiring

No new `GenerateMonthlyRosterInput` field — `targetBlockMinutesMin` already
existed (item 20) and is now read inside `generateMonthlyRoster` itself
instead of being passed through unused. The generation form's default
range moved from 80-90h to 70-90h (`page.tsx`), reflecting that 70h is
realistically reachable most months now that the floor is actually
enforced, without needing to starve legality/pacing to chase a higher
number.
