# GCAA flight/duty-time-limitation (FTL) sources

> **Last verified: 2026-09-14.** Re-verify against the primary source
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
| 2 | Max FDP, Table A (acclimatised) / Table B (not acclimatised) | ORO.FTL.255.G(c) | `src/ftl/rules/fdpTables.ts` |
| 3 | Two-pilot sector-length factoring | ORO.FTL.260.G | `src/ftl/rules/sectorFactoring.ts` |
| 4 | Commander's discretion | ORO.FTL.230.G | `src/ftl/rules/discretion.ts` (`evaluateCommanderDiscretion`) |
| 5 | Split duty extension | ORO.FTL.220.G | `src/ftl/rules/discretion.ts` (`evaluateSplitDutyExtension`) |
| 6 | In-flight relief / augmented crew rest | ORO.FTL.215.G(e) | `src/ftl/rules/inFlightRest.ts` |
| 7 | Minimum rest, flight crew | ORO.FTL.225.G | `src/ftl/rules/minRest.ts` |
| 7 | Minimum rest, cabin crew | ORO.FTL.265.G(b) | `src/ftl/rules/minRest.ts` |
| 8 | Cumulative limits (flight/duty hours) | ORO.FTL.200.G | `src/ftl/rules/cumulativeLimits.ts` |
| 9 | Duty cycle and days off | ORO.FTL.205.G | `src/ftl/rules/daysOff.ts` |

Every `RuleEvaluation` returned by this engine carries a `citation` field
(`src/ftl/types.ts`) with the exact clause, document, URL, and date
consulted above — built via `gcaaCitation()` in `src/ftl/citation.ts` so
the document/URL/date triple is defined in exactly one place.

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
