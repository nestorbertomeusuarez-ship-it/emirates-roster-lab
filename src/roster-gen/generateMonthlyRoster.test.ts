import { describe, expect, it } from 'vitest';
import { generatePairings } from '../pairing/generatePairings';
import { generateMonthlyRoster } from './generateMonthlyRoster';
import { classifyHaulType, type HaulType } from './haulType';
import type { DatedFlightInstance, GeneratedPairing } from '../pairing/types';
import type { GenerationStrategy } from './types';

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
