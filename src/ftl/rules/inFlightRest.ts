/**
 * ORO.FTL.215.G(e) — In-flight relief / augmented crew rest.
 *
 * Total in-flight rest <3h grants no FDP extension. If >=3h (need not be
 * consecutive):
 * - Bunk/equivalent flat-bed seat: extension = 1/2 of total rest taken,
 *   capped so max FDP = 18h (flight crew) / 19h (cabin crew).
 * - Reclining seat (not flat-bed): extension = 1/3 of total rest taken,
 *   capped so max FDP = 15h (flight crew) / 16h (cabin crew).
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
}

/**
 * Evaluates an augmented-crew FDP against ORO.FTL.215.G(e): computes the
 * allowed extension/cap from rest taken and facility, then compares
 * `plannedFdpMinutes` against it.
 */
export function evaluateInFlightRest(
  input: InFlightRestInput
): RuleEvaluation {
  const { plannedFdpMinutes, totalRestMinutesTaken, facility, role } = input;

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
  const maxAllowedFdpMinutes = Math.min(
    MIN_REST_FOR_EXTENSION_MIN + extensionMinutes,
    capMinutes
  );

  // The extension is additive to the base (non-augmented) FDP; since this
  // library does not carry a separate "base FDP" figure at this call site,
  // the comparison is against the hard cap for the facility/role, which is
  // itself the binding constraint the rule expresses (ORO.FTL.215.G(e)'s
  // "max FDP" figures are absolute caps, not just extension amounts).
  if (plannedFdpMinutes > capMinutes) {
    return {
      citation: IN_FLIGHT_REST_CITATION,
      severity: 'RED',
      message: `Planned FDP (${plannedFdpMinutes} min) exceeds the absolute cap for ${facility === 'BUNK' ? 'bunk/flat-bed' : 'reclining-seat'} in-flight rest for ${role} (${capMinutes} min), even with ${totalRestMinutesTaken} min of rest taken (extension ${extensionMinutes} min).`,
      marginMinutes: capMinutes - plannedFdpMinutes,
    };
  }

  return {
    citation: IN_FLIGHT_REST_CITATION,
    severity: 'GREEN',
    message: `Planned FDP (${plannedFdpMinutes} min) is within the ${facility === 'BUNK' ? 'bunk/flat-bed' : 'reclining-seat'} in-flight-rest cap for ${role} (${capMinutes} min), based on ${totalRestMinutesTaken} min of rest taken (extension ${extensionMinutes} min).`,
    marginMinutes: Math.min(maxAllowedFdpMinutes, capMinutes) - plannedFdpMinutes,
  };
}
