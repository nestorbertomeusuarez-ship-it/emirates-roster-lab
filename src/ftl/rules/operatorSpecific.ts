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
 *
 * For item 3, `maxPairingsPerMonth`/`standbyContactablePeriodDefinition`
 * additionally accept the `'none'`/`'not_used'` sentinels
 * (`src/ftl/types.ts#OperatorSpecificOverrides`) for an operator who has
 * explicitly CONFIRMED no cap exists / standby isn't used, as opposed to one
 * who simply hasn't configured anything yet (see
 * `src/ftl/operatorConfig.ts`).
 *
 * Items 1/2's AMBER default message cites real EASA CS-FTL.1.205(c) figures
 * (corroborated via the UK CAA Regulatory Library, see `citation.ts`) as the
 * closest available PUBLIC proxy, per explicit user instruction — this is
 * NOT Emirates' actual approved scheme, and does not resolve either check to
 * GREEN by itself (no augmented-crew size default is assumed — see
 * `docs/roster-gen-assumptions.md`).
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

interface EasaAugmentedCrewRestFacilityRow {
  additionalFlightCrew: '+1 (3-pilot crew)' | '+2 (4-pilot crew)';
  class3MaxFdpMinutes: number;
  class2MaxFdpMinutes: number;
  class1MaxFdpMinutes: number;
}

/**
 * EASA CS-FTL.1.205(c) augmented-crew rest-facility -> max-FDP table,
 * corroborated against the UK CAA Regulatory Library's hosted copy
 * (both accessed 2026-09-15 — see `citation.ts`). Class 1 = dedicated
 * flat/near-flat bunk separated from flight deck/cabin (this pilot's
 * confirmed facility type); Class 2 = reclining seat >=45 deg; Class 3 =
 * seat >=40 deg behind at least a curtain. Kept in full (not just the
 * Class 1 figures actually used in messages below) for traceability, since
 * the source table has all three.
 */
export const EASA_AUGMENTED_CREW_REST_FACILITY_TABLE: readonly EasaAugmentedCrewRestFacilityRow[] =
  [
    {
      additionalFlightCrew: '+1 (3-pilot crew)',
      class3MaxFdpMinutes: 840,
      class2MaxFdpMinutes: 900,
      class1MaxFdpMinutes: 960,
    },
    {
      additionalFlightCrew: '+2 (4-pilot crew)',
      class3MaxFdpMinutes: 900,
      class2MaxFdpMinutes: 960,
      class1MaxFdpMinutes: 1020,
    },
  ];

const EASA_CLASS1_3PILOT_MAX_FDP_MIN = EASA_AUGMENTED_CREW_REST_FACILITY_TABLE[0].class1MaxFdpMinutes;
const EASA_CLASS1_4PILOT_MAX_FDP_MIN = EASA_AUGMENTED_CREW_REST_FACILITY_TABLE[1].class1MaxFdpMinutes;

const EASA_PROXY_SOURCE_NOTE =
  'EASA CS FTL.1.205(c) (corroborated via the UK CAA Regulatory Library, both accessed 2026-09-15)';

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
      "Emirates' ULR FTL Variation scheme (extended FDP limits, augmented-crew configuration, route-specific rest-facility requirements) is not publicly published by GCAA and cannot be verified from public data. " +
      `As the closest available public proxy (${EASA_PROXY_SOURCE_NOTE}), a Class 1 (dedicated bunk) augmented-crew rest facility permits a max FDP of ${EASA_CLASS1_3PILOT_MAX_FDP_MIN} min with a 3-pilot crew (+1) or ${EASA_CLASS1_4PILOT_MAX_FDP_MIN} min with a 4-pilot crew (+2). ` +
      "This is NOT Emirates' actual approved scheme, and augmented-crew size varies by route with no default assumed here — configure ulrFtlVariationMaxFdpMinutes for a specific route once its crew size is known.",
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
      "No discrete 'augmented crew count x rest facility class -> max FDP' table is published by GCAA beyond the fraction-of-rest formula (ORO.FTL.215.G(e)). " +
      `${EASA_PROXY_SOURCE_NOTE} is used as an explicit proxy: Class 1 (dedicated bunk) -> ${EASA_CLASS1_3PILOT_MAX_FDP_MIN} min max FDP with a 3-pilot crew (+1) or ${EASA_CLASS1_4PILOT_MAX_FDP_MIN} min with a 4-pilot crew (+2) [Class 2: ${EASA_AUGMENTED_CREW_REST_FACILITY_TABLE[0].class2MaxFdpMinutes}/${EASA_AUGMENTED_CREW_REST_FACILITY_TABLE[1].class2MaxFdpMinutes} min; Class 3: ${EASA_AUGMENTED_CREW_REST_FACILITY_TABLE[0].class3MaxFdpMinutes}/${EASA_AUGMENTED_CREW_REST_FACILITY_TABLE[1].class3MaxFdpMinutes} min]. ` +
      "This is NOT Emirates' actual approved scheme, and augmented-crew size varies by route with no default assumed here — configure augmentedCrewRestFacilityMaxFdpMinutes for a specific route once its crew size is known.",
    isOperatorSpecific: true,
  };
}

/**
 * Placeholder for carrier-specific maximum pairings per month, home-base
 * notification periods, and standby/contactable-period definitions —
 * explicitly left to the operator's own (non-public) approved scheme by
 * regulation.
 *
 * `maxPairingsPerMonth`/`standbyContactablePeriodDefinition` each resolve to
 * one of three states: unconfigured (`undefined`, stays AMBER), a real
 * configured value (GREEN, "using operator-configured value" wording), or
 * the `'none'`/`'not_used'` sentinel (GREEN, "operator confirmed" wording —
 * see `src/ftl/types.ts#OperatorSpecificOverrides`).
 */
export function evaluateOperatorPairingAndStandbyLimits(
  overrides?: OperatorSpecificOverrides
): RuleEvaluation {
  const maxPairings = overrides?.maxPairingsPerMonth;
  const standbyDefinition = overrides?.standbyContactablePeriodDefinition;

  const confirmedFacts: string[] = [];
  const configuredValues: string[] = [];

  if (maxPairings === 'none') {
    confirmedFacts.push('no maximum-pairings-per-month cap applies to this roster');
  } else if (maxPairings !== undefined) {
    configuredValues.push(`max pairings/month = ${maxPairings}`);
  }

  if (standbyDefinition === 'not_used') {
    confirmedFacts.push('standby duty is not part of this roster');
  } else if (standbyDefinition !== undefined) {
    configuredValues.push(`standby/contactable-period definition = "${standbyDefinition}"`);
  }

  if (confirmedFacts.length > 0 || configuredValues.length > 0) {
    const messageParts: string[] = [];
    if (confirmedFacts.length > 0) {
      messageParts.push(`Operator confirmed: ${confirmedFacts.join('; ')}.`);
    }
    if (configuredValues.length > 0) {
      messageParts.push(
        `Using operator-configured value(s): ${configuredValues.join(', ')} — user-entered, not GCAA-sourced, verify against your actual approved scheme.`
      );
    }
    return {
      citation: OPERATOR_PAIRING_STANDBY_CITATION,
      severity: 'GREEN',
      message: messageParts.join(' '),
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
