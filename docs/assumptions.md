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
