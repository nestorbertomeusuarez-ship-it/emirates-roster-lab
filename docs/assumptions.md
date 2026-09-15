# Assumptions

This file tracks every assumption made anywhere the app doesn't have
sourced, dated, confirmed data to fall back on. Every entry must say which
phase introduced it, and be updated (not silently deleted) if it's ever
confirmed or changed.

Phase 1 (data ingestion) introduces no scheduling/pay/compliance
assumptions of its own — its only judgment calls are documented as
deviations directly in code (see `prisma/schema.prisma` for the SQLite/enum
deviation) and in the top-level `PLAN.md` deviation log, not here, because
they are implementation-shape decisions rather than assumptions about
real-world operating rules.

Assumptions will be added here as later phases introduce them.

Phase 2 (pairing engine + manual roster constructor) introduced several
judgment calls about real-world operating behavior — the default report
time (STD − 90 min), the UTC-vs-local-day reading of `daysOfWeek`, the
same-aircraft-type-per-pairing assumption, the default 2-pilot/no-
augmented-crew assumption when bridging to Phase 3's `evaluateDuty()`, the
FDP start/end boundary convention, and two implementation-shape decisions
(manual-constructor-not-drag-and-drop; only-assigned-pairings-persisted).
All logged in full, with reasoning, in `docs/pairing-assumptions.md` rather
than here, to keep this file's Phase 1 header (which points readers to
deviation logs vs. assumption logs) accurate as the two document types
diverge by phase.

Phase 4 (automatic monthly roster generator) introduced its own set of
judgment calls — the single-month-history limitations (12-month rolling
block time, the days-off-in-N-days window checks), the always-acclimatised
simplification, the generator's own construction-heuristic constants (not
new GCAA numbers), the layover-day-counts-as-duty-day reading, the
rest-location inference at pairing boundaries, the never-rest-checking-the-
first-duty-of-the-month limitation, deterministic (not true-random)
candidate ordering, and the FLIGHT/OFF-only auto-assignment scope. All
logged in full, with reasoning, in `docs/roster-gen-assumptions.md`.

Phase 5 Slice 1 (roster-state reconstruction plumbing, no UI) extended
Phase 4's evaluator to a second input source: a roster reconstructed from
what's actually PERSISTED in the DB (`src/roster-gen/db/loadRosterGenDays.ts`),
not just a freshly-generated one. This introduced one further judgment
call — non-FLIGHT duty types (STANDBY/SIM/GROUND_SCHOOL/VACATION) are
treated as OFF-equivalent for that live re-evaluation — logged as item 11
in `docs/roster-gen-assumptions.md`.

This session's operator-specific-config change (no new phase number — a
correctness fix within Phase 3/4/5's existing scope) introduced two further
judgment calls, logged as items 14-15 in `docs/roster-gen-assumptions.md`:
explicit `'none'`/`'not_used'` confirmation sentinels on
`OperatorSpecificOverrides` (so a pilot's confirmed "no cap"/"standby not
used" facts resolve GREEN instead of staying indistinguishable from
unconfigured AMBER) wired through via one single hardcoded
`src/ftl/operatorConfig.ts` constant (not a settings UI — this tool has
exactly one user); and citing real, verified EASA CS-FTL.1.205(c) figures
(corroborated via the UK CAA Regulatory Library) as an explicit public proxy
in the ULR-FTL-variation-scheme and augmented-crew-rest-facility-table AMBER
messages, without resolving either check to GREEN (no augmented-crew size
default is assumed, per explicit user instruction).
