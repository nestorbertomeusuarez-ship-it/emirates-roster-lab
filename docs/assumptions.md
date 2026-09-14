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

Assumptions will be added here as later phases introduce them — for
example, Phase 2 is expected to add a default report time
(report = STD − 90 min) that will need to be marked here as an assumption,
not confirmed data, until sourced from an actual roster or OM-A extract.
