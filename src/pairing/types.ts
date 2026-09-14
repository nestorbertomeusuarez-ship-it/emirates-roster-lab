/**
 * Shared types for the Phase 2 pairing engine.
 *
 * Mirrors the clean-architecture discipline already established by
 * `src/ftl/`: everything in this file, and the pure functions that consume
 * it (`expandScheduleToInstances.ts`, `generatePairings.ts`,
 * `dutyTimes.ts`, `toFlightDutyPeriod.ts`), has zero dependency on
 * `@prisma/client`. A thin DB-aware layer under `src/pairing/db/` maps
 * Prisma rows to/from these plain shapes; the algorithms themselves only
 * ever see plain objects, so they're directly unit-testable with synthetic
 * fixtures.
 */

/** One of the RosterEntry.dutyType string values (see prisma/schema.prisma). */
export type DutyType =
  | 'FLIGHT'
  | 'OFF'
  | 'STANDBY'
  | 'SIM'
  | 'GROUND_SCHOOL'
  | 'VACATION';

export const DUTY_TYPES: readonly DutyType[] = [
  'FLIGHT',
  'OFF',
  'STANDBY',
  'SIM',
  'GROUND_SCHOOL',
  'VACATION',
];

/**
 * A recurring flight schedule line, in the minimal shape the pairing engine
 * needs. Deliberately NOT the Prisma-generated `Flight` type (which carries
 * `depAirport`/`arrAirport` relation objects, DB-only fields like
 * `createdAt`, etc.) — a thin mapper in `src/pairing/db/` converts a real
 * Prisma `Flight` (with its airport relations included) into this shape.
 *
 * `aircraftType` is the single resolved fleet type used for pairing
 * fleet-consistency checks: `observedType ?? advertisedType` (prefer the
 * confirmed/observed aircraft over the advertised one when both exist —
 * see docs/pairing-assumptions.md).
 */
export interface ScheduleLine {
  id: string;
  number: string;
  depIata: string;
  arrIata: string;
  stdUTCMin: number;
  staUTCMin: number;
  arrivalDayOffset: number;
  blockTimeMin: number;
  aircraftType: string;
  /** 7-char Mon..Sun '0'/'1' string, see src/lib/daysOfWeek.ts. */
  daysOfWeek: string;
  /** ISO date 'YYYY-MM-DD'. */
  effectiveFrom: string;
  /** ISO date 'YYYY-MM-DD'. */
  effectiveTo: string;
}

/**
 * A specific calendar-date occurrence of a `ScheduleLine`, produced by
 * `expandScheduleToInstances.ts`. `serviceDate` is the UTC calendar date
 * the schedule line's `daysOfWeek` pattern was evaluated against (see
 * docs/pairing-assumptions.md for why UTC, not station-local).
 */
export interface DatedFlightInstance {
  /** Present once persisted as a FlightInstance row; undefined for a purely in-memory instance (e.g. in unit tests). */
  id?: string;
  scheduleLineId: string;
  number: string;
  depIata: string;
  arrIata: string;
  /** 'YYYY-MM-DD', UTC calendar date this instance operates on. */
  serviceDate: string;
  depUTC: Date;
  arrUTC: Date;
  blockTimeMin: number;
  aircraftType: string;
}

/** One leg of a generated pairing. */
export interface PairingLegResult {
  instance: DatedFlightInstance;
  /** Minutes of ground time at `instance.depIata` before this leg departs. Null for the first leg (departs home base, no preceding layover). */
  layoverMinutesBeforeThisLeg: number | null;
}

/**
 * A generated (candidate or persisted) pairing: an ordered sequence of legs
 * starting and ending at `homeBase`, sharing one `fleetType`.
 */
export interface GeneratedPairing {
  /** Present once persisted as a Pairing row; undefined for a freshly-generated candidate. */
  id?: string;
  fleetType: string;
  legs: PairingLegResult[];
  /** 'YYYY-MM-DD' service date of the first leg. */
  startServiceDate: string;
  /** 'YYYY-MM-DD' service date of the last leg. */
  endServiceDate: string;
  /** Calendar days spanned, inclusive (startServiceDate..endServiceDate). */
  tripDays: number;
}

/** Search constraints for `generatePairings`. */
export interface PairingSearchConstraints {
  /** IATA code of the home base every pairing must start and end at, e.g. 'DXB'. */
  homeBase: string;
  /** Maximum number of calendar days a pairing may span (inclusive of start and end day). */
  maxTripDays: number;
  /** Minimum required ground time between an arrival and the next departure, in minutes. */
  minLayoverMinutes: number;
  /** Maximum allowed ground time between an arrival and the next departure, in minutes. */
  maxLayoverMinutes: number;
  /**
   * Optional fleet-type allowlist restricting which instances may be used
   * to START a pairing (and, by the same-fleet-per-pairing assumption,
   * every subsequent leg). Omit to search across all fleet types found in
   * the supplied instances.
   */
  fleetTypes?: string[];
}
