/**
 * Main entry point for the GCAA FTL rules engine.
 *
 * `evaluateDuty` runs every applicable rule against the supplied inputs and
 * returns the full list of `RuleEvaluation` results. `rest` and
 * `cumulative` are nullable: a caller might only have FDP data for a quick
 * single-duty check (e.g. Phase 2 building a pairing incrementally), in
 * which case the corresponding checks are skipped rather than throwing.
 *
 * Commander's discretion (`discretion.evaluateCommanderDiscretion`) and
 * split-duty extension (`discretion.evaluateSplitDutyExtension`) are
 * intentionally NOT run automatically here: they are situational,
 * pilot/dispatcher-initiated decisions rather than a background check every
 * duty needs, and this function's inputs (`FlightDutyPeriod`,
 * `RestPeriodInput`, `CumulativeTotals`) don't carry the extra context
 * those two checks require (e.g. whether discretion is being requested at
 * all). Call them directly when they apply to a specific duty.
 */

import type {
  CumulativeTotals,
  FlightDutyPeriod,
  OperatorSpecificOverrides,
  RestPeriodInput,
  RuleEvaluation,
  Severity,
} from './types';
import { factoredSectors } from './rules/sectorFactoring';
import { FDP_TABLE_CITATION, maxFdpMinutes } from './rules/fdpTables';
import { evaluateInFlightRest } from './rules/inFlightRest';
import { evaluateMinRest } from './rules/minRest';
import { evaluateCumulativeLimits } from './rules/cumulativeLimits';
import { evaluateDaysOff } from './rules/daysOff';
import {
  evaluateAugmentedCrewRestFacilityTable,
  evaluateOperatorPairingAndStandbyLimits,
  evaluateUlrFtlVariationScheme,
} from './rules/operatorSpecific';

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  GREEN: 0,
  AMBER: 1,
  RED: 2,
};

/** Worst-of severity across a list of evaluations: RED > AMBER > GREEN. */
export function overallSeverity(evaluations: RuleEvaluation[]): Severity {
  return evaluations.reduce<Severity>(
    (worst, e) => (SEVERITY_RANK[e.severity] > SEVERITY_RANK[worst] ? e.severity : worst),
    'GREEN'
  );
}

function evaluateFdpTable(fdp: FlightDutyPeriod): RuleEvaluation {
  try {
    const sectorsForLookup = factoredSectors(
      fdp.scheduledSectorLengthsMin,
      fdp.crewCount,
      fdp.isAcclimatised
    );
    const maxMinutes = maxFdpMinutes(
      fdp.reportLocalTime,
      sectorsForLookup,
      fdp.isAcclimatised,
      fdp.precedingRestHours
    );

    if (fdp.actualOrPlannedFdpMinutes === undefined) {
      return {
        citation: FDP_TABLE_CITATION,
        severity: 'GREEN',
        message: `Maximum permitted FDP for this duty is ${maxMinutes} min (${sectorsForLookup} lookup sectors, ${fdp.isAcclimatised ? 'Table A' : 'Table B'}). No actual/planned FDP duration was supplied, so this is informational only.`,
      };
    }

    const marginMinutes = maxMinutes - fdp.actualOrPlannedFdpMinutes;
    return {
      citation: FDP_TABLE_CITATION,
      severity: marginMinutes < 0 ? 'RED' : 'GREEN',
      message: `Planned FDP (${fdp.actualOrPlannedFdpMinutes} min) against a maximum of ${maxMinutes} min (${sectorsForLookup} lookup sectors, ${fdp.isAcclimatised ? 'Table A' : 'Table B'}).`,
      marginMinutes,
    };
  } catch (error) {
    return {
      citation: FDP_TABLE_CITATION,
      severity: 'RED',
      message: `Could not evaluate FDP limit: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Runs every applicable GCAA FTL rule against the supplied inputs.
 *
 * @param fdp the flight duty period being evaluated.
 * @param rest rest-period context, or `null` to skip the minimum-rest check.
 * @param cumulative cumulative totals, or `null` to skip the cumulative
 *   limits and days-off checks.
 * @param operatorConfig optional operator-configured overrides for the
 *   non-public operator-specific checks (always run; see
 *   `rules/operatorSpecific.ts`).
 */
export function evaluateDuty(
  fdp: FlightDutyPeriod,
  rest: RestPeriodInput | null,
  cumulative: CumulativeTotals | null,
  operatorConfig?: OperatorSpecificOverrides
): RuleEvaluation[] {
  const evaluations: RuleEvaluation[] = [];

  evaluations.push(evaluateFdpTable(fdp));

  if (fdp.inFlightRestMinutes !== undefined && fdp.inFlightRestFacility !== undefined) {
    evaluations.push(
      evaluateInFlightRest({
        plannedFdpMinutes:
          fdp.actualOrPlannedFdpMinutes ??
          // Fall back to the computed table max so the check still runs
          // informationally when no actual duration is known yet.
          maxFdpMinutes(
            fdp.reportLocalTime,
            factoredSectors(fdp.scheduledSectorLengthsMin, fdp.crewCount, fdp.isAcclimatised),
            fdp.isAcclimatised,
            fdp.precedingRestHours
          ),
        totalRestMinutesTaken: fdp.inFlightRestMinutes,
        facility: fdp.inFlightRestFacility,
        role: fdp.role,
      })
    );
  }

  if (rest !== null) {
    evaluations.push(evaluateMinRest(rest));
  }

  if (cumulative !== null) {
    evaluations.push(...evaluateCumulativeLimits(cumulative));
    evaluations.push(...evaluateDaysOff(cumulative));
  }

  evaluations.push(evaluateUlrFtlVariationScheme(operatorConfig));
  evaluations.push(evaluateAugmentedCrewRestFacilityTable(operatorConfig));
  evaluations.push(evaluateOperatorPairingAndStandbyLimits(operatorConfig));

  return evaluations;
}
