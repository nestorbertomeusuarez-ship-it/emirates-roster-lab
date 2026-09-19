import { describe, expect, it } from 'vitest';
import { generatePairings } from '../pairing/generatePairings';
import { evaluateRosterDays, generateMonthlyRoster } from './generateMonthlyRoster';
import { classifyHaulType, type HaulType } from './haulType';
import type { DatedFlightInstance, GeneratedPairing } from '../pairing/types';
import type { GenerationStrategy, RosterGenDay } from './types';

const YEAR = 2027;
const MONTH = 6; // June 2027 — 30 days, arbitrary synthetic month
const DAYS_IN_MONTH = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();

const AIRPORT_TZS: Record<string, string> = {
  DXB: 'Asia/Dubai',
  AAA: 'Europe/London',
  BBB: 'Asia/Singapore',
  CCC: 'America/New_York',
  SSS: 'Europe/Paris',
  MMM: 'Asia/Bangkok',
  LLL: 'America/Chicago',
  DD1: 'Europe/Madrid',
  DD2: 'Asia/Tokyo',
  DD3: 'Africa/Cairo',
};

let seq = 0;

/**
 * Builds daily out+back synthetic instances for one DXB<->`dest` route
 * across the whole test month, so a candidate pairing exists starting on
 * (almost) every day — enough for the greedy generator to have real choices
 * every day, the way a real month-wide schedule would.
 */
function buildDailyRoute(
  dest: string,
  outStdUTCHour: number,
  outBlockMin: number,
  layoverHours: number,
  retBlockMin: number,
  aircraftType: string
): DatedFlightInstance[] {
  const instances: DatedFlightInstance[] = [];
  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    const depUTC = new Date(Date.UTC(YEAR, MONTH - 1, day, outStdUTCHour, 0));
    const arrUTC = new Date(depUTC.getTime() + outBlockMin * 60_000);
    seq += 1;
    instances.push({
      scheduleLineId: `DXB-${dest}-out`,
      number: `EK${100 + seq}`,
      depIata: 'DXB',
      arrIata: dest,
      serviceDate: depUTC.toISOString().slice(0, 10),
      depUTC,
      arrUTC,
      blockTimeMin: outBlockMin,
      aircraftType,
    });

    const retDepUTC = new Date(arrUTC.getTime() + layoverHours * 3_600_000);
    const retArrUTC = new Date(retDepUTC.getTime() + retBlockMin * 60_000);
    instances.push({
      scheduleLineId: `${dest}-DXB-ret`,
      number: `EK${600 + seq}`,
      depIata: dest,
      arrIata: 'DXB',
      serviceDate: retDepUTC.toISOString().slice(0, 10),
      depUTC: retDepUTC,
      arrUTC: retArrUTC,
      blockTimeMin: retBlockMin,
      aircraftType,
    });
  }
  return instances;
}

function buildFixturePairings(fleetType: string) {
  const instances = [
    // ~1-day quick turn (out+back same day-ish, ~10h layover)
    ...buildDailyRoute('AAA', 2, 240, 10, 240, fleetType),
    // ~2-day trip (overnight layover ~20h)
    ...buildDailyRoute('BBB', 6, 420, 20, 420, fleetType),
    // ~3-day-capable trip (layover ~30h)
    ...buildDailyRoute('CCC', 10, 500, 30, 500, fleetType),
  ];

  return generatePairings(instances, {
    homeBase: 'DXB',
    maxTripDays: 3,
    minLayoverMinutes: 8 * 60,
    maxLayoverMinutes: 32 * 60,
    fleetTypes: [fleetType],
  });
}

/**
 * A single-route candidate pool (only one pairing shape available, starting
 * on every day) — used to prove the HARD `targetBlockMinutesMax` filter: no
 * smaller legal alternative exists on any day, so once the budget cannot
 * absorb another whole pairing, that day must go OFF (never an over-budget
 * accept, unlike the old soft-bias design this replaces).
 */
function buildSingleRoutePairings(fleetType: string) {
  const instances = buildDailyRoute('CCC', 10, 500, 30, 500, fleetType); // 500+500=1000 block min/pairing, 3-day trip
  return generatePairings(instances, {
    homeBase: 'DXB',
    maxTripDays: 4,
    minLayoverMinutes: 8 * 60,
    maxLayoverMinutes: 32 * 60,
    fleetTypes: [fleetType],
  });
}

/**
 * A single dominant 2-day route, available almost every day, no smaller
 * legal alternative — isolates the weekly days-off pacing trigger (layer 2)
 * plus the consecutive-duty soft cap as the only possible OFF-day causes
 * (no `targetBlockMinutesMax` means layer 1's weekly block-budget filter
 * never runs). Used specifically to test docs item 22's natural OFF-block
 * length variation against the exact mechanism that was diagnosed as
 * producing uniform 2-day blocks.
 */
function buildDailyTwoDayRoutePairings(fleetType: string) {
  const instances = buildDailyRoute('BBB', 6, 420, 20, 420, fleetType);
  return generatePairings(instances, {
    homeBase: 'DXB',
    maxTripDays: 3,
    minLayoverMinutes: 8 * 60,
    maxLayoverMinutes: 32 * 60,
    fleetTypes: [fleetType],
  });
}

/**
 * Three routes, one per haul type (classified by `classifyHaulType`'s
 * longest-leg rule): SSS's 100min legs are SHORT (<180), MMM's 250min legs
 * are MEDIUM (180-360), LLL's 500min legs are LONG (>360) — all three start
 * on (almost) every day of the fixture month, so the MIX strategy has a
 * genuine choice of haul type every time it picks.
 */
function buildHaulMixPairings(fleetType: string) {
  const instances = [
    ...buildDailyRoute('SSS', 6, 100, 20, 100, fleetType), // SHORT: longest leg 100min
    ...buildDailyRoute('MMM', 6, 250, 20, 250, fleetType), // MEDIUM: longest leg 250min
    ...buildDailyRoute('LLL', 10, 500, 30, 500, fleetType), // LONG: longest leg 500min
  ];
  return generatePairings(instances, {
    homeBase: 'DXB',
    maxTripDays: 4,
    minLayoverMinutes: 8 * 60,
    maxLayoverMinutes: 32 * 60,
    fleetTypes: [fleetType],
  });
}

/**
 * Three routes to three DIFFERENT destinations, all the SAME haul type
 * (200min longest leg -> MEDIUM for all three, per `classifyHaulType`) —
 * isolates destination-mix ordering (docs item 26) from haul-type
 * balancing: since haul type never varies across these three routes,
 * `haulTypeCountsSoFar` contributes the same value to every candidate's
 * combined MIX score every day, so any resulting destination distribution
 * is attributable only to `destinationCountsSoFar`.
 */
function buildSameHaulDifferentDestPairings(fleetType: string) {
  const instances = [
    ...buildDailyRoute('DD1', 6, 200, 20, 200, fleetType),
    ...buildDailyRoute('DD2', 6, 200, 20, 200, fleetType),
    ...buildDailyRoute('DD3', 6, 200, 20, 200, fleetType),
  ];
  return generatePairings(instances, {
    homeBase: 'DXB',
    maxTripDays: 3,
    minLayoverMinutes: 8 * 60,
    maxLayoverMinutes: 32 * 60,
    fleetTypes: [fleetType],
  });
}

/**
 * A full month of trivial 1-day, minimal-block-time (60min) candidate
 * pairings, one starting every day, well-rested from each other (~23h
 * gap). Used specifically to isolate `forcedOffByPacing`/`MONTH_PACING`
 * (docs item 25): real block/duty-hour legality never becomes the binding
 * constraint here (blocks are tiny), so with `targetBlockMinutesMin` set
 * unreachably high (suppressing weekly pacing, docs item 23) the ONLY
 * remaining OFF-day causes are the consecutive-duty soft cap and,
 * eventually, the month-level days-off pacing backstop — confirmed by
 * direct inspection this fixture reliably produces both.
 */
function buildDailySingleLegPairings(fleetType: string): GeneratedPairing[] {
  const pairings: GeneratedPairing[] = [];
  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    const date = isoDate(day);
    seq += 1;
    const instance: DatedFlightInstance = {
      scheduleLineId: `tiny-${seq}`,
      number: `EK${9500 + seq}`,
      depIata: 'DXB',
      arrIata: 'DXB',
      serviceDate: date,
      depUTC: new Date(`${date}T08:00:00.000Z`),
      arrUTC: new Date(`${date}T09:00:00.000Z`),
      blockTimeMin: 60,
      aircraftType: fleetType,
    };
    pairings.push({
      fleetType,
      legs: [{ instance, layoverMinutesBeforeThisLeg: null }],
      startServiceDate: date,
      endServiceDate: date,
      tripDays: 1,
    });
  }
  return pairings;
}

function isoDate(day: number): string {
  return new Date(Date.UTC(YEAR, MONTH - 1, day)).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A single hand-built FLIGHT day with exact, caller-controlled leg timing —
 * bypasses `generatePairings` entirely (docs item 24's tests need precise
 * control over rest-gap timing and exact consecutive-day counts, which a
 * shuffled/generated candidate pool doesn't give). Each call produces its
 * own single-leg, single-day pairing (`tripDays: 1`) — fine for these
 * tests, which only ever inspect one day's own `assignment.pairing` at a
 * time, never a multi-day span.
 */
function buildHandBuiltFlightDay(
  date: string,
  fleetType: string,
  depIata: string,
  depUTC: Date,
  arrIata: string,
  arrUTC: Date,
  blockTimeMin: number
): RosterGenDay {
  seq += 1;
  const instance: DatedFlightInstance = {
    scheduleLineId: `hand-built-${seq}`,
    number: `EK${9000 + seq}`,
    depIata,
    arrIata,
    serviceDate: date,
    depUTC,
    arrUTC,
    blockTimeMin,
    aircraftType: fleetType,
  };
  const pairing: GeneratedPairing = {
    fleetType,
    legs: [{ instance, layoverMinutesBeforeThisLeg: null }],
    startServiceDate: date,
    endServiceDate: date,
    tripDays: 1,
  };
  return { date, assignment: { type: 'FLIGHT', pairing, dayOfPairing: 1 } };
}

/**
 * `count` consecutive daily hand-built FLIGHT days starting `startDate`,
 * each a short DXB round-trip-shaped hop (08:00-09:00 UTC, ~23.5h gap to
 * the next day's 06:30 UTC report) — comfortably clears the 12h minimum
 * rest floor between every consecutive pair, so a test using this fixture
 * only ever exercises the consecutive-duty-day count, never an incidental
 * rest violation.
 */
function buildConsecutiveHandBuiltFlightDays(
  startDate: string,
  count: number,
  fleetType: string
): RosterGenDay[] {
  const days: RosterGenDay[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = addDaysIso(startDate, i);
    days.push(
      buildHandBuiltFlightDay(
        date,
        fleetType,
        'DXB',
        new Date(`${date}T08:00:00.000Z`),
        'DXB',
        new Date(`${date}T09:00:00.000Z`),
        60
      )
    );
  }
  return days;
}

function firstFlightDayPairingBlockMinutes(
  days: ReturnType<typeof generateMonthlyRoster>['days']
): number | null {
  const first = days[0];
  if (first.assignment.type !== 'FLIGHT') return null;
  return first.assignment.pairing.legs.reduce((sum, leg) => sum + leg.instance.blockTimeMin, 0);
}

function assertNeverExceedsSevenConsecutiveDutyDays(
  days: ReturnType<typeof generateMonthlyRoster>['days']
): void {
  let run = 0;
  let maxRun = 0;
  for (const day of days) {
    if (day.assignment.type === 'FLIGHT') {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  expect(maxRun).toBeLessThanOrEqual(7);
}

describe('generateMonthlyRoster — synthetic fixture', () => {
  const pairings = buildFixturePairings('A350');
  const result = generateMonthlyRoster({
    fleetType: 'A350',
    year: YEAR,
    month: MONTH,
    pairings,
    airportTimeZones: AIRPORT_TZS,
  });

  it('produces exactly one entry per calendar day of the month', () => {
    expect(result.days).toHaveLength(DAYS_IN_MONTH);
    expect(result.days.map((d) => d.date)).toEqual(
      Array.from({ length: DAYS_IN_MONTH }, (_, i) =>
        new Date(Date.UTC(YEAR, MONTH - 1, i + 1)).toISOString().slice(0, 10)
      )
    );
  });

  it('never exceeds 7 consecutive duty (FLIGHT) days', () => {
    let run = 0;
    let maxRun = 0;
    for (const day of result.days) {
      if (day.assignment.type === 'FLIGHT') {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 0;
      }
    }
    expect(maxRun).toBeLessThanOrEqual(7);
  });

  it('assigns at least 7 OFF days somewhere across the month (>=7-days-off-in-28 floor)', () => {
    const offCount = result.days.filter((d) => d.assignment.type === 'OFF').length;
    expect(offCount).toBeGreaterThanOrEqual(7);
  });

  it('never overlaps two pairings — every FLIGHT day belongs to exactly one contiguous pairing span', () => {
    let i = 0;
    while (i < result.days.length) {
      const day = result.days[i];
      if (day.assignment.type !== 'FLIGHT') {
        i += 1;
        continue;
      }
      const pairing = day.assignment.pairing;
      expect(day.assignment.dayOfPairing).toBe(1);
      for (let k = 0; k < pairing.tripDays; k += 1) {
        const spanDay = result.days[i + k];
        expect(spanDay).toBeDefined();
        expect(spanDay.assignment.type).toBe('FLIGHT');
        if (spanDay.assignment.type === 'FLIGHT') {
          expect(spanDay.assignment.pairing).toBe(pairing);
          expect(spanDay.assignment.dayOfPairing).toBe(k + 1);
        }
      }
      i += pairing.tripDays;
    }
  });

  it('the post-generation verification pass (real evaluateDuty) reports zero RED severities', () => {
    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
  });

  it('summary block-hour total matches the sum of every distinct assigned pairing', () => {
    const seenPairings = new Set(
      result.days
        .filter((d) => d.assignment.type === 'FLIGHT')
        .map((d) => (d.assignment as { pairing: (typeof pairings)[number] }).pairing)
    );
    const expectedTotal = [...seenPairings].reduce(
      (sum, p) => sum + p.legs.reduce((s, l) => s + l.instance.blockTimeMin, 0),
      0
    );
    expect(result.summary.totalBlockMinutes).toBe(expectedTotal);
    expect(result.summary.pairingsAssigned).toBe(seenPairings.size);
  });
});

describe('generateMonthlyRoster — operatorConfig threading', () => {
  const pairings = buildFixturePairings('A350');

  it('defaults every operator-specific evaluation to AMBER when operatorConfig is omitted (unchanged prior behavior)', () => {
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    });
    const operatorSpecific = result.evaluations.filter((e) => e.evaluation.isOperatorSpecific);
    expect(operatorSpecific.length).toBeGreaterThan(0);
    expect(operatorSpecific.every((e) => e.evaluation.severity === 'AMBER')).toBe(true);
  });

  it('threads operatorConfig through both construction-time screening and the final verification pass', () => {
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      operatorConfig: {
        maxPairingsPerMonth: 'none',
        standbyContactablePeriodDefinition: 'not_used',
      },
    });

    const pairingStandbyEvaluations = result.evaluations.filter(
      (e) => e.evaluation.citation.ruleId === 'operator-pairing-and-standby-limits'
    );
    expect(pairingStandbyEvaluations.length).toBeGreaterThan(0);
    expect(pairingStandbyEvaluations.every((e) => e.evaluation.severity === 'GREEN')).toBe(true);
    expect(pairingStandbyEvaluations.every((e) => /confirmed/i.test(e.evaluation.message))).toBe(
      true
    );

    // ULR/augmented-crew stay AMBER — no crew-size default configured.
    const ulrEvaluations = result.evaluations.filter(
      (e) => e.evaluation.citation.ruleId === 'operator-ulr-ftl-variation-scheme'
    );
    expect(ulrEvaluations.every((e) => e.evaluation.severity === 'AMBER')).toBe(true);

    // Threading operatorConfig must not change any non-operator-specific outcome.
    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
  });
});

describe('generateMonthlyRoster — hard targetBlockMinutesMax enforcement', () => {
  const baseInput = {
    fleetType: 'A350',
    year: YEAR,
    month: MONTH,
    airportTimeZones: AIRPORT_TZS,
  };

  it('never accepts a candidate that would push the running total past the max — forces OFF instead of an over-budget accept', () => {
    // Only one pairing shape exists (1000 block min/pairing, 3-day trip),
    // available starting on almost every day. A max of 1400 absorbs
    // exactly ONE pairing (1000 <= 1400) but never a second
    // (1000+1000=2000 > 1400) — the old soft-bias design would have kept
    // accepting every legal candidate regardless of budget; the new hard
    // filter must stop after the first.
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      ...baseInput,
      pairings,
      targetBlockMinutesMax: 1400,
    });

    expect(result.summary.totalBlockMinutes).toBe(1000);
    expect(result.summary.pairingsAssigned).toBe(1);
    expect(result.summary.totalBlockMinutes).toBeLessThanOrEqual(1400);
  });

  it('reports whatever total was actually achieved without erroring when the range cannot be reached at all (empty candidate pool)', () => {
    const result = generateMonthlyRoster({
      fleetType: 'A380',
      year: YEAR,
      month: MONTH,
      pairings: [],
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMin: 999_999,
      targetBlockMinutesMax: 1_999_999,
    });
    expect(result.summary.totalBlockMinutes).toBe(0);
    expect(result.days.every((d) => d.assignment.type === 'OFF')).toBe(true);
  });

  it('can legitimately land under targetBlockMinutesMin when the hard max prevents reaching it — accepted outcome, not an error', () => {
    // A tight budget (1400) can never reach a high floor (e.g. 80h) with
    // this single-route fixture — generation must still complete normally.
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      ...baseInput,
      pairings,
      targetBlockMinutesMin: 80 * 60,
      targetBlockMinutesMax: 1400,
    });
    expect(result.summary.totalBlockMinutes).toBeLessThan(80 * 60);
    expect(result.summary.totalBlockMinutes).toBeLessThanOrEqual(1400);
  });

  it('never relaxes legality (zero RED) while the hard budget filter is active', () => {
    const pairings = buildFixturePairings('A350');
    const result = generateMonthlyRoster({
      ...baseInput,
      pairings,
      targetBlockMinutesMin: 80 * 60,
      targetBlockMinutesMax: 90 * 60,
    });
    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
    expect(result.summary.totalBlockMinutes).toBeLessThanOrEqual(90 * 60);
  });

  it('never exceeds 7 consecutive duty days or drops below the days-off floor while hard-budget-constrained', () => {
    const pairings = buildFixturePairings('A350');
    const result = generateMonthlyRoster({
      ...baseInput,
      pairings,
      targetBlockMinutesMin: 80 * 60,
      targetBlockMinutesMax: 90 * 60,
    });
    assertNeverExceedsSevenConsecutiveDutyDays(result.days);
    const offCount = result.days.filter((d) => d.assignment.type === 'OFF').length;
    expect(offCount).toBeGreaterThanOrEqual(7);
  });

  it('both undefined applies no budget filtering at all (matches an explicit undefined call)', () => {
    const pairings = buildFixturePairings('A350');
    const implicit = generateMonthlyRoster({ ...baseInput, pairings });
    const explicit = generateMonthlyRoster({
      ...baseInput,
      pairings,
      targetBlockMinutesMin: undefined,
      targetBlockMinutesMax: undefined,
    });
    expect(explicit.days).toEqual(implicit.days);
    expect(explicit.summary).toEqual(implicit.summary);
  });
});

describe('generateMonthlyRoster — generationStrategy', () => {
  const baseInput = {
    fleetType: 'A350',
    year: YEAR,
    month: MONTH,
    airportTimeZones: AIRPORT_TZS,
  };

  // Route block minutes as built by buildFixturePairings: AAA=240+240=480,
  // BBB=420+420=840, CCC=500+500=1000 — all three routes start on (almost)
  // every day of the fixture month. On day 1 specifically, AAA's quick-turn
  // candidate is legally screened out by the real evaluateDuty() (its
  // report-to-report FDP span exceeds the Table A max for a 2-sector duty,
  // even though its own block time is the smallest of the three) — so the
  // smallest LEGAL day-1 candidate is BBB, not AAA.
  const MIN_LEGAL_DAY1_BLOCK_MINUTES = 840; // BBB (AAA is illegal on day 1 — see above)
  const MAX_ROUTE_BLOCK_MINUTES = 1000; // CCC

  it('defaults to MIX when unset (identical to an explicit generationStrategy: "MIX")', () => {
    const pairings = buildFixturePairings('A350');
    const implicit = generateMonthlyRoster({ ...baseInput, pairings });
    const explicitMix = generateMonthlyRoster({
      ...baseInput,
      pairings,
      generationStrategy: 'MIX',
    });
    expect(explicitMix.days).toEqual(implicit.days);
    expect(explicitMix.summary).toEqual(implicit.summary);
  });

  it('MAX_FLYING prefers the smaller legal candidate on day 1', () => {
    const pairings = buildFixturePairings('A350');
    const result = generateMonthlyRoster({
      ...baseInput,
      pairings,
      generationStrategy: 'MAX_FLYING',
    });
    expect(firstFlightDayPairingBlockMinutes(result.days)).toBe(MIN_LEGAL_DAY1_BLOCK_MINUTES);
  });

  it('MAX_DAYS_OFF prefers the bigger legal candidate on day 1', () => {
    const pairings = buildFixturePairings('A350');
    const result = generateMonthlyRoster({
      ...baseInput,
      pairings,
      generationStrategy: 'MAX_DAYS_OFF',
    });
    expect(firstFlightDayPairingBlockMinutes(result.days)).toBe(MAX_ROUTE_BLOCK_MINUTES);
  });

  it('MIX balances haul-type assignment across the month instead of exhausting one type first', () => {
    const pairings = buildHaulMixPairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      generationStrategy: 'MIX',
    });

    const assignedPairings = new Set<GeneratedPairing>();
    for (const day of result.days) {
      if (day.assignment.type === 'FLIGHT') assignedPairings.add(day.assignment.pairing);
    }
    const counts: Record<HaulType, number> = { SHORT: 0, MEDIUM: 0, LONG: 0 };
    for (const pairing of assignedPairings) {
      counts[classifyHaulType(pairing)] += 1;
    }

    // All three haul types must actually get picked — MIX never starves a
    // type that stays legal and available all month.
    expect(counts.SHORT).toBeGreaterThan(0);
    expect(counts.MEDIUM).toBeGreaterThan(0);
    expect(counts.LONG).toBeGreaterThan(0);

    // Genuine balancing: no haul type should be assigned dramatically more
    // than the others when all three are legal and available every day —
    // the counts stay within 1 of each other (each pick always prefers
    // whichever type currently trails).
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it.each<GenerationStrategy>(['MIX', 'MAX_FLYING', 'MAX_DAYS_OFF'])(
    '%s never relaxes legality or the consecutive-duty/days-off invariants, combined with the hard 80-90h range',
    (strategy) => {
      const pairings = buildFixturePairings('A350');
      const result = generateMonthlyRoster({
        ...baseInput,
        pairings,
        generationStrategy: strategy,
        targetBlockMinutesMin: 80 * 60,
        targetBlockMinutesMax: 90 * 60,
      });

      const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
      expect(reds).toEqual([]);
      expect(result.summary.totalBlockMinutes).toBeLessThanOrEqual(90 * 60);
      assertNeverExceedsSevenConsecutiveDutyDays(result.days);
      const offCount = result.days.filter((d) => d.assignment.type === 'OFF').length;
      expect(offCount).toBeGreaterThanOrEqual(7);
    }
  );
});

describe('generateMonthlyRoster — no candidates available', () => {
  it('assigns OFF to every day when the pairing pool is empty', () => {
    const result = generateMonthlyRoster({
      fleetType: 'A380',
      year: YEAR,
      month: MONTH,
      pairings: [],
      airportTimeZones: AIRPORT_TZS,
    });
    expect(result.days.every((d) => d.assignment.type === 'OFF')).toBe(true);
    expect(result.evaluations).toEqual([]);
    expect(result.summary.flightDays).toBe(0);
  });
});

/**
 * Sequential 7-day-from-day-1 week slices (NOT calendar ISO weeks — see
 * docs/roster-gen-assumptions.md item 21), duplicated here only for test
 * assertions (the production helper of the same shape lives, unexported, in
 * generateMonthlyRoster.ts).
 */
function weekSliceIndexOfDayIndex0(dayIndex0: number): number {
  return Math.floor(dayIndex0 / 7);
}

function longestConsecutiveOffRun(days: ReturnType<typeof generateMonthlyRoster>['days']): number {
  let run = 0;
  let maxRun = 0;
  for (const day of days) {
    if (day.assignment.type === 'OFF') {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  return maxRun;
}

/** Lengths of every complete consecutive-OFF run in `days`, in order. */
function offBlockLengths(days: ReturnType<typeof generateMonthlyRoster>['days']): number[] {
  const lengths: number[] = [];
  let run = 0;
  for (const day of days) {
    if (day.assignment.type === 'OFF') {
      run += 1;
    } else if (run > 0) {
      lengths.push(run);
      run = 0;
    }
  }
  if (run > 0) lengths.push(run);
  return lengths;
}

describe('generateMonthlyRoster — weekly block-budget pacing (docs item 21)', () => {
  it('spreads block-minute acceptance across more weeks instead of front-loading the whole budget into the first 2 weeks', () => {
    // Single 1000-block-min/3-day route, available almost every day, no
    // smaller legal alternative exists on any day (mirrors
    // buildSingleRoutePairings above). With a 4000-min month ceiling, the
    // OLD day-by-day-only pacing greedily fills the budget as fast as
    // legality/consecutive-duty-cap allow — entirely within the first 2
    // weeks (4 pairings * 1000 = 4000 by day 14, see this module's own
    // hand-traced math in the task brief). Weekly pacing must spread that
    // same 4000-min budget across at least 3 of the month's week slices
    // instead.
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMax: 4000,
    });

    const blockMinutesStartedInFirstTwoWeeks = result.days
      .slice(0, 14)
      .filter((d) => d.assignment.type === 'FLIGHT' && d.assignment.dayOfPairing === 1)
      .reduce((sum, d) => {
        const pairing = (d.assignment as { pairing: GeneratedPairing }).pairing;
        return sum + pairing.legs.reduce((s, l) => s + l.instance.blockTimeMin, 0);
      }, 0);
    expect(blockMinutesStartedInFirstTwoWeeks).toBeLessThan(4000);

    const weeksWithAnyFlight = new Set<number>();
    result.days.forEach((d, idx) => {
      if (d.assignment.type === 'FLIGHT') weeksWithAnyFlight.add(weekSliceIndexOfDayIndex0(idx));
    });
    expect(weeksWithAnyFlight.size).toBeGreaterThanOrEqual(3);
  });
});

describe('generateMonthlyRoster — weekly days-off pacing (docs item 21)', () => {
  it('never lets a week-slice end with zero OFF days when enough legal OFF-forcing opportunities exist', () => {
    const pairings = buildFixturePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    });

    const offCountByWeek = new Map<number, number>();
    result.days.forEach((d, idx) => {
      const week = weekSliceIndexOfDayIndex0(idx);
      if (d.assignment.type === 'OFF') {
        offCountByWeek.set(week, (offCountByWeek.get(week) ?? 0) + 1);
      } else if (!offCountByWeek.has(week)) {
        offCountByWeek.set(week, 0);
      }
    });

    for (const [week, offCount] of offCountByWeek.entries()) {
      expect(offCount, `week slice ${week} had zero OFF days`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('generateMonthlyRoster — no giant end-of-month OFF tail (core acceptance test, docs item 21)', () => {
  it('keeps the longest consecutive OFF run well below the 10-day tail diagnosed against the real Oct 2026 roster', () => {
    // Reproduces the diagnosed real-world failure mode: a single dominant
    // route (1000 block-min/3-day trip) available almost daily, with a
    // month-level ceiling (5400 = 90h) the OLD day-by-day-only pacing
    // exhausts by ~day 17-18 (see hand-traced math in the task brief),
    // leaving the entire remainder of the month forced OFF as one giant
    // tail (13 days under the old logic for this exact fixture).
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMax: 90 * 60,
    });

    const longestRun = longestConsecutiveOffRun(result.days);
    expect(longestRun).toBeLessThanOrEqual(7);

    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
    assertNeverExceedsSevenConsecutiveDutyDays(result.days);
  });
});

describe('generateMonthlyRoster — weekly pacing preserves existing invariants', () => {
  it.each<GenerationStrategy>(['MIX', 'MAX_FLYING', 'MAX_DAYS_OFF'])(
    '%s: zero RED, 7-consecutive-duty-day cap, and the >=7-days-off floor all still hold with weekly pacing active',
    (strategy) => {
      const pairings = buildFixturePairings('A350');
      const result = generateMonthlyRoster({
        fleetType: 'A350',
        year: YEAR,
        month: MONTH,
        pairings,
        airportTimeZones: AIRPORT_TZS,
        generationStrategy: strategy,
        targetBlockMinutesMin: 80 * 60,
        targetBlockMinutesMax: 90 * 60,
      });

      const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
      expect(reds).toEqual([]);
      expect(result.summary.totalBlockMinutes).toBeLessThanOrEqual(90 * 60);
      assertNeverExceedsSevenConsecutiveDutyDays(result.days);
      const offCount = result.days.filter((d) => d.assignment.type === 'OFF').length;
      expect(offCount).toBeGreaterThanOrEqual(7);
    }
  );
});

describe('generateMonthlyRoster — natural OFF-block length variation (docs item 22)', () => {
  // Single dominant 2-day route, no targetBlockMinutesMax — isolates the
  // weekly days-off pacing trigger (layer 2) as the only mechanical OFF-day
  // cause in this window (no budget filter active, no month-level pacing
  // yet — PACING_CHECK_FROM_DAY=24 hasn't engaged by day 17). Before this
  // item's fix, this exact fixture/seed produced two back-to-back,
  // mechanically-identical 2-day OFF blocks (days 5-6 and 12-13) — the
  // precise uniformity the user flagged from the real live roster
  // (`FFFFFOOFFFFOOFFFFFOOFFFFFFOOFFO`, every block exactly 2 days).
  it('does not force every weekly-pacing-triggered OFF block to the exact same mechanical length', () => {
    const pairings = buildDailyTwoDayRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    });

    // Restricted to the first 17 days, strictly before PACING_CHECK_FROM_DAY
    // (24) can ever fire, so both OFF blocks found here are attributable
    // only to the weekly pacing trigger (or the consecutive-duty soft cap),
    // never the month-level tail-avoidance check.
    const earlyWindow = result.days.slice(0, 17);
    const lengths = offBlockLengths(earlyWindow);

    expect(lengths.length).toBeGreaterThanOrEqual(2);
    expect(new Set(lengths).size).toBeGreaterThanOrEqual(2);
  });

  it('still keeps the longest consecutive OFF run well below the 10-day tail this generator must never reintroduce', () => {
    // Same single-route/90h-ceiling fixture as the existing "no giant
    // end-of-month OFF tail" acceptance test above — confirms the new
    // variation knobs (scoped strictly to the weekly-pacing trigger) never
    // regress that fix, even though they add MORE opportunities for an OFF
    // streak to run a little longer than its mechanical minimum.
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMax: 90 * 60,
    });

    expect(longestConsecutiveOffRun(result.days)).toBeLessThanOrEqual(7);
    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
    assertNeverExceedsSevenConsecutiveDutyDays(result.days);
  });

  it('is deterministic — identical fleet/year/month inputs produce byte-for-byte identical output across repeated runs', () => {
    // Reuses the SAME pairings array for both calls (rather than building it
    // twice) — this test file's shared `seq` counter (used to generate
    // unique flight numbers across the whole suite) would otherwise make
    // two independently-built candidate pools differ in their instance
    // `number` fields alone, which is a fixture-construction artifact, not
    // a real generator non-determinism. `generateMonthlyRoster` never
    // mutates its `pairings` input, so reuse across calls is safe (the same
    // pattern the pre-existing "both undefined" and "defaults to MIX" tests
    // above already rely on).
    const pairings = buildDailyTwoDayRoutePairings('A350');
    const input = {
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    };

    const first = generateMonthlyRoster(input);
    const second = generateMonthlyRoster(input);

    expect(second.days).toEqual(first.days);
    expect(second.summary).toEqual(first.summary);
    expect(second.evaluations).toEqual(first.evaluations);
  });
});

describe('generateMonthlyRoster — enforced min block-hours floor (docs item 23)', () => {
  it('flies more (reaching closer to or past the floor) than the same fixture with no floor set', () => {
    // Single dominant 1000-block-min/3-day route, no smaller legal
    // alternative — the exact fixture item 21's "no giant tail" test uses.
    // Without a floor, the weekly block-budget filter (layer 1) and weekly
    // pacing trigger (layer 2) leave this fixture well under 70h. With the
    // floor set, those two cosmetic heuristics are suppressed below it, so
    // strictly more flying should happen for the identical candidate pool.
    const pairingsNoFloor = buildSingleRoutePairings('A350');
    const withoutFloor = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings: pairingsNoFloor,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMax: 90 * 60,
    });

    const pairingsWithFloor = buildSingleRoutePairings('A350');
    const withFloor = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings: pairingsWithFloor,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMin: 70 * 60,
      targetBlockMinutesMax: 90 * 60,
    });

    expect(withFloor.summary.totalBlockMinutes).toBeGreaterThan(
      withoutFloor.summary.totalBlockMinutes
    );
    expect(withFloor.summary.totalBlockMinutes).toBeGreaterThanOrEqual(70 * 60);
  });

  it('never pushes the month past the hard max ceiling while catching up on the floor', () => {
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMin: 70 * 60,
      targetBlockMinutesMax: 90 * 60,
    });

    expect(result.summary.totalBlockMinutes).toBeLessThanOrEqual(90 * 60);
    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
  });

  it('never overrides the consecutive-duty-day cap while below the floor', () => {
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMin: 70 * 60,
      targetBlockMinutesMax: 90 * 60,
    });

    assertNeverExceedsSevenConsecutiveDutyDays(result.days);
  });

  it('leaves behavior unchanged when targetBlockMinutesMin is left unset', () => {
    // Same fixture/inputs as item 21's own regression guard — confirms the
    // new floor logic introduces no behavior change at all when the field
    // this item reads is simply absent (`belowMinFloor` is always false).
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMax: 90 * 60,
    });

    expect(longestConsecutiveOffRun(result.days)).toBeLessThanOrEqual(7);
    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
  });

  it('is deterministic with the floor set — identical inputs produce byte-for-byte identical output', () => {
    const pairings = buildSingleRoutePairings('A350');
    const input = {
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMin: 70 * 60,
      targetBlockMinutesMax: 90 * 60,
    };

    const first = generateMonthlyRoster(input);
    const second = generateMonthlyRoster(input);

    expect(second.days).toEqual(first.days);
    expect(second.summary).toEqual(first.summary);
    expect(second.evaluations).toEqual(first.evaluations);
  });
});

describe('generateMonthlyRoster — cross-month rest + consecutive-duty-day carry-over (docs item 24)', () => {
  // Prior-month tail ending 2027-05-31 (the day before this file's YEAR/MONTH
  // fixture, June 2027, starts) — a single short DXB round-trip landing back
  // at DXB 21:30 UTC. Paired below against a day-1 report time only ~10-11h
  // later, comfortably under the 12h flight-crew minimum rest floor
  // (ORO.FTL.225.G, `gcaa-min-rest-flight-crew`) — a real rest violation
  // that only `priorMonthTailDays` can make visible.
  const PRIOR_MONTH_LAST_DUTY: RosterGenDay[] = [
    buildHandBuiltFlightDay(
      '2027-05-31',
      'A350',
      'DXB',
      new Date('2027-05-31T18:00:00.000Z'),
      'DXB',
      new Date('2027-05-31T21:30:00.000Z'),
      210
    ),
  ];

  it('evaluateRosterDays surfaces a real min-rest violation against the prior month, invisible without it', () => {
    const days: RosterGenDay[] = [
      buildHandBuiltFlightDay(
        '2027-06-01',
        'A350',
        'DXB',
        new Date('2027-06-01T09:00:00.000Z'), // report 07:30 UTC — 10h after the prior duty's 21:30 UTC end
        'BOM',
        new Date('2027-06-01T12:00:00.000Z'),
        180
      ),
    ];

    const withCarryOver = evaluateRosterDays(days, AIRPORT_TZS, undefined, PRIOR_MONTH_LAST_DUTY);
    expect(
      withCarryOver.some(
        (e) => e.evaluation.citation.ruleId === 'gcaa-min-rest-flight-crew' && e.evaluation.severity === 'RED'
      )
    ).toBe(true);

    const withoutCarryOver = evaluateRosterDays(days, AIRPORT_TZS);
    expect(
      withoutCarryOver.some((e) => e.evaluation.citation.ruleId === 'gcaa-min-rest-flight-crew')
    ).toBe(false);
  });

  it('debrief time (docs/pairing-assumptions.md item 9) counts against rest even when the RAW arrival-to-report gap alone would be exactly legal', () => {
    // Report at 09:30 UTC June 1 is EXACTLY 12h00m after the prior duty's raw
    // 21:30 UTC arrival — legal with zero debrief. With the default 30min
    // debrief added on top of that arrival, the true rest floor only starts
    // at 22:00 UTC, leaving just 11h30m of earned rest — a real violation
    // only visible because debrief time is modeled.
    const days: RosterGenDay[] = [
      buildHandBuiltFlightDay(
        '2027-06-01',
        'A350',
        'DXB',
        new Date('2027-06-01T11:00:00.000Z'), // report 09:30 UTC — exactly 12h00m after raw arrival
        'BOM',
        new Date('2027-06-01T14:00:00.000Z'),
        180
      ),
    ];

    const evaluations = evaluateRosterDays(days, AIRPORT_TZS, undefined, PRIOR_MONTH_LAST_DUTY);
    expect(
      evaluations.some(
        (e) => e.evaluation.citation.ruleId === 'gcaa-min-rest-flight-crew' && e.evaluation.severity === 'RED'
      )
    ).toBe(true);
  });

  it('generateMonthlyRoster itself avoids the now-illegal day-1 accept (construction loop, not just the verification pass)', () => {
    // buildSingleRoutePairings departs DXB at 10:00 UTC every day -> day-1
    // report is 08:30 UTC, only 11h after PRIOR_MONTH_LAST_DUTY's 21:30 UTC
    // end. If the construction loop didn't know about this history, it
    // would happily accept day 1 (no RED without priorMonthTailDays) and
    // only the final verification pass would ever have caught it.
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      priorMonthTailDays: PRIOR_MONTH_LAST_DUTY,
    });

    expect(result.days[0].assignment.type).toBe('OFF');
    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
  });

  it('evaluateRosterDays continues a consecutive-duty-day run into the new month', () => {
    const priorMonthTailDays = buildConsecutiveHandBuiltFlightDays('2027-05-26', 6, 'A350'); // May 26-31
    const days = buildConsecutiveHandBuiltFlightDays('2027-06-01', 3, 'A350'); // June 1-3 -> 9th consecutive day

    const withCarryOver = evaluateRosterDays(days, AIRPORT_TZS, undefined, priorMonthTailDays);
    expect(
      withCarryOver.some(
        (e) =>
          e.evaluation.citation.ruleId === 'gcaa-days-off-consecutive-duty' &&
          e.evaluation.severity === 'RED'
      )
    ).toBe(true);

    const withoutCarryOver = evaluateRosterDays(days, AIRPORT_TZS);
    expect(
      withoutCarryOver.some(
        (e) =>
          e.evaluation.citation.ruleId === 'gcaa-days-off-consecutive-duty' &&
          e.evaluation.severity === 'RED'
      )
    ).toBe(false);
  });

  it('generateMonthlyRoster forces day 1 OFF when the prior month already hit the consecutive-duty soft cap', () => {
    const priorMonthTailDays = buildConsecutiveHandBuiltFlightDays('2027-05-26', 6, 'A350'); // 6 in a row, meets the soft cap

    const withCarryOver = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings: buildSingleRoutePairings('A350'),
      airportTimeZones: AIRPORT_TZS,
      priorMonthTailDays,
    });
    expect(withCarryOver.days[0].assignment.type).toBe('OFF');

    const withoutCarryOver = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings: buildSingleRoutePairings('A350'),
      airportTimeZones: AIRPORT_TZS,
    });
    expect(withoutCarryOver.days[0].assignment.type).toBe('FLIGHT');
  });

  it('is a no-op when priorMonthTailDays is absent — omitted vs. explicit undefined produce identical output', () => {
    const pairings = buildSingleRoutePairings('A350');
    const inputBase = {
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    };

    const omitted = generateMonthlyRoster(inputBase);
    const explicit = generateMonthlyRoster({ ...inputBase, priorMonthTailDays: undefined });

    expect(explicit.days).toEqual(omitted.days);
    expect(explicit.evaluations).toEqual(omitted.evaluations);
    expect(explicit.summary).toEqual(omitted.summary);
  });
});

describe('generateMonthlyRoster — offReasonCounts (docs item 25)', () => {
  it('tallies MONTH_PACING once weekly pacing is suppressed and legality never binds (docs items 23/25)', () => {
    // With targetBlockMinutesMin set unreachably high, weekly pacing (item
    // 21 layer 2) is suppressed for the whole month (item 23) — the only
    // remaining OFF-day causes are the consecutive-duty soft cap and,
    // eventually, this month-level backstop. Confirmed the ordinary
    // (unsuppressed) weekly-pacing pace usually reaches the month target
    // well before day 24 on its own, making MONTH_PACING rare in practice —
    // this fixture deliberately removes that competing mechanism to
    // exercise the backstop directly.
    const pairings = buildDailySingleLegPairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMin: 999_999 * 60,
    });

    expect(result.summary.offReasonCounts.MONTH_PACING).toBeGreaterThan(0);
  });

  it('tallies WEEKLY_PACING for the fixture item 22 already uses to isolate it, and CONSECUTIVE_CAP for the plain single-route fixture', () => {
    const weeklyPacingResult = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings: buildDailyTwoDayRoutePairings('A350'),
      airportTimeZones: AIRPORT_TZS,
    });
    expect(weeklyPacingResult.summary.offReasonCounts.WEEKLY_PACING).toBeGreaterThan(0);

    // buildDailyTwoDayRoutePairings' own 2-day trips never chain long
    // enough to hit the 6-day consecutive-duty soft cap — the plain
    // single-route (3-day trip) fixture with no budget set does, by
    // chaining consecutive trips back-to-back.
    const consecutiveCapResult = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings: buildSingleRoutePairings('A350'),
      airportTimeZones: AIRPORT_TZS,
    });
    expect(consecutiveCapResult.summary.offReasonCounts.CONSECUTIVE_CAP).toBeGreaterThan(0);
  });

  it('tallies STREAK_EXTENSION for the same fixture — item 22 already proves it produces varying-length OFF blocks, which requires at least one extension firing', () => {
    const pairings = buildDailyTwoDayRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    });

    expect(result.summary.offReasonCounts.STREAK_EXTENSION).toBeGreaterThan(0);
  });

  it('tallies NO_ELIGIBLE_CANDIDATE for the hard-ceiling fixture (docs item 20) once the budget is exhausted', () => {
    const pairings = buildSingleRoutePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutesMax: 1400,
    });

    expect(result.summary.offReasonCounts.NO_ELIGIBLE_CANDIDATE).toBeGreaterThan(0);
  });

  it('offReasonCounts values always sum to summary.offDays', () => {
    const pairings = buildFixturePairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    });

    const sum = Object.values(result.summary.offReasonCounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.summary.offDays);
  });
});

/** Every distinct non-DXB station a FLIGHT day's pairing visits. */
function flightDayDestinations(day: ReturnType<typeof generateMonthlyRoster>['days'][number]): string[] {
  if (day.assignment.type !== 'FLIGHT') return [];
  const stations = new Set<string>();
  for (const leg of day.assignment.pairing.legs) {
    if (leg.instance.depIata !== 'DXB') stations.add(leg.instance.depIata);
    if (leg.instance.arrIata !== 'DXB') stations.add(leg.instance.arrIata);
  }
  return [...stations];
}

describe('generateMonthlyRoster — destination mix (docs item 26)', () => {
  it('MIX rotates across all available destinations instead of repeatedly picking the same one', () => {
    // Diagnosed against the user's real live October 2026 roster: 4 of 5
    // pairings that month went to the exact same destination (ICN), because
    // MIX only ever balanced haul type, never destination. This fixture
    // holds haul type constant across 3 different-destination routes so any
    // resulting distribution is attributable only to destination-mix
    // ordering, not haul-type balancing.
    const pairings = buildSameHaulDifferentDestPairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    });

    const destCounts: Record<string, number> = { DD1: 0, DD2: 0, DD3: 0 };
    let totalPairingDays = 0;
    for (const day of result.days) {
      for (const dest of flightDayDestinations(day)) {
        destCounts[dest] = (destCounts[dest] ?? 0) + 1;
        totalPairingDays += 1;
      }
    }

    // All 3 destinations actually got flown at least once...
    expect(destCounts.DD1).toBeGreaterThan(0);
    expect(destCounts.DD2).toBeGreaterThan(0);
    expect(destCounts.DD3).toBeGreaterThan(0);
    // ...and none of them dominates the month the way the real live roster
    // showed (4 of 5 = 80% to one destination) — a generous 60% ceiling
    // still clearly distinguishes genuine rotation from that failure mode.
    const maxShare = Math.max(destCounts.DD1, destCounts.DD2, destCounts.DD3) / totalPairingDays;
    expect(maxShare).toBeLessThanOrEqual(0.6);
  });

  it('still balances haul type as before when destinations are held constant (docs item 20 regression guard)', () => {
    // buildHaulMixPairings' own SHORT/MEDIUM/LONG routes are each a
    // DIFFERENT destination too, so this doubles as a sanity check that
    // adding the destination signal didn't break haul-type balancing —
    // every haul type should still appear.
    const pairings = buildHaulMixPairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    });

    const haulCounts: Record<HaulType, number> = { SHORT: 0, MEDIUM: 0, LONG: 0 };
    for (const day of result.days) {
      if (day.assignment.type === 'FLIGHT' && day.assignment.dayOfPairing === 1) {
        haulCounts[classifyHaulType(day.assignment.pairing)] += 1;
      }
    }
    expect(haulCounts.SHORT).toBeGreaterThan(0);
    expect(haulCounts.MEDIUM).toBeGreaterThan(0);
    expect(haulCounts.LONG).toBeGreaterThan(0);
  });
});

describe('generateMonthlyRoster — recurrent extended recovery rest (docs item 27)', () => {
  // 7 short home-base round-trips, each separated by exactly a 30h rest gap
  // (well above the 12h min-rest floor, but under the 36h extended-
  // recovery-rest threshold) — no gap ever qualifies on its own, so by the
  // 7th duty more than 168h have elapsed since the roster's own start
  // (day 1's report) without a single qualifying rest.
  function buildSpacedShortDuties(count: number): RosterGenDay[] {
    const days: RosterGenDay[] = [];
    let depUTC = new Date('2027-06-01T08:00:00.000Z');
    for (let k = 0; k < count; k += 1) {
      const arrUTC = new Date(depUTC.getTime() + 60 * 60_000); // 1h block
      const date = depUTC.toISOString().slice(0, 10);
      days.push(buildHandBuiltFlightDay(date, 'A350', 'DXB', depUTC, 'DXB', arrUTC, 60));
      const dutyEndUTC = new Date(arrUTC.getTime() + 30 * 60_000); // +30min debrief
      const nextReportUTC = new Date(dutyEndUTC.getTime() + 30 * 60 * 60_000); // 30h rest gap
      depUTC = new Date(nextReportUTC.getTime() + 90 * 60_000); // next STD = report + 90min
    }
    return days;
  }

  it('flags RED once 168h have elapsed since the last qualifying (>=36h, >=2 local nights) rest', () => {
    const days = buildSpacedShortDuties(7);
    const evaluations = evaluateRosterDays(days, AIRPORT_TZS);

    const onLastDay = evaluations.filter((e) => e.date === days[days.length - 1].date);
    expect(
      onLastDay.some(
        (e) =>
          e.evaluation.citation.ruleId === 'gcaa-days-off-extended-recovery-rest' &&
          e.evaluation.severity === 'RED'
      )
    ).toBe(true);
  });

  it('is GREEN on every day when only enough duties for 168h have NOT yet elapsed', () => {
    const days = buildSpacedShortDuties(5); // ~5*30h-ish span, under 168h
    const evaluations = evaluateRosterDays(days, AIRPORT_TZS);

    expect(
      evaluations.some(
        (e) =>
          e.evaluation.citation.ruleId === 'gcaa-days-off-extended-recovery-rest' &&
          e.evaluation.severity === 'RED'
      )
    ).toBe(false);
  });

  it('resets the clock once a genuinely qualifying rest (>=36h, >=2 local nights) occurs', () => {
    const spaced = buildSpacedShortDuties(6); // not yet overdue
    // Append one more duty separated by a real 48h gap (>=36h, spans 2 local
    // nights at DXB, UTC+4) from the 6th duty's end — this SHOULD qualify
    // and reset the clock, so a duty placed right after it stays GREEN even
    // though the cumulative elapsed time since day 1 would otherwise exceed
    // 168h.
    const sixth = spaced[spaced.length - 1];
    const sixthArrUTC =
      sixth.assignment.type === 'FLIGHT' ? sixth.assignment.pairing.legs[0].instance.arrUTC : null;
    if (!sixthArrUTC) throw new Error('test fixture assumption broken');
    const dutyEndUTC = new Date(sixthArrUTC.getTime() + 30 * 60_000);
    const qualifyingRestReportUTC = new Date(dutyEndUTC.getTime() + 48 * 60 * 60_000);
    const seventhDepUTC = new Date(qualifyingRestReportUTC.getTime() + 90 * 60_000);
    const seventhArrUTC = new Date(seventhDepUTC.getTime() + 60 * 60_000);
    const seventh = buildHandBuiltFlightDay(
      seventhDepUTC.toISOString().slice(0, 10),
      'A350',
      'DXB',
      seventhDepUTC,
      'DXB',
      seventhArrUTC,
      60
    );

    const days = [...spaced, seventh];
    const evaluations = evaluateRosterDays(days, AIRPORT_TZS);
    const onSeventhDay = evaluations.filter((e) => e.date === seventh.date);
    expect(
      onSeventhDay.some(
        (e) =>
          e.evaluation.citation.ruleId === 'gcaa-days-off-extended-recovery-rest' &&
          e.evaluation.severity === 'RED'
      )
    ).toBe(false);
  });

  it('generateMonthlyRoster construction never gets permanently stuck OFF chasing this check (regression guard for a real bug found while building this item)', () => {
    // While implementing this item, an ordering bug (evaluating "hours
    // overdue" using the OLD anchor even when the CURRENT day's own rest
    // cures the overdue-ness) made every candidate look permanently RED
    // once the roster went overdue once, so the construction loop simply
    // stopped flying for the rest of the month. buildHaulMixPairings is
    // exactly the fixture that surfaced it.
    const pairings = buildHaulMixPairings('A350');
    const result = generateMonthlyRoster({
      fleetType: 'A350',
      year: YEAR,
      month: MONTH,
      pairings,
      airportTimeZones: AIRPORT_TZS,
    });

    expect(result.summary.flightDays).toBeGreaterThan(0);
    const reds = result.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
  });
});
