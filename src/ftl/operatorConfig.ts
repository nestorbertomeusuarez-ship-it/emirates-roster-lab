/**
 * Single hardcoded operator-configuration constant for this app.
 *
 * JUDGMENT CALL (logged in full in `docs/roster-gen-assumptions.md`): this
 * is a personal, single-pilot planning tool (see `PLAN.md`'s opening line —
 * "A personal planning tool for an Emirates A350/A380 pilot"), not a
 * multi-tenant product. A settings/config UI for `OperatorSpecificOverrides`
 * would be speculative generality for a fact this pilot already told the
 * assistant directly and is unlikely to change: a small hardcoded constant,
 * imported by the two DB-aware wrappers that call into `src/ftl/evaluate.ts`
 * (`src/roster-gen/db/rosterGen.ts`, and the UI routes that call
 * `evaluateRosterDays` directly), is the correct, explicitly-scoped-down
 * solution. `OperatorSpecificOverrides` itself stays a general type (see
 * `src/ftl/types.ts`) — only this file's wiring is single-user-specific, so
 * a future multi-pilot version of this tool would only need to replace this
 * one file, not the type or the evaluators.
 *
 * The values below are this pilot's own confirmed facts, given directly
 * this session (not GCAA-sourced, not guessed):
 *
 * - `maxPairingsPerMonth: 'none'` — no maximum-pairings-per-month cap
 *   applies to this pilot's roster. This is the explicit operator-confirmed
 *   sentinel (see `src/ftl/types.ts#OperatorSpecificOverrides`), not just an
 *   unconfigured/unknown value — it resolves
 *   `operator-pairing-and-standby-limits` to GREEN with an
 *   "operator confirmed" message rather than leaving it AMBER.
 * - `standbyContactablePeriodDefinition: 'not_used'` — standby duty is not
 *   part of this pilot's actual roster at all. Same sentinel pattern.
 * - `ulrFtlVariationMaxFdpMinutes` / `augmentedCrewRestFacilityMaxFdpMinutes`
 *   are deliberately left `undefined`. This pilot's augmented-crew size (3
 *   vs. 4 pilots) varies by route and has no fixed default — the pilot
 *   explicitly declined to set one, so these two checks correctly stay
 *   AMBER (with the EASA/UK-CAA proxy figures cited in the message, see
 *   `src/ftl/rules/operatorSpecific.ts`) until a specific route's crew size
 *   is known and a per-route override is supplied. Do not hardcode a
 *   default crew size here.
 */

import type { OperatorSpecificOverrides } from './types';

export const EMIRATES_OPERATOR_CONFIG: OperatorSpecificOverrides = {
  maxPairingsPerMonth: 'none',
  standbyContactablePeriodDefinition: 'not_used',
};
