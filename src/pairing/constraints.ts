/**
 * Single source of truth for the pairing-search constraints used across the
 * app (docs/pairing-assumptions.md item 10) — previously duplicated as three
 * independent object literals (`UI_PAIRING_CONSTRAINTS` in both
 * `src/app/roster/[year]/[month]/page.tsx` and `actions.ts`, and
 * `ROSTER_GEN_PAIRING_CONSTRAINTS` in `src/roster-gen/db/rosterGen.ts`),
 * which had already drifted into 3 near-identical copies with no compiler
 * check that they stayed in sync. `turnaroundMinMinutes`/
 * `turnaroundMaxMinutes` model a short-haul same-day out-and-back (e.g.
 * DXB-MCT-DXB with ~1-2h ground time) as distinct from a genuine overnight
 * layover — see `PairingSearchConstraints`'s own doc comment in `types.ts`
 * and `generatePairings.ts`'s `isAcceptableGroundTime`.
 */
export const DEFAULT_PAIRING_CONSTRAINTS = {
  maxTripDays: 4,
  turnaroundMinMinutes: 45,
  turnaroundMaxMinutes: 150,
  minLayoverMinutes: 8 * 60,
  maxLayoverMinutes: 48 * 60,
} as const;
