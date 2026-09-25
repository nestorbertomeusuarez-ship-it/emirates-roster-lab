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
/**
 * Outstations that ONLY ever host a same-day turnaround in real operations,
 * never an overnight layover (docs/pairing-assumptions.md item 11) — the
 * `turnaround: true` stations flagged in `scripts/gen-seed-data.mjs` whose
 * actual (real-published-time or derived) ground time genuinely falls
 * inside the `[turnaroundMinMinutes, turnaroundMaxMinutes]` window below.
 *
 * Deliberately EXCLUDES:
 *   - AMD: kept its real published `stdOutLocal`/`stdRetLocal`
 *     (docs/data-sources.md's 2026-09-19 pass), which give a 405min ground
 *     time — outside the turnaround window. Listing it here would leave AMD
 *     with ZERO valid connections at all (the ordinary layover window is
 *     [480,2880]min, and 405 doesn't fit that either, and it can't reach the
 *     turnaround window with real times unchanged) — see
 *     `src/ingest/seedSchedule.test.ts`'s own documented deviation for AMD.
 * `KWI` (105min) and `CAI` (95min) DO have real/derived ground times inside
 * the window and are correctly included.
 */
export const TURNAROUND_ONLY_STATIONS = [
  'BAH',
  'KWI',
  'JED',
  'RUH',
  'DMM',
  'MCT',
  'AMM',
  'BGW',
  'BOM',
  'DEL',
  'ISB',
  'CAI',
  'BLR',
] as const;

export const DEFAULT_PAIRING_CONSTRAINTS = {
  maxTripDays: 4,
  turnaroundMinMinutes: 45,
  turnaroundMaxMinutes: 150,
  minLayoverMinutes: 8 * 60,
  maxLayoverMinutes: 48 * 60,
  turnaroundOnlyStations: TURNAROUND_ONLY_STATIONS,
} as const;
