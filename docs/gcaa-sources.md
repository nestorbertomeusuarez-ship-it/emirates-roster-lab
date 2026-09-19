# GCAA flight/duty-time-limitation (FTL) sources

> **Last verified: 2026-09-19.** Re-verify against the primary source
> periodically, and immediately if a new CAR-AIR OPS issue is published.

## Primary source

**Document:** CAR-AIR OPS – Part-ORO, Issue 03, Subpart FTL, Section 1
(General, ORO.FTL.100.G–125.G) and Section 2 (Aeroplanes,
ORO.FTL.200.G–270.G). Issued by the UAE General Civil Aviation Authority
(GCAA).

**URL:**
https://www.gcaa.gov.ae/en/epublication/EPublications/Civil%20Aviation%20Regulations%20(CARs)/CAR%20IV%20-%20FLIGHT%20OPERATIONS%20REGULATIONS/CAR%20AIR%20OPS/CAR%20-%20AIR-OPS%20-%20ISSUE%2003/CAR-AIR%20OPS%20-%20PART-ORO%20-%20ISSUE%2003.pdf

**Date consulted:** 2026-09-14.

### Superseded document — never cite as current

**CAR-OPS 1** (all issues, including "Issue 08, 2018") is formally
superseded by CAR-AIR OPS per that regulation's Cover Regulation
Article 11.G. The numeric content is identical (verified), but every
citation in this codebase points to **CAR-AIR OPS Part-ORO Issue 03**,
never to CAR-OPS 1. If you find a citation to CAR-OPS 1 anywhere in this
repo, it is a bug — file it.

### Scope — fixed-wing only

Only **ORO.FTL.100.G–270.G** applies to this project (Emirates
A350/A380, fixed-wing, DXB-based). **ORO.FTL.300.G–395.G is a separate
helicopter rule set** and must never be cited here, even though it lives
in the same document.

## Rule -> clause -> implementation map

| # | Rule area | Exact clause | Implementation |
|---|---|---|---|
| 1 | Acclimatisation | ORO.FTL.115.G(1) | `src/ftl/rules/acclimatisation.ts` |
| 2 | Max FDP, Table A (acclimatised) / Table B (not acclimatised) | ORO.FTL.255.G(c), page 444 of 461 | `src/ftl/rules/fdpTables.ts` |
| 3 | Two-pilot sector-length factoring | ORO.FTL.260.G | `src/ftl/rules/sectorFactoring.ts` |
| 4 | Commander's discretion | ORO.FTL.230.G | `src/ftl/rules/discretion.ts` (`evaluateCommanderDiscretion`) |
| 5 | Split duty extension | ORO.FTL.220.G | `src/ftl/rules/discretion.ts` (`evaluateSplitDutyExtension`) |
| 6 | In-flight relief / augmented crew rest | ORO.FTL.215.G(e) | `src/ftl/rules/inFlightRest.ts` |
| 7 | Minimum rest, flight crew | ORO.FTL.225.G | `src/ftl/rules/minRest.ts` |
| 7 | Minimum rest, cabin crew | ORO.FTL.265.G(b) | `src/ftl/rules/minRest.ts` |
| 7a | Local night required after a >18h preceding duty | ORO.FTL.225.G(e) | `src/ftl/rules/minRest.ts` (`evaluateLocalNightAfterExtendedDuty`), `src/ftl/localNight.ts` |
| 8 | Cumulative limits (flight/duty hours) | ORO.FTL.200.G | `src/ftl/rules/cumulativeLimits.ts` |
| 9 | Duty cycle and days off | ORO.FTL.205.G | `src/ftl/rules/daysOff.ts` |

Every `RuleEvaluation` returned by this engine carries a `citation` field
(`src/ftl/types.ts`) with the exact clause, document, URL, and date
consulted above — built via `gcaaCitation()` in `src/ftl/citation.ts` so
the document/URL/date triple is defined in exactly one place.

### RESOLVED (2026-09-19) — "recurrent extended recovery rest" was wrong

Earlier the same day, `gcaa-days-off-extended-recovery-rest`
(`src/ftl/rules/daysOff.ts`) implemented a "recurrent extended recovery
rest" rule (>=36h including >=2 local nights, at least once every 168h)
on **direct pilot confirmation only**, while the primary GCAA PDF (URL
above) was unreachable (serving a ~33KB maintenance-page response instead
of the real multi-MB document). The pilot confirmed GCAA's rule was
"structurally identical" to EASA's own ORO.FTL.235 provision of that same
name — a reasonable basis to build on at the time, but not an
independently re-verified citation.

Once gcaa.gov.ae came back online, the primary PDF was extracted via
`pdftotext` and read in full. **The comparison was wrong**: GCAA's own
`ORO.FTL.235.G` is titled **"Mixed duties"** — an entirely different,
unrelated provision — not a "recurrent extended recovery rest" clause at
all. No 36h/2-local-nights/168h recurring requirement exists anywhere in
GCAA's ORO.FTL.100.G-270.G. That entire sub-check (constants, function,
`evaluateDaysOff` sub-check, `CumulativeTotals` field, and the
`generateMonthlyRoster.ts` anchor-tracking machinery it required) was
**removed**.

What GCAA's real text *does* contain, at **ORO.FTL.225.G(e)** (page ~441
of the primary PDF), is a much simpler, non-recurring rule:

> "If the preceding duty period, which includes any time spent on
> positioning, exceeded 18 hours, then the ensuing rest period must
> include a local night."

— a per-instance trigger, not a monthly cadence. GCAA's own definition of
"local night" (found in the document's definitions section) also differs
from what the pilot had separately confirmed while the source was
unreachable:

> "'Local night': A period of 8 hours falling between 2200 hours and 0800
> hours local time."

This is an 8-hour period *somewhere within* the wider 10-hour 2200-0800
band — not a fixed 22:00-06:00 slice, which is what the earlier
implementation (and the pilot's own good-faith recollection) assumed.
Both are now implemented correctly: `src/ftl/localNight.ts`'s
`restPeriodIncludesLocalNight` checks for >=8h of contiguous overlap with
the 2200-0800 band; `src/ftl/rules/minRest.ts`'s
`evaluateLocalNightAfterExtendedDuty` implements the real (e) trigger. See
docs/roster-gen-assumptions.md item 28 for the full implementation
history, including item 27 (the original, incorrect implementation),
which is marked superseded in place rather than deleted.

**Lesson for this project**: "the user confirmed it's structurally
identical to EASA" is a reasonable basis to ship on when the primary
source is genuinely unreachable, but it is not a substitute for
independent verification, and should be re-checked at the first
opportunity — exactly as this file's own process required. GCAA's clause
numbering and content have already been shown to diverge from EASA's
elsewhere in this project (see the fdpTables.ts re-verification note
below): `ORO.FTL.235.G` is the clearest example yet.

## OPERATOR_SPECIFIC — explicitly NOT publicly available

`src/ftl/rules/operatorSpecific.ts` implements three placeholder checks
for items that are **not** in the public GCAA text and must never be
guessed or silently treated as pass/fail:

1. **Emirates' ULR FTL Variation scheme.** Any Emirates-specific FTL
   Variation approved for actual A380/A350 ultra-long-range routes (under
   a confidential GCAA risk-assessment process) — the resulting extended
   FDP limits, specific augmented-crew configurations (e.g. 3 vs. 4
   pilots), and route-specific rest-facility requirements are not public.
   (`evaluateUlrFtlVariationScheme`)
2. **A more granular augmented-crew-rest table.** GCAA's public text gives
   only the fraction-of-rest formula in ORO.FTL.215.G(e) (bunk = half of
   rest taken, seat = a third, each capped by role). It does **not**
   publish a discrete "augmented crew count x rest facility class -> max
   FDP" table. If Emirates uses something more granular operationally,
   it's inside their non-public approved scheme.
   (`evaluateAugmentedCrewRestFacilityTable`)
3. **Carrier-specific operational limits.** Maximum pairings per month,
   home-base notification periods, and standby/contactable-period
   definitions are explicitly left to the operator's own (non-public,
   individually approved) scheme by regulation — not published anywhere
   in CAR-AIR OPS Part-ORO.
   (`evaluateOperatorPairingAndStandbyLimits`)

Each function **always** returns `isOperatorSpecific: true`. Without an
explicit operator-configured override it returns `AMBER` ("cannot verify
from public data — configure your operator's actual approved scheme");
with an override it returns `GREEN` and states plainly that the value is
**user-entered, not GCAA-sourced**. These checks are always run by
`evaluateDuty()` in `src/ftl/evaluate.ts` — they are never silently
skipped.

## Judgment calls made during implementation (surfaced, not silent)

- **Table B rest-band boundaries.** The published rows are "Up to 18h, or
  over 30h" and "Between 18h and 30h", leaving the exact treatment of
  precisely 18h and precisely 30h implicit. This implementation treats
  `restHours <= 18` and `restHours > 30` as the first row, and
  `18 < restHours <= 30` as the second. See `fdpTables.ts`.
- **Two-pilot sector-length factoring on multi-sector FDPs.** The public
  text illustrates ORO.FTL.260.G in a single-long-sector context. This
  implementation generalises it to a multi-sector FDP by factoring each
  sector independently and summing the results as the lookup sector
  count. A sector of 7h or less is unaffected and contributes 1. See
  `sectorFactoring.ts`.
- **Split-duty extension beyond 10h rest.** The published table tops out
  at a 10h rest row; this implementation caps the extension at that
  10h-row value rather than extrapolating past the public table. See
  `discretion.ts`.
- **Cumulative limits apply regardless of role.** ORO.FTL.200.G's block-
  and duty-hour ceilings are stated without a flight-crew/cabin-crew
  split in the source text provided to this build, so they are applied
  uniformly. See `cumulativeLimits.ts`.
- **No away-from-base rest reduction modeled for cabin crew.** The source
  text gives an away-from-base 1h reduction (with travel-time surcharge)
  explicitly for flight crew (ORO.FTL.225.G) but no analogous provision
  for cabin crew (ORO.FTL.265.G(b)) was in the verified text, so none is
  implemented. See `minRest.ts`.
- **ORO.FTL.225.G(e) (local night after a >18h preceding duty) modeled as
  flight-crew only.** The clause lives under the flight-crew minimum-rest
  article; no cabin-crew equivalent was found in the verified text. See
  `evaluateLocalNightAfterExtendedDuty` in `minRest.ts`.

## Re-verification note (2026-09-15): `fdpTables.ts`'s sector-column structure

An independent review of the rule engine flagged a plausible concern:
EASA's own equivalent table (ORO.FTL.205/CS-FTL.1.205, publicly confirmed
via the UK CAA Regulatory Library) merges sectors 1 and 2 into a single
first column, with separate columns only from 3 sectors onward — raising
the question of whether GCAA's ORO.FTL.255.G(c) table does the same, which
would make `fdpTables.ts`'s direct `sectors - 1` column indexing off by one
for every sector count from 2 upward.

**Re-checked against the primary source itself**, page 444 of the exact
PDF this project cites (`gcaa.gov.ae`, CAR-AIR OPS Part-ORO Issue 03),
extracted via `pdftotext`. GCAA's actual published tables do **NOT** merge
sectors 1 and 2 — Table A has 8 separate columns (1, 2, 3, 4, 5, 6, 7,
"8 or more"), Table B has 7 separate columns (1, 2, 3, 4, 5, 6, "7 or
more"), confirmed by the exact column headers as published:

```
Table A – Two or more Flight Crew - Acclimatised
                                            Sectors
  Local Time
   of Start      1      2      3      4      5      6      7    8 or more
 06:00-07:59    13    12¼    11½    10¾     10     9½      9        9
 08:00-12:59    14    13¼    12½    11¾     11    10½     10       9½
 13:00-17:59    13    12¼    11½    10¾     10    09½      9        9
 18:00-21:59    12    11¼    10½    9¾       9      9      9        9
 22:00-05:59    11    10¼    09½     9       9      9      9        9

Table B – Two or more Flight Crew - Not Acclimatised
  Length of                                 Sectors
  preceding
 rest (hours)    1      2      3      4      5      6     7 or more
 Up to 18 or
   over 30      13    12¼    11½    10¾     10     9¼        9
 Between 18
   and 30      11½     11    10½    9¾       9      9        9
```

Every value in `TABLE_A_MINUTES`/`TABLE_B_MINUTES` was cross-checked
against this transcription (converting HH:¼/½/¾ to minutes) and matches
exactly, with no off-by-one anywhere. GCAA's table genuinely diverges from
EASA's in this specific structural detail (no 1-2 merge) despite being
closely modeled on it overall — this is not a bug, and `fdpTables.ts`
required no changes. The review's concern was reasonable given EASA's
table structure, but the primary source resolves it in the code's favor.
