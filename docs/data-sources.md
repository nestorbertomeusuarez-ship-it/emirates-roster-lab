# Data sources

> This document must be kept dated and re-verified periodically, since API
> pricing/access models change. **Last verified: 2026-09-14.**

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
