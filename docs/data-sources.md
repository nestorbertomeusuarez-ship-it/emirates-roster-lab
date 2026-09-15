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
