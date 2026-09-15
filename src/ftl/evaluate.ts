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
import { evaluateInFlightRest, IN_FLIGHT_REST_CITATION } from './rules/inFlightRest';
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

interface FdpTableResult {
  evaluation: RuleEvaluation;
  /**
   * The un-augmented max FDP this duty's table lookup produced, or `null`
   * if the lookup itself threw (e.g. an invalid sector count) — `null`
   * propagates to `evaluateDuty` so the in-flight-rest check (which needs
   * this same base figure, see `rules/inFlightRest.ts`) can degrade
   * gracefully instead of computing the lookup a second time and possibly
   * throwing uncaught.
   */
  maxMinutes: number | null;
}

function evaluateFdpTable(fdp: FlightDutyPeriod): FdpTableResult {
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
        evaluation: {
          citation: FDP_TABLE_CITATION,
          severity: 'GREEN',
          message: `Maximum permitted FDP for this duty is ${maxMinutes} min (${sectorsForLookup} lookup sectors, ${fdp.isAcclimatised ? 'Table A' : 'Table B'}). No actual/planned FDP duration was supplied, so this is informational only.`,
        },
        maxMinutes,
      };
    }

    const marginMinutes = maxMinutes - fdp.actualOrPlannedFdpMinutes;
    return {
      evaluation: {
        citation: FDP_TABLE_CITATION,
        severity: marginMinutes < 0 ? 'RED' : 'GREEN',
        message: `Planned FDP (${fdp.actualOrPlannedFdpMinutes} min) against a maximum of ${maxMinutes} min (${sectorsForLookup} lookup sectors, ${fdp.isAcclimatised ? 'Table A' : 'Table B'}).`,
        marginMinutes,
      },
      maxMinutes,
    };
  } catch (error) {
    return {
      evaluation: {
        citation: FDP_TABLE_CITATION,
        severity: 'RED',
        message: `Could not evaluate FDP limit: ${error instanceof Error ? error.message : String(error)}`,
      },
      maxMinutes: null,
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

  const fdpTableResult = evaluateFdpTable(fdp);
  evaluations.push(fdpTableResult.evaluation);

  if (fdp.inFlightRestMinutes !== undefined && fdp.inFlightRestFacility !== undefined) {
    if (fdpTableResult.maxMinutes === null) {
      // The base-FDP-table lookup itself failed (see evaluateFdpTable's own
      // RED evaluation, already pushed above, for the error) — the
      // in-flight-rest extension has no base to add to, so it can't be
      // evaluated either.
      evaluations.push({
        citation: IN_FLIGHT_REST_CITATION,
        severity: 'RED',
        message:
          'Could not evaluate the in-flight-rest FDP extension: the base FDP-table maximum could not be computed for this duty (see the FDP table evaluation above for the underlying error).',
      });
    } else {
      evaluations.push(
        evaluateInFlightRest({
          plannedFdpMinutes: fdp.actualOrPlannedFdpMinutes ?? fdpTableResult.maxMinutes,
          totalRestMinutesTaken: fdp.inFlightRestMinutes,
          facility: fdp.inFlightRestFacility,
          role: fdp.role,
          baseFdpMinutes: fdpTableResult.maxMinutes,
        })
      );
    }
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
