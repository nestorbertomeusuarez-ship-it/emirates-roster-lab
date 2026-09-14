/**
 * Core pairing-search algorithm: given a pool of dated flight instances and
 * a set of constraints, produces every feasible DXB-based (or more
 * generally, `homeBase`-based) pairing.
 *
 * Pure function: no Prisma, no I/O — takes plain `DatedFlightInstance[]` and
 * returns plain `GeneratedPairing[]`. `src/pairing/db/pairings.ts` is the
 * thin wrapper that fetches/ensures instances for a month via Prisma and
 * calls this.
 *
 * ASSUMPTION (see docs/pairing-assumptions.md): every leg of a pairing must
 * share the exact same `aircraftType` string as the first leg. This models
 * a single rotation flown on one aircraft, which is realistic for how a
 * pairing actually operates (the same physical airframe flies every sector
 * of the trip) — it is not modelling "same pilot type rating," which would
 * be a looser match (e.g. A350 and A330 sharing a rating). A fuzzy
 * type-family match was deliberately NOT implemented; this tool only has
 * Phase 1's flat `advertisedType`/`observedType` strings to work with, and
 * conflating e.g. "A380" with a hypothetical "A380-800" is exactly the kind
 * of silent assumption this project's rules forbid.
 *
 * Algorithm: bounded depth-first search. From every instance departing
 * `homeBase`, recursively extend the pairing by looking for a connecting
 * instance departing the current outstation whose ground time (previous
 * arrival to next departure) falls within
 * [minLayoverMinutes, maxLayoverMinutes] and whose aircraftType matches the
 * pairing's fleet type, until the pairing returns to `homeBase` (a
 * completed pairing) or the calendar-day span would exceed `maxTripDays`
 * (pruned/backtracked, not emitted). Because every leg's departure must be
 * strictly after the previous leg's arrival plus the minimum layover, time
 * strictly increases along any DFS path — so there is no possibility of an
 * infinite loop and no separate "visited" bookkeeping is required beyond
 * the maxTripDays bound.
 */

import type {
  DatedFlightInstance,
  GeneratedPairing,
  PairingLegResult,
  PairingSearchConstraints,
} from './types';

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

/** Calendar-day span between two service dates, inclusive (same day = 1). */
function calendarDaySpan(startServiceDate: string, endServiceDate: string): number {
  const start = new Date(`${startServiceDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endServiceDate}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

function groupByDeparture(
  instances: DatedFlightInstance[]
): Map<string, DatedFlightInstance[]> {
  const byDep = new Map<string, DatedFlightInstance[]>();
  for (const instance of instances) {
    const bucket = byDep.get(instance.depIata);
    if (bucket) {
      bucket.push(instance);
    } else {
      byDep.set(instance.depIata, [instance]);
    }
  }
  for (const bucket of byDep.values()) {
    bucket.sort((a, b) => a.depUTC.getTime() - b.depUTC.getTime());
  }
  return byDep;
}

function buildPairing(legs: PairingLegResult[], fleetType: string): GeneratedPairing {
  const startServiceDate = legs[0].instance.serviceDate;
  const endServiceDate = legs[legs.length - 1].instance.serviceDate;
  return {
    fleetType,
    legs,
    startServiceDate,
    endServiceDate,
    tripDays: calendarDaySpan(startServiceDate, endServiceDate),
  };
}

/**
 * Produces every feasible pairing reachable from an instance departing
 * `constraints.homeBase`, within the supplied instance pool.
 *
 * Deterministic: results are ordered by first-leg departure time, then by
 * the order candidates were explored (which is itself by departure time),
 * so repeated calls with the same input produce the same output order.
 */
export function generatePairings(
  instances: DatedFlightInstance[],
  constraints: PairingSearchConstraints
): GeneratedPairing[] {
  const { homeBase, maxTripDays, minLayoverMinutes, maxLayoverMinutes, fleetTypes } =
    constraints;

  if (maxTripDays < 1) {
    throw new Error(`generatePairings: maxTripDays must be >= 1 (got ${maxTripDays})`);
  }
  if (minLayoverMinutes < 0 || maxLayoverMinutes < minLayoverMinutes) {
    throw new Error(
      `generatePairings: invalid layover bounds (min=${minLayoverMinutes}, max=${maxLayoverMinutes})`
    );
  }

  const byDep = groupByDeparture(instances);
  const results: GeneratedPairing[] = [];

  const startingInstances = (byDep.get(homeBase) ?? []).filter(
    (i) => !fleetTypes || fleetTypes.includes(i.aircraftType)
  );

  function dfs(legs: PairingLegResult[], fleetType: string): void {
    const lastLeg = legs[legs.length - 1].instance;

    if (lastLeg.arrIata === homeBase) {
      results.push(buildPairing(legs, fleetType));
      // A pairing ends the moment it returns to home base — this engine
      // does not treat a DXB touch as a mid-pairing connection back out.
      return;
    }

    const tripStartServiceDate = legs[0].instance.serviceDate;
    const candidates = byDep.get(lastLeg.arrIata) ?? [];

    for (const next of candidates) {
      if (next.aircraftType !== fleetType) {
        continue; // fleet-type-consistency assumption
      }
      const layover = minutesBetween(lastLeg.arrUTC, next.depUTC);
      if (layover < minLayoverMinutes || layover > maxLayoverMinutes) {
        continue;
      }
      const candidateTripDays = calendarDaySpan(tripStartServiceDate, next.serviceDate);
      if (candidateTripDays > maxTripDays) {
        continue; // prune: would exceed the max trip length
      }
      dfs(
        [...legs, { instance: next, layoverMinutesBeforeThisLeg: layover }],
        fleetType
      );
    }
  }

  for (const first of startingInstances) {
    dfs([{ instance: first, layoverMinutesBeforeThisLeg: null }], first.aircraftType);
  }

  results.sort((a, b) => a.legs[0].instance.depUTC.getTime() - b.legs[0].instance.depUTC.getTime());
  return results;
}
