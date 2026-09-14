# Emirates Roster Lab — Project Plan

A personal planning tool for an Emirates A350/A380 pilot: eventually
validates monthly duty rosters against GCAA flight-time-limitation rules
and calculates pay. Built in phases; each phase is scoped narrowly and
reviewed before the next begins.

**Permanent banner requirement**: every user-facing surface of this app
(starting from the Phase 5 UI) must display: *"personal planning tool, not
an operational document, does not replace the official roster or the
operator's OM-A."*

## Working rules (apply to every phase)

- **No normative/schedule data from memory.** Anything that claims to
  represent a real-world rule, schedule, or regulation must be sourced and
  dated (see `docs/data-sources.md` for the pattern). If it can't be
  sourced, it's an assumption — see the next rule.
- **Assumptions go in `docs/assumptions.md`.** Every default or judgment
  call about real-world operating behavior (e.g. a default report time)
  must be logged there, not buried silently in code.
- **Seed data requirement.** Every phase that touches the database ships
  with seed data realistic enough to exercise its own logic end-to-end.
- **Permanent banner requirement** (above) — carried forward from Phase 5
  onward once there's a UI to put it on.

## Phase 1 — Scaffold + data ingestion

**Status: complete (this build).**

Next.js/TypeScript scaffold, Prisma schema (SQLite), the ingest module
(manual CSV/JSON + optional AeroDataBox), curated airport reference data,
seed data for a realistic February 2026 DXB schedule (A380 long-haul +
A350 regional/medium-haul with a deliberately mixed advertised/confirmed
type split), and this documentation set.

Deviations from the original spec draft, and why, are logged at the bottom
of this file.

## Phase 2 — Pairing engine

**Status: not started.**

- DXB-based pairing generator built from ingested flights plus constraints
  (fleet, max trip duration, min/max layover).
- Manual drag-and-drop calendar constructor as an alternative/override path.
- Explicit, separate concepts: report time, block time, duty time, FDP,
  rest, layover — not conflated.
- Default report time (STD − 90 min) is an **ASSUMPTION**, not confirmed
  data — must be logged in `docs/assumptions.md` when this phase starts.

## Phase 3 — GCAA rules engine

**Status: rules-engine LIBRARY built and tested (this build). User
sign-off for this phase was given explicitly this session, after a
multi-round research verification pass against the current primary
source (see `docs/gcaa-sources.md`).**

This phase built a **pure, tested library only** — not the pairing
generator (Phase 2, still not started) and not the UI (Phase 5, still not
started). It operates on a minimal, self-contained `FlightDutyPeriod` /
`RestPeriodInput` / `CumulativeTotals` input shape (`src/ftl/types.ts`);
Phase 2 will wire real pairing data into it later.

Done, under `src/ftl/`, zero dependency on `@prisma/client` or
`src/ingest/`:

1. **Acclimatisation** (ORO.FTL.115.G(1)) — `rules/acclimatisation.ts`.
2. **Max FDP tables A/B** (ORO.FTL.255.G(c)) — `rules/fdpTables.ts`.
3. **Two-pilot sector-length factoring** (ORO.FTL.260.G) —
   `rules/sectorFactoring.ts`.
4. **Commander's discretion** (ORO.FTL.230.G) and **split duty extension**
   (ORO.FTL.220.G) — `rules/discretion.ts`.
5. **In-flight relief / augmented crew rest** (ORO.FTL.215.G(e)) —
   `rules/inFlightRest.ts`.
6. **Minimum rest**, flight crew (ORO.FTL.225.G) and cabin crew
   (ORO.FTL.265.G(b)) — `rules/minRest.ts`.
7. **Cumulative limits** (ORO.FTL.200.G) — `rules/cumulativeLimits.ts`.
8. **Duty cycle and days off** (ORO.FTL.205.G) — `rules/daysOff.ts`.
9. **Explicit `OPERATOR_SPECIFIC` placeholders** for what is not publicly
   published (Emirates' confidential ULR FTL Variation scheme, a more
   granular augmented-crew-rest table, carrier-specific pairing/standby
   limits) — `rules/operatorSpecific.ts`. These always return
   `isOperatorSpecific: true` and default to `AMBER` unless the caller
   supplies an explicit operator-configured override.
10. **`evaluateDuty()` / `overallSeverity()`** entry point —
    `evaluate.ts` — runs every applicable rule and produces the
    traffic-light (`GREEN`/`AMBER`/`RED`) result set per duty.
11. Full citation trail and the exact list of `OPERATOR_SPECIFIC` gaps —
    `docs/gcaa-sources.md`. Judgment calls made while encoding the tables
    (e.g. Table B's rest-band boundary handling) are logged there, not
    buried silently in code.

Remaining for later phases (not done here, out of scope for Phase 3):

- **Wiring into real pairing/duty data** — depends on Phase 2 (pairing
  engine), not yet built. This library's `FlightDutyPeriod` shape is
  intentionally minimal/self-contained until then.
- **The traffic-light compliance panel UI** — Phase 5, not yet started.

## Phase 4 — Payroll & metrics

**Status: not started.**

- Configurable pay calculator: block-hour thresholds by month length,
  flying pay vs. productivity pay tiers, call-out pay.
- Monthly dashboard.
- Roster comparator (this roster vs. an alternative/what-if roster).

## Phase 5 — UI

**Status: not started.**

- Monthly calendar view.
- Pairing detail timeline.
- Compliance panel (surfaces Phase 3 output).
- ICS/CSV export.
- This is where the permanent banner requirement (above) first needs to be
  rendered.

---

## Phase 1 deviations from spec (and reasoning)

1. **Prisma pinned to `5.22.0` instead of "latest".** At build time, npm's
   `latest` dist-tag for `prisma`/`@prisma/client` resolved to
   `8.0.0-rc.15`, a pre-release with a substantially different CLI
   (structured JSON output, no `--datasource-provider` flag on `init`,
   config lives in a separate `prisma.config.ts` instead of
   `DATABASE_URL` in `.env`+schema, and a new default `prisma-client`
   generator instead of `prisma-client-js`). That does not match the
   classic setup the spec describes (`prisma init --datasource-provider
   sqlite`, a `schema.prisma` with `url = env("DATABASE_URL")`, a
   `PrismaClient` singleton imported from `@prisma/client`). Pinning to the
   last Prisma 5 release (`5.22.0`, a well-established, non-deprecated
   stable line) reproduces the spec's exact assumed CLI/schema shape with
   zero further adaptation.
2. **`SourceType` and `TypeConfidence` are `String` columns, not Prisma
   `enum`s.** SQLite's Prisma connector does not support native enum types
   (`prisma generate` fails with error P1012: "the current connector does
   not support enums"). This is a hard technical constraint, not a style
   choice. Values are constrained instead at the application layer by the
   matching TypeScript string-literal unions already specified in
   `src/ingest/types.ts` (`RawFlightRecord.confidence`,
   `IngestResult.source`) and validated on every write path. See the
   deviation comment directly in `prisma/schema.prisma`.
3. **`@types/node` bumped from the Next.js scaffold's default `^20` to
   `^24`.** `vitest@5` requires `@types/node@^22 || >=24` as a peer
   dependency; the scaffold's default conflicted and `npm install` refused
   to proceed without `--legacy-peer-deps`. Bumping the type-only
   dependency is a no-risk fix (no runtime Node version implication) and
   avoids weakening npm's dependency resolution globally.
4. **AeroDataBox endpoint path/response shape marked `TODO: verify`.** Per
   the build's own instructions, the exact current RapidAPI endpoint path
   and response JSON shape for AeroDataBox's schedule/route lookups was not
   re-confirmed against live API docs during this build (no live network
   verification was performed as part of this task). The adapter's request
   building and response mapping are implemented as a clearly-marked
   best-effort structure — see the `TODO` comments in
   `src/ingest/sources/aerodatabox.ts` — rather than silently guessing.
   This does not block Phase 1: the app runs fully without an AeroDataBox
   key (manual CSV/JSON is the primary and only exercised path in
   verification), and the adapter's one non-negotiable behavioral
   guarantee (it can never produce a `CONFIRMED` observed type) is enforced
   in code, independent of the exact endpoint shape.
