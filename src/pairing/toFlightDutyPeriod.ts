/**
 * Bridges a day's assembled duty (report time, sectors, sector lengths) into
 * `src/ftl/types.ts`'s `FlightDutyPeriod` / `RestPeriodInput` shapes, so
 * Phase 3's `evaluateDuty()` can be run against a real generated pairing.
 *
 * Pure module: no Prisma. Depends only on `src/ftl/types.ts` (a type-only
 * import) and this module's own `dutyTimes.ts` helpers.
 *
 * CREW-COUNT ASSUMPTION (see docs/pairing-assumptions.md): defaults to a
 * plain 2-pilot short/medium-haul crew (`crewCount: 2`) unless the caller
 * supplies more. ULR-specific augmented-crew modeling (3/4-pilot crews,
 * in-flight relief) is explicitly OUT OF SCOPE here — Phase 3's own
 * `src/ftl/rules/operatorSpecific.ts` already flags the augmented-crew
 * rest-facility table as `OPERATOR_SPECIFIC` (not publicly published), so
 * this bridge does not attempt to guess augmented-crew behavior beyond
 * passing through whatever `inFlightRestMinutes`/`inFlightRestFacility` the
 * caller explicitly supplies.
 */

import type {
  CrewRole,
  FlightDutyPeriod,
  InFlightRestFacility,
} from '../ftl/types';
import { computeDutyMinutes, formatLocalHHMM } from './dutyTimes';

export interface DailyDutyLeg {
  blockTimeMin: number;
}

export interface DailyDutyInput {
  /** UTC instant this duty's report time falls at (see dutyTimes.ts#computeReportTime). */
  reportUTC: Date;
  /** IANA timezone of the departure station, used to derive the local report time fdpTables.ts's Table A bands need (e.g. 'Asia/Dubai'). */
  depAirportTz: string;
  /** Every sector flown this duty, in flight order. */
  legs: DailyDutyLeg[];
  /** UTC instant of the last sector's on-blocks (arrival) this duty. */
  lastOnBlocksUTC: Date;
  /** Flight-crew headcount. Defaults to 2 (see module doc comment — ULR/augmented crew is out of scope here). */
  crewCount?: 2 | 3 | 4;
  isAcclimatised: boolean;
  /** Required, and only used, when `isAcclimatised` is false (Table B lookup — see fdpTables.ts). */
  precedingRestHours?: number;
  inFlightRestMinutes?: number;
  inFlightRestFacility?: InFlightRestFacility;
  /** Defaults to 'FLIGHT_CREW'. */
  role?: CrewRole;
}

/**
 * Converts a day's assembled duty into the `FlightDutyPeriod` shape
 * `evaluateDuty()` (src/ftl/evaluate.ts) expects.
 */
export function toFlightDutyPeriod(input: DailyDutyInput): FlightDutyPeriod {
  const reportLocalTime = formatLocalHHMM(input.reportUTC, input.depAirportTz);
  const actualOrPlannedFdpMinutes = computeDutyMinutes(input.reportUTC, input.lastOnBlocksUTC);

  return {
    reportLocalTime,
    sectors: input.legs.length,
    scheduledSectorLengthsMin: input.legs.map((leg) => leg.blockTimeMin),
    crewCount: input.crewCount ?? 2,
    isAcclimatised: input.isAcclimatised,
    precedingRestHours: input.precedingRestHours,
    actualOrPlannedFdpMinutes,
    inFlightRestMinutes: input.inFlightRestMinutes,
    inFlightRestFacility: input.inFlightRestFacility,
    role: input.role ?? 'FLIGHT_CREW',
  };
}
