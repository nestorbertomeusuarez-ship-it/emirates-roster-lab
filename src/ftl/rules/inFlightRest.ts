/**
 * ORO.FTL.215.G(e) — In-flight relief / augmented crew rest.
 *
 * Total in-flight rest <3h grants no FDP extension. If >=3h (need not be
 * consecutive), the extension is ADDITIVE to the un-augmented (table-derived)
 * base FDP, capped by an absolute facility/role ceiling:
 * - Bunk/equivalent flat-bed seat: extended FDP = base FDP + 1/2 of total
 *   rest taken, capped at 18h (flight crew) / 19h (cabin crew).
 * - Reclining seat (not flat-bed): extended FDP = base FDP + 1/3 of total
 *   rest taken, capped at 15h (flight crew) / 16h (cabin crew).
 *
 * See `docs/roster-gen-assumptions.md` item 18: an earlier version of this
 * function compared `plannedFdpMinutes` directly against the absolute
 * ceiling alone (omitting the base FDP entirely), which was too permissive
 * — it approved any FDP under the ceiling regardless of how little rest was
 * actually taken. Fixed to require the caller's own base-FDP-table figure.
 */

import type { CrewRole, InFlightRestFacility, RuleEvaluation } from '../types';
import { gcaaCitation } from '../citation';

export const IN_FLIGHT_REST_CITATION = gcaaCitation(
  'gcaa-in-flight-rest',
  'ORO.FTL.215.G(e)'
);

const MIN_REST_FOR_EXTENSION_MIN = 3 * 60;

const FDP_CAP_MIN: Readonly<
  Record<'BUNK' | 'SEAT', Record<CrewRole, number>>
> = {
  BUNK: { FLIGHT_CREW: 18 * 60, CABIN_CREW: 19 * 60 },
  SEAT: { FLIGHT_CREW: 15 * 60, CABIN_CREW: 16 * 60 },
};

export interface InFlightRestInput {
  /** The FDP length being evaluated (already including any augmentation). */
  plannedFdpMinutes: number;
  /** Total in-flight rest achieved; need not be consecutive. */
  totalRestMinutesTaken: number;
  facility: InFlightRestFacility;
  role: CrewRole;
  /**
   * The un-augmented maximum FDP for this duty from the FDP tables
   * (`fdpTables.ts#maxFdpMinutes`, Table A/B) — the base the rest-derived
   * extension is added to. ORO.FTL.215.G(e)'s extension is additive to the
   * base FDP, not a magnitude compared directly against the absolute
   * facility/role ceiling on its own (see this module's fix history —
   * `docs/gcaa-sources.md`/`docs/roster-gen-assumptions.md` item 18 for why
   * this parameter exists).
   */
  baseFdpMinutes: number;
}

/**
 * Evaluates an augmented-crew FDP against ORO.FTL.215.G(e): computes the
 * allowed extension/cap from rest taken and facility, then compares
 * `plannedFdpMinutes` against it.
 */
export function evaluateInFlightRest(
  input: InFlightRestInput
): RuleEvaluation {
  const { plannedFdpMinutes, totalRestMinutesTaken, facility, role, baseFdpMinutes } = input;

  if (!Number.isFinite(plannedFdpMinutes) || plannedFdpMinutes < 0) {
    throw new Error(
      `evaluateInFlightRest: plannedFdpMinutes must be a non-negative finite number (got ${plannedFdpMinutes})`
    );
  }
  if (
    !Number.isFinite(totalRestMinutesTaken) ||
    totalRestMinutesTaken < 0
  ) {
    throw new Error(
      `evaluateInFlightRest: totalRestMinutesTaken must be a non-negative finite number (got ${totalRestMinutesTaken})`
    );
  }
  if (!Number.isFinite(baseFdpMinutes) || baseFdpMinutes < 0) {
    throw new Error(
      `evaluateInFlightRest: baseFdpMinutes must be a non-negative finite number (got ${baseFdpMinutes})`
    );
  }

  if (totalRestMinutesTaken < MIN_REST_FOR_EXTENSION_MIN) {
    return {
      citation: IN_FLIGHT_REST_CITATION,
      severity: 'GREEN',
      message: `In-flight rest taken (${totalRestMinutesTaken} min) is under 3h: no FDP extension applies under this rule.`,
    };
  }

  if (facility === 'NONE') {
    return {
      citation: IN_FLIGHT_REST_CITATION,
      severity: 'RED',
      message: `${totalRestMinutesTaken} min of in-flight rest is claimed but no rest facility (bunk or reclining seat) was recorded.`,
    };
  }

  const divisor = facility === 'BUNK' ? 2 : 3;
  const extensionMinutes = totalRestMinutesTaken / divisor;
  const capMinutes = FDP_CAP_MIN[facility][role];
  // The extension is additive to the BASE (un-augmented, table-derived) FDP,
  // capped by the absolute facility/role ceiling — ORO.FTL.215.G(e)'s "max
  // FDP" figures (18h/19h bunk, 15h/16h seat) are the absolute ceiling the
  // extended FDP can never exceed, not a floor the extension is computed
  // from. Comparing `plannedFdpMinutes` against `capMinutes` alone (as this
  // function used to) is too permissive: it approves any FDP under the
  // ceiling regardless of how little rest was actually taken.
  const maxAllowedFdpMinutes = Math.min(baseFdpMinutes + extensionMinutes, capMinutes);

  if (plannedFdpMinutes > maxAllowedFdpMinutes) {
    return {
      citation: IN_FLIGHT_REST_CITATION,
      severity: 'RED',
      message: `Planned FDP (${plannedFdpMinutes} min) exceeds the base FDP (${baseFdpMinutes} min) plus the ${facility === 'BUNK' ? 'bunk/flat-bed' : 'reclining-seat'} in-flight-rest extension for ${role} (${extensionMinutes} min from ${totalRestMinutesTaken} min rest taken), capped at ${capMinutes} min — allowed maximum is ${maxAllowedFdpMinutes} min.`,
      marginMinutes: maxAllowedFdpMinutes - plannedFdpMinutes,
    };
  }

  return {
    citation: IN_FLIGHT_REST_CITATION,
    severity: 'GREEN',
    message: `Planned FDP (${plannedFdpMinutes} min) is within the base FDP (${baseFdpMinutes} min) plus the ${facility === 'BUNK' ? 'bunk/flat-bed' : 'reclining-seat'} in-flight-rest extension for ${role} (${extensionMinutes} min from ${totalRestMinutesTaken} min rest taken), capped at ${capMinutes} min — allowed maximum is ${maxAllowedFdpMinutes} min.`,
    marginMinutes: maxAllowedFdpMinutes - plannedFdpMinutes,
  };
}
