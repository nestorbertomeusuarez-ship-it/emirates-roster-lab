# Data sources

> This document must be kept dated and re-verified periodically, since API
> pricing/access models change. **Last verified: 2026-09-15.**

## 2026-09-15 A380 correction/expansion pass

The pilot user supplied a fuller, authoritative list of Emirates' current
A380 destinations from DXB directly (higher-confidence than the earlier
web-research pass, same status as the A350 list that seeded Part A).
`scripts/gen-seed-data.mjs` was updated (not the generated JSON by hand —
see that file's header) to:

- Add every route on the user's list not already present as a new A380
  `Flight` row, `confidence: CONFIRMED`, `source: SEED`,
  `sourceRef: "user-supplied 2026-09-15 (authoritative A380 destination
  list)"`.
- Upgrade every pre-existing A380 route reaffirmed by this list from
  `ADVERTISED` to `CONFIRMED` (e.g. LHR, JFK, LAX, SFO, IAH, IAD, YYZ, GRU,
  SYD, AKL, MEL, PER, BOM, SIN, BKK, HKG, JNB, CAI). Routes **not** on the
  list (CPH, PRG) were left untouched — still `ADVERTISED`/volatile.
- Add A380 rows for airports that already had an A350 route and are now
  also confirmed as A380 (multi-type routes, same pattern as the
  pre-existing BOM/CPH dual rows): TPE, AMM, JED, LGW, FCO, KUL.

**Explicit reconciliations (judgment calls):**

- **Brisbane (BNE)** — the earlier A350 BNE row was flagged as a CONFLICT
  (user's original A350 list said A350; research found it more commonly
  A380). The 2026-09-15 list confirms BNE as A380 and does not list it
  under A350. Resolution: the A350 BNE row's confidence was **downgraded
  from ADVERTISED to UNKNOWN** (kept for history, not deleted) with a note
  explaining it is superseded; a new **CONFIRMED** A380 BNE row was added.
- **Osaka Kansai (KIX)** — already had both an A350 row (CONFLICT/uncertain)
  and an A380 row (`"swapped to 777 in May 2026, uncertain current state"`).
  The 2026-09-15 list reconfirms A380. The A380 KIX row was upgraded to
  **CONFIRMED** with an updated note; the A350 KIX row's original CONFLICT
  note was **left untouched** — history is preserved, not erased.
- **Glasgow (GLA)** — research had flagged `"reported swapped to
  777-300ER in May 2026, unclear if reverted"`. The 2026-09-15 list
  reaffirms Glasgow as A380, resolving that uncertainty. Upgraded to
  **CONFIRMED**, note updated to record the resolution.
- **Milan Malpensa (MXP)** — research had flagged
  `"frequency reportedly halved May 2026 ... current capacity uncertain"`.
  The 2026-09-15 list (just "Milan", interpreted as MXP, the airport
  already in the seed) reaffirms it is still served. Upgraded to
  **CONFIRMED**, note softened to reflect the more current information.
- **Amman (AMM)** — already flagged as a known multi-type route
  (A350/777/A380 all reported on different frequencies). The 2026-09-15
  list's inclusion of Amman under A380 is corroborating evidence for that
  existing multi-type note, not a conflict — a new CONFIRMED A380 AMM row
  was added and the existing A350 AMM note updated to reference it.
- **Taipei (TPE)** — already CONFIRMED as A350 (1 May 2026 launch). The
  2026-09-15 list also lists Taipei under A380. Not a conflict — a route
  can carry both an A350 and an A380 frequency (same pattern as BOM) — so a
  new CONFIRMED A380 TPE row was added alongside the existing A350 row.

Newly-referenced airports not already in `src/ingest/data/airports-reference.json`
were added with real IATA/ICAO/lat/lon/IANA-timezone data: AMS, BCN, BHX,
DUS, MAD, SVO, NCE, VIE, ZRH, DPS, BLR, CHC, ICN, PVG, NRT, CMN, MRU (FRA,
MAN and CDG were already present in the reference file from an earlier
pass and did not need re-adding).

After this pass: 50 A380 routes (up from 23) and 31 A350 routes, 162 flight
records total, 73 airports. Re-running `npx prisma db seed` upserts
cleanly — confirmed non-destructive to existing `RosterMonth`/`Pairing`
rows from prior phases. The A380 candidate-pairing pool for the real
October 2026 seeded month grew from the 23-route baseline to 3,142
candidates with the automatic monthly generator still producing 0 RED
evaluations for both fleets.

## 2026-09-19 A350 quarterly route update

Direct user message: *"New A350 route assignments this quarter include
Kuala Lumpur, Helsinki, Larnaca, Malta, Nairobi, Hamburg, and Mauritius."*

`scripts/gen-seed-data.mjs` updated:

- **5 genuinely new A350 destinations** added as new `Flight` rows,
  `confidence: ADVERTISED` (block times are ENGINEERING ESTIMATES derived
  from great-circle distance, not sourced published schedule times — same
  footing as this file's many pre-existing "reasonable estimate" A350
  rows, e.g. RUH/DEL/ISB/CGK), `source: SEED`, `sourceRef` tagged with the
  new `CONFIRM_2026_09_19` shorthand: **HEL** (Helsinki, ~400min estimate),
  **LCA** (Larnaca, ~210min), **MLA** (Malta, ~310min), **NBO** (Nairobi,
  ~285min), **HAM** (Hamburg, ~380min).
- **MRU (Mauritius)** added as a new A350 row — already existed as a
  CONFIRMED A380 route from the 2026-09-15 pass; the new A350 row reuses
  that same 325min block time for consistency (a real multi-type route,
  same pattern as KUL/BOM/TPE), `confidence: CONFIRMED`.
- **KUL (Kuala Lumpur)** — already an existing A350 route (multi-type with
  A380, `ADVERTISED`) — reconfirmed and upgraded to `CONFIRMED` per this
  message, note updated (original ADVERTISED note preserved, not deleted).
- The A350 loop's `sourceRef` generation gained a `route.sourceBase ??`
  override (mirroring the A380 loop's pre-existing `CONFIRM_2026_09_15`
  mechanism) so per-route dated confirmations no longer have to share one
  fixed baseRef string.
- 5 new airports added to `src/ingest/data/airports-reference.json`: HEL
  (EFHK, Europe/Helsinki), LCA (LCLK, Asia/Nicosia), MLA (LMML,
  Europe/Malta), NBO (HKJK, Africa/Nairobi), HAM (EDDH, Europe/Berlin) —
  real public IATA/ICAO/coordinate/timezone facts, not flight-schedule
  data, so not held to the same sourcing bar as block times.
- `src/lib/airportCityNames.ts` updated with the 5 new city labels
  (KUL/MRU were already present).

After this pass: 37 A350 routes (up from 31), 174 flight records total, 78
airports. `npx tsx prisma/seed.ts` run against the live dev DB: 5 airports
created, 12 flights created, 162 flights updated (upsert, confirmed
non-destructive to existing `RosterMonth`/`Pairing`/`RosterEntry` rows —
`src/ingest/writeToDb.ts` never deletes). Real read-only
`generatePairingsForMonth` check confirmed all 7 destinations produce real
candidate pairings for the live Oct 2026 A350 schedule (59-61 candidates
each). Real read-only `buildMonthlyRosterForFleet` check: 0 RED both
fleets after the update.

## 2026-09-19 real STD/STA times pass

Direct user message: *"las horas STD deben ser reales, investigalas y
aplicalas a todos los pairings"* — the previously-cosmetic departure times
(`stdForRoute()`'s deterministic pseudo-hash, explicitly documented as
having no bearing on pairing-engine correctness) should be replaced with
real, researched STD/STA times across all pairings. Asked how to source
this given Emirates.com is excluded (see "Sources explicitly excluded"
below); the user chose **web search research** over other options.

86 A350/A380 routes were researched in parallel (6 forks, to keep raw
search output out of the main conversation) against real third-party
schedule aggregators — never Emirates.com. Results came back at mixed
confidence. Asked how to apply a mixed-quality result set, the user chose
**"only high/medium-high confidence routes"** — the remainder stay on the
existing synthetic `stdForRoute()` hash, honestly left as still-synthetic
rather than applying a low-confidence real-looking number that could be
wrong.

### What changed

`scripts/gen-seed-data.mjs` gained a `stdOutLocal`/`stdRetLocal` (local
HH:MM at each station, resolved to UTC via each airport's real IANA
timezone — see `localHHMMToUTCMinutes`/`utcOffsetMinutesAt` and the new
`REPRESENTATIVE_DATE_FOR_DST = '2026-10-15'` constant, since this
generator only ever seeds the one representative month) applied to **28
of the 86 researched routes** (the high/medium-high-confidence subset):

- **8 A350 routes**: KWI (01:25/03:40), EDI (14:50/20:55), OSL
  (07:30/14:35), HEL (08:45/16:45), CMB (16:10/02:55), AMD (22:50/09:50),
  ADL (02:00/22:35), TPE (03:45/23:50).
- **20 A380 routes**: JFK (08:30/23:00), LAX (08:00/16:40), SFO
  (08:25/17:00), IAH (09:30/19:35), IAD (01:40/10:55), YYZ (03:30/14:55),
  SYD (02:00/20:45), MEL (03:00/21:15), PER (02:45/22:20), JNB
  (04:05/13:40), CAI (20:55/00:50), KUL (03:40/02:00), PVG (02:50/00:05),
  MRU (03:28/21:50), LHR (07:45/13:40), CPH (08:20/15:15), GLA
  (07:50/14:20), FRA (15:20/15:15), NCE (08:40/15:40), ZRH (15:00/22:00).

Every applied route's `sourceRef` note is tagged with the shared
`REAL_STD_NOTE` constant, spelling out the exact sourcing/confidence bar
and the DST caveat. The remaining ~58 researched routes are left
unchanged on the synthetic hash — not a data-loss, a deliberate
confidence-gated decision.

### Structural findings surfaced, deliberately NOT auto-applied

Three findings came back from the research pass that call the underlying
route MODEL itself into question, not just its STD time — applying a real
STD to a route whose basic shape might be wrong would have been worse
than leaving it synthetic, so none of these were acted on:

- **SVO (Moscow Sheremetyevo)** — a research fork flagged uncertainty over
  whether SVO is still Emirates' actual Moscow gateway (vs. DME/VKO) as of
  Sept 2026; the existing `airports-reference.json`/route entry was left
  exactly as-is (see the pre-existing `note: 'Sheremetyevo — Emirates'
  typical Moscow gateway'` in `gen-seed-data.mjs`), no STD applied.
- **CHC (Christchurch)** — already documented in this generator's own
  file-header judgment-call note as modeled as one representative direct
  daily line for convenience, when in reality Emirates routes CHC via
  SYD/AKL, not nonstop from DXB; the research pass reconfirmed this is
  still the case, so it stays unchanged (no STD applied to a nonstop
  service that doesn't actually exist).
- **LCA/MLA (Larnaca/Malta)** — a research fork raised the possibility
  these two brand-new-this-quarter routes might actually be one shared
  tag-on rotation (DXB-LCA-MLA-DXB or similar) rather than two independent
  nonstop pairs, given their geographic proximity and simultaneous launch.
  Not confirmed either way, so both routes were left on their original
  engineering-estimate block times with no real STD applied (see the
  2026-09-19 A350 quarterly route update section above).

### Live DB

`npx tsx prisma/seed.ts`: 0 airports created (this pass adds no new
destinations, only enriches existing ones — the 5 airports from the
quarterly route update were already seeded), 51 flights created, 123
updated. Because `Flight`'s natural key includes `stdUTCMin`
(`prisma/schema.prisma`), giving an existing route a new real STD created
a NEW row rather than updating in place, leaving the 5 routes that
already had a live-referenced old row (DXB-CPH, CPH-DXB, KUL-DXB,
DXB-PVG, MRU-DXB) with an orphaned duplicate. Verified each stale row had
**zero** `RosterEntry` references (only referenced by already-orphaned
`Pairing` rows from earlier candidate-generation runs) before deleting:
4 orphaned `Pairing` rows (cascading their `PairingLeg`s), then 155
now-unreferenced `FlightInstance` rows, then the 5 stale `Flight` rows
themselves. Final `Flight` count: 174, matching
`dxb-seed-schedule.json` exactly. Confirmed the real Oct 2026
`RosterEntry` rows (17 total; only 3 are `FLIGHT` days this early in the
month, the rest `OFF` with a null `pairingId` by schema design) still
resolve correctly, and a real read-only `buildMonthlyRosterForFleet`
check shows 0 RED for both fleets. Full suite 342/342 passing after this
pass (see the separate `fix(ftl)` commit for why the count differs from
the 344 recorded in the previous section — an unrelated FTL rule
correction landed between these two passes).

## Sources in use

1. **Manual CSV/JSON import** — primary, always-available, zero
   dependencies. See `docs/schema-import.md`. This is the only source that
   can ever produce a `CONFIRMED` observed aircraft type (see below).
2. **AeroDataBox (RapidAPI)** — optional, self-serve free tier (600
   request-units/month, roughly ~2,400 requests/month depending on the
   specific endpoint's unit cost), gives route/times and *advertised*
   aircraft type only. The app runs fully without it.

## Sources explicitly excluded, and why

- **Emirates.com** — the Terms of Conditions explicitly forbid automated
  access: "Direct bots, spiders, crawlers, avatars, intelligent agents, or
  any other automated process at Emirates' computer systems..." is
  prohibited, alongside a separate prohibition on copying, reproducing, or
  creating derivative works from site content. `robots.txt` also disallows
  the relevant booking/flight-status endpoints
  (`Disallow: /*flightstatus-results.aspx?`, `Disallow: /booking/*`).
  Source: https://www.emirates.com/us/english/information/terms-and-conditions/
  and https://www.emirates.com/robots.txt (verified 2026-09-14).
- **OAG (oag.com)** — enterprise/quote-based sales only, no published
  self-serve pricing suitable for a personal project.
  Source: https://developers.oag.com/
- **Cirium** — same pattern as OAG: enterprise-oriented, no transparent
  self-serve free tier. Source: https://developer.cirium.com/
- **FlightRadar24** — the free API was discontinued (shutdown communicated
  for ~April 30 2026); the current API is enterprise-priced, and scraping
  the site is also ToS-prohibited.
  Source: https://fr24api.flightradar24.com/ and FlightRadar24 community
  forum shutdown notices.

## The advertised-vs-observed aircraft type gap

Emirates' A350 rollout is gradual — routes advertised/scheduled as A350
frequently still operate with 777 or A380 on a given day. No compliant,
accessible automated source reliably distinguishes "advertised/scheduled
type" from "actually operated type" at scale: ADS-B-derived tracking
history from FlightRadar24/AeroDataBox can occasionally reveal it, but it
isn't a structured guaranteed field, and FR24's API is no longer viably
free for this purpose.

This app models the gap explicitly via three fields on `Flight`
(`prisma/schema.prisma`): `advertisedType`, `observedType`, `confidence`.
The **only** path to a `CONFIRMED` `observedType` is manual human
curation — the pilot's own knowledge, published rollout-schedule articles,
or an occasional manual (non-automated) spot-check of a public
flight-tracking site in a browser.

The AeroDataBox adapter (`src/ingest/sources/aerodatabox.ts`) is coded so
it can **never** itself produce a `CONFIRMED` record: its mapper function
has no code path that sets `observedType` to anything but `undefined`, or
`confidence` to anything but `'ADVERTISED'`. This is enforced by
construction, not just by convention — see the `NON-NEGOTIABLE INVARIANT`
comment directly above `mapAeroDataBoxResponseToRawFlights`.

## Coverage & limits summary

| Source            | Cost                | Gives advertised type | Gives observed type | Rate/volume limit |
|--------------------|---------------------|------------------------|-----------------------|--------------------|
| Manual CSV/JSON    | free                | yes (as entered)       | yes (as entered, human-sourced) | none — local files |
| AeroDataBox (RapidAPI) | free tier available | yes | never (forced `undefined`) | ~600 request-units/month on the free tier |
| Emirates.com       | excluded — ToS-prohibited | n/a | n/a | n/a |
| OAG / Cirium       | excluded — enterprise-only, no self-serve pricing | n/a | n/a | n/a |
| FlightRadar24      | excluded — free API discontinued, scraping ToS-prohibited | n/a | n/a | n/a |

## Data provenance field reference

Every `Flight` row carries provenance metadata (see `prisma/schema.prisma`):

- **`source`** — one of `MANUAL_CSV`, `MANUAL_JSON`, `AERODATABOX`, `SEED`.
  Which ingest pipeline produced this row.
- **`sourceRef`** — free-text pointer back to the origin (e.g. a CSV `notes`
  value, or `"aerodatabox"` for API-sourced rows).
- **`capturedAt`** — timestamp of when this row was last written/refreshed
  by an ingest run.
- **`confidence`** — `CONFIRMED` | `ADVERTISED` | `UNKNOWN`. What kind of
  claim `observedType` (if present) actually represents. See
  `resolveConfidence` in `src/ingest/sources/manualShared.ts` for the exact
  default-resolution rules, and the deviation note in
  `prisma/schema.prisma` for why this is a `String` column rather than a
  Prisma enum (SQLite does not support native enums).

## 2026-09-23 structural findings follow-up

Re-researched the three structural findings above ("Structural findings
surfaced, deliberately NOT auto-applied"). Evidence is web-search based
(airline/aggregator pages), dated 2026-09-23.

- **SVO -> DME: APPLIED.** Aggregator schedule data (flightconnections.com
  DXB-DME/DME-DXB, Aug 2026: 14/21 weekly, Emirates the only nonstop
  operator) and AeroRoutes (2026-04-07, "Emirates Restores Additional
  Moscow Flights", Moscow-Domodedovo A380 daily + 777-300ER) both place the
  Emirates nonstop Moscow service at **DME**, not SVO. The A380 route row
  in `scripts/gen-seed-data.mjs` now targets DME (EK475/EK476), and DME
  (UUDD, Europe/Moscow) was added to `airports-reference.json`. SVO stays in
  the reference file (append-only), unreferenced by any flight. Block time
  (305min) is carried over from the SVO estimate, not sourced; the STD
  remains synthetic. Guarded by `src/ingest/seedSchedule.test.ts`.
- **LCA/MLA: CONFIRMED as one tag-on rotation, NOT modeled.** Emirates
  operates DXB-LCA-MLA with fifth-freedom rights on LCA-MLA (EK109/EK110;
  emirates.com LCA-MLA route page, aviator.aero "Emirates restarts flights
  to Malta via Larnaca", simpleflying "Emirates To Resume Daily Service To
  Malta"; summer 2026 EK109 LCA 12:15 -> MLA 14:00 on 777-300ER). The seed
  still models two independent DXB nonstops. Modeling it properly needs a
  pairing-engine change: `generatePairings` applies `minLayoverMinutes`
  (8h) to every connection, so a ~1h tag-on turnaround at LCA can never
  chain, and FTL would need to treat it as a multi-sector FDP. Deferred as
  its own feature by user decision (2026-09-23) rather than risking the FTL
  evaluation of a real roster. The observed 777-300ER equipment also
  conflicts with the A350 fleet assignment from the 2026-09-19 quarterly
  update; unresolved.
- **CHC: CONFIRMED not a DXB nonstop, NOT modeled.** EK412/EK413 operate
  as a SYD-CHC-SYD A380 tag-on of the Dubai-Sydney service (FlightAware,
  Executive Traveller). One source (flightmapper) suggests that from
  2026-10-04 EK413 no longer routes via CHC, i.e. the CHC tag may not operate
  in October 2026 at all. Low confidence; same tag-on engine limitation as
  LCA/MLA. The fictional DXB-CHC nonstop row is kept as-is with its
  existing judgment-call note.

## 2026-09-24 turnaround-route seed regeneration

Direct user feedback (an actual line pilot): several short-haul DXB
destinations were unrealistically modeled as multi-day layovers rather than
same-day turnarounds. Following the new turnaround ground-time window
(docs/pairing-assumptions.md item 10), `scripts/gen-seed-data.mjs` now flags
`turnaround: true` on every route with a block time <= 210min: **BAH, KWI,
JED, RUH, DMM, MCT, AMM, BGW, BOM, DEL, ISB, AMD, CAI, BLR** (JED/AMM/BOM
flagged on both their A350 and A380 rows).

Two deliberate deviations from a strict "block <= 210min" reading, both
`turnaround: true` was NOT applied:

- **LCA excluded** despite its 210min A350 block. `docs/data-sources.md`'s
  2026-09-23 entry already documents the DXB-LCA-MLA real-world tag-on
  rotation as its own deferred feature ("Deferred as its own feature by
  user decision") — flagging the plain DXB-LCA nonstop as a turnaround here
  would silently pre-empt that separate decision. Left as an ordinary
  layover-shaped connection (still 8h+ ground either way — see
  `seedSchedule.test.ts`'s own assertion for this route).
- **BLR included** despite not appearing on the task's own suggested route
  list — it independently qualifies (A380, 210min block) and there is no
  competing feature it would conflict with, so it was added rather than
  silently dropped for not matching the suggested list verbatim.

For every flagged route WITHOUT a real researched `stdOutLocal`/
`stdRetLocal` pair (12 of 14: BAH, JED, RUH, DMM, MCT, AMM, BGW, BOM, DEL,
ISB, CAI, BLR), the return leg's synthetic STD is now DERIVED as
`(outbound STD + outbound block + 75min) mod 1440` instead of the old
unrelated pseudo-random hash — a real 75min quick-turn ground time, handling
UTC-midnight rollover via the modulo (both legs recur daily, see
`src/pairing/expandScheduleToInstances.ts`).

**KWI and AMD keep their real 2026-09-19-researched `stdOutLocal`/
`stdRetLocal` untouched**, per this item's own scope decision (a route with
real published times is kept as-is, only documented, never overridden by a
synthetic derivation). The generator now prints each turnaround route's
actual computed ground time for human review:

```
[turnaround] BAH: 75min ground
[turnaround] KWI: 105min ground
[turnaround] JED: 75min ground
[turnaround] RUH: 75min ground
[turnaround] DMM: 75min ground
[turnaround] MCT: 75min ground
[turnaround] AMM: 75min ground
[turnaround] BGW: 75min ground
[turnaround] BOM: 75min ground
[turnaround] DEL: 75min ground
[turnaround] ISB: 75min ground
[turnaround] AMD: 405min ground — OUTSIDE the 45-150min turnaround window, kept as-is per real published times, see docs/data-sources.md
[turnaround] BOM: 75min ground
[turnaround] CAI: 95min ground
[turnaround] AMM: 75min ground
[turnaround] JED: 75min ground
[turnaround] BLR: 75min ground
```

**KWI's real times happen to land inside the turnaround window** (105min
ground — a genuine real-world quick turn). **AMD's real times do NOT**
(405min — neither a turnaround nor the ordinary 8h+ layover minimum; the
existing pairing engine still connects it via the NEXT day's return
occurrence, ~30h later, an ordinary overnight layover shape unaffected by
this item). Both are documented, not forced, per this item's scope decision.

Regenerating via `node scripts/gen-seed-data.mjs` changed 14 of the 15
turnaround-flagged return-leg records' `stdUTCMin`/`staUTCMin` (one, by
coincidence of the old pseudo-random hash, already landed inside the
turnaround window and its bytes are unchanged); no route was added,
removed, or reassigned between fleets. Guarded by
`src/ingest/seedSchedule.test.ts`'s new `DXB seed schedule — turnaround
routes` suite. The dev database was NOT reseeded by this change — see this
task's own scope note; `prisma db seed` still needs to be run manually
before the new turnaround schedule appears in any live roster generation.
