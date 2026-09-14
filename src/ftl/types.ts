/**
 * Shared types for the GCAA flight/duty-time-limitation (FTL) rules engine.
 *
 * This module is a pure, self-contained library: it has zero dependency on
 * `@prisma/client` or `src/ingest/`. Phase 2 (pairing engine, not yet built)
 * will be responsible for turning real pairing/roster data into the
 * `FlightDutyPeriod` / `RestPeriodInput` / `CumulativeTotals` shapes defined
 * here. Phase 5 (UI, not yet built) will render `RuleEvaluation[]` as the
 * traffic-light compliance panel.
 *
 * See `docs/gcaa-sources.md` for the regulatory source, exact clause
 * citations, and the explicit list of what is `OPERATOR_SPECIFIC` (not
 * publicly published) vs. sourced from the public GCAA text.
 */

export type CrewRole = 'FLIGHT_CREW' | 'CABIN_CREW';

/** Where in-flight rest was taken, for the augmented-crew relief rule. */
export type InFlightRestFacility = 'BUNK' | 'SEAT' | 'NONE';

/** Rest facility used during a split-duty break. */
export type SplitDutyRestFacility = 'BUNK' | 'RECLINING_SEAT' | 'NONE';

export interface RuleCitation {
  /** Stable machine-readable id for this specific check, e.g. 'gcaa-fdp-table-a'. */
  ruleId: string;
  /** Exact regulatory clause, e.g. 'ORO.FTL.255.G(c)'. Never invent a clause number. */
  clause: string;
  /** Source document title/issue. */
  document: string;
  documentUrl: string;
  /** Date this citation was last verified against the primary source, 'YYYY-MM-DD'. */
  dateConsulted: string;
}

export type Severity = 'GREEN' | 'AMBER' | 'RED';

export interface RuleEvaluation {
  citation: RuleCitation;
  severity: Severity;
  /** Human-readable explanation of the finding. */
  message: string;
  /**
   * Remaining margin before breach, in minutes, when the check is a
   * numeric comparison against a limit. Negative if already breached.
   * Omitted for checks that are purely informational (e.g. no comparable
   * actual value was supplied) or boolean/structural (e.g. a combination
   * that is simply not permitted).
   */
  marginMinutes?: number;
  /**
   * True when this rule could not be fully evaluated against public GCAA
   * data alone (see `src/ftl/rules/operatorSpecific.ts`). Always surfaced
   * explicitly — never silently treated as pass or fail.
   */
  isOperatorSpecific?: boolean;
}

/**
 * Minimal input shape a later pairing engine (Phase 2) will populate.
 *
 * `sectors` and `scheduledSectorLengthsMin.length` are expected to agree
 * (both describe the same flight-duty period); `scheduledSectorLengthsMin`
 * additionally carries each sector's scheduled block length, needed only
 * for the two-pilot sector-length-factoring rule (ORO.FTL.260.G).
 *
 * `actualOrPlannedFdpMinutes` is intentionally optional: Phase 3 ships
 * before Phase 2 computes real pairing durations, so a caller that only has
 * a start time/sector count can still get the computed maximum-FDP figure
 * back as an informational result, without a pass/fail comparison against
 * an actual duration that does not exist yet.
 */
export interface FlightDutyPeriod {
  /** Local time the FDP starts (report time), 'HH:MM', 24h. */
  reportLocalTime: string;
  sectors: number;
  /** Each scheduled sector's block length in minutes, in flight order. */
  scheduledSectorLengthsMin: number[];
  /** Flight-crew headcount for this duty. */
  crewCount: 2 | 3 | 4;
  /** Caller determines this via `src/ftl/rules/acclimatisation.ts`. */
  isAcclimatised: boolean;
  /** Needed for the Table B lookup when not acclimatised. */
  precedingRestHours?: number;
  /** Actual/planned FDP length in minutes, if known, for a pass/fail comparison. */
  actualOrPlannedFdpMinutes?: number;
  /** Total in-flight rest achieved, if augmented/relief crew. */
  inFlightRestMinutes?: number;
  inFlightRestFacility?: InFlightRestFacility;
  role: CrewRole;
}

export interface RestPeriodInput {
  precedingDutyMinutes: number;
  role: CrewRole;
  awayFromBase: boolean;
  suitableAccommodationProvided?: boolean;
  travelTimeEachWayMinutes?: number;
  /** The rest period actually planned/given, to check against the minimum. */
  earnedRestMinutes: number;
  /** Minutes of home-base discretion reduction applied, if any (flight crew only). */
  atBaseDiscretionAppliedMinutes?: number;
}

export interface CumulativeTotals {
  blockMinutes28d: number;
  blockMinutes12mo: number;
  dutyMinutes7d: number;
  dutyMinutes14d: number;
  dutyMinutes28d: number;
  consecutiveDutyDays: number;
  /**
   * Only meaningful when `consecutiveDutyDays === 8`: whether that 8th
   * consecutive duty day is justified by unforeseen circumstances (the
   * only basis on which it is permitted at all).
   */
  eighthConsecutiveDayJustifiedByUnforeseenCircumstances?: boolean;
  /**
   * Only meaningful when the 8th-day exception above applies: whether it
   * was (or, for a forward-looking check, will be) followed by at least 2
   * consecutive days off. Undefined = not yet known/pending.
   */
  followedByAtLeastTwoConsecutiveDaysOff?: boolean;
  daysOffLast14: number;
  daysOffLast28: number;
  avgDaysOffPer28dOver3Periods: number;
}

/**
 * Optional operator-configured overrides for the non-public items in
 * `src/ftl/rules/operatorSpecific.ts`. Values here are always user-entered,
 * never GCAA-sourced — every evaluation produced from them is clearly
 * labeled as such.
 */
export interface OperatorSpecificOverrides {
  ulrFtlVariationMaxFdpMinutes?: number;
  augmentedCrewRestFacilityMaxFdpMinutes?: number;
  maxPairingsPerMonth?: number;
  standbyContactablePeriodDefinition?: string;
}
