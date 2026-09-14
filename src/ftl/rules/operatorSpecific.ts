/**
 * Explicit placeholders for what is NOT publicly available in the GCAA
 * source verified this session, and therefore must never be guessed or
 * silently treated as pass/fail:
 *
 * 1. Any Emirates-specific FTL Variation scheme for actual A380/A350
 *    ultra-long-range (ULR) routes (approved under a confidential GCAA
 *    risk-assessment process) — the resulting extended FDP limits,
 *    specific augmented-crew configurations, and route-specific
 *    rest-facility requirements are not public.
 * 2. Any discrete "augmented crew count x rest facility class -> max FDP"
 *    table more granular than the fraction-of-rest formula in
 *    `inFlightRest.ts` — the GCAA public text has no such table.
 * 3. Carrier-specific maximum pairings per month, home-base notification
 *    periods, and standby/contactable-period definitions — the regulation
 *    explicitly leaves these to the operator's own (non-public,
 *    individually approved) scheme.
 *
 * Each evaluator here always returns `isOperatorSpecific: true`. Without an
 * explicit operator-configured override, severity is AMBER ("cannot verify
 * from public data — configure your operator's actual approved scheme").
 * With an override, severity becomes GREEN, and the message states plainly
 * that the value is user-entered, not GCAA-sourced.
 */

import type { OperatorSpecificOverrides, RuleEvaluation } from '../types';
import { operatorSpecificCitation } from '../citation';

export const ULR_FTL_VARIATION_CITATION = operatorSpecificCitation(
  'operator-ulr-ftl-variation-scheme',
  'Emirates ULR FTL Variation scheme is confidential/not published'
);

export const AUGMENTED_CREW_REST_FACILITY_TABLE_CITATION = operatorSpecificCitation(
  'operator-augmented-crew-rest-facility-table',
  'no discrete crew-count x facility-class table exists in the public GCAA text'
);

export const OPERATOR_PAIRING_STANDBY_CITATION = operatorSpecificCitation(
  'operator-pairing-and-standby-limits',
  'left to the operator\'s own approved scheme by regulation'
);

/**
 * Placeholder for the Emirates ULR FTL Variation scheme (extended FDP
 * limits and route-specific rest-facility requirements for A380/A350 ULR
 * routes). Not publicly published.
 */
export function evaluateUlrFtlVariationScheme(
  overrides?: OperatorSpecificOverrides
): RuleEvaluation {
  const override = overrides?.ulrFtlVariationMaxFdpMinutes;

  if (override !== undefined) {
    return {
      citation: ULR_FTL_VARIATION_CITATION,
      severity: 'GREEN',
      message: `Using operator-configured ULR FTL Variation max FDP of ${override} min. This value is user-entered, not GCAA-sourced — verify it against your actual approved scheme.`,
      isOperatorSpecific: true,
    };
  }

  return {
    citation: ULR_FTL_VARIATION_CITATION,
    severity: 'AMBER',
    message:
      "Emirates' ULR FTL Variation scheme (extended FDP limits, augmented-crew configuration, route-specific rest-facility requirements) is not publicly published by GCAA. This cannot be verified from public data — configure your operator's actual approved scheme.",
    isOperatorSpecific: true,
  };
}

/**
 * Placeholder for a more granular "augmented crew count x rest facility
 * class -> max FDP" table than the fraction-of-rest formula this engine
 * implements from the public text (`inFlightRest.ts`). Not publicly
 * published.
 */
export function evaluateAugmentedCrewRestFacilityTable(
  overrides?: OperatorSpecificOverrides
): RuleEvaluation {
  const override = overrides?.augmentedCrewRestFacilityMaxFdpMinutes;

  if (override !== undefined) {
    return {
      citation: AUGMENTED_CREW_REST_FACILITY_TABLE_CITATION,
      severity: 'GREEN',
      message: `Using operator-configured augmented-crew rest-facility max FDP of ${override} min. This value is user-entered, not GCAA-sourced — verify it against your actual approved scheme.`,
      isOperatorSpecific: true,
    };
  }

  return {
    citation: AUGMENTED_CREW_REST_FACILITY_TABLE_CITATION,
    severity: 'AMBER',
    message:
      "No discrete 'augmented crew count x rest facility class -> max FDP' table is published by GCAA beyond the fraction-of-rest formula (ORO.FTL.215.G(e)). If your operator uses something more granular operationally, it is inside their non-public approved scheme — configure it explicitly rather than relying on this check.",
    isOperatorSpecific: true,
  };
}

/**
 * Placeholder for carrier-specific maximum pairings per month, home-base
 * notification periods, and standby/contactable-period definitions —
 * explicitly left to the operator's own (non-public) approved scheme by
 * regulation.
 */
export function evaluateOperatorPairingAndStandbyLimits(
  overrides?: OperatorSpecificOverrides
): RuleEvaluation {
  const maxPairings = overrides?.maxPairingsPerMonth;
  const standbyDefinition = overrides?.standbyContactablePeriodDefinition;

  if (maxPairings !== undefined || standbyDefinition !== undefined) {
    const parts: string[] = [];
    if (maxPairings !== undefined) {
      parts.push(`max pairings/month = ${maxPairings}`);
    }
    if (standbyDefinition !== undefined) {
      parts.push(`standby/contactable-period definition = "${standbyDefinition}"`);
    }
    return {
      citation: OPERATOR_PAIRING_STANDBY_CITATION,
      severity: 'GREEN',
      message: `Using operator-configured value(s): ${parts.join(', ')}. These are user-entered, not GCAA-sourced — verify against your actual approved scheme.`,
      isOperatorSpecific: true,
    };
  }

  return {
    citation: OPERATOR_PAIRING_STANDBY_CITATION,
    severity: 'AMBER',
    message:
      "Carrier-specific maximum pairings per month, home-base notification periods, and standby/contactable-period definitions are explicitly left to the operator's own (non-public, individually approved) scheme by regulation. This cannot be verified from public data — configure your operator's actual approved scheme.",
    isOperatorSpecific: true,
  };
}
