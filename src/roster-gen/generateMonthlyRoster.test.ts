import { describe, expect, it } from 'vitest';
import { generatePairings } from '../pairing/generatePairings';
import { generateMonthlyRoster } from './generateMonthlyRoster';
import type { DatedFlightInstance } from '../pairing/types';

const YEAR = 2027;
const MONTH = 6; // June 2027 — 30 days, arbitrary synthetic month
const DAYS_IN_MONTH = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();

const AIRPORT_TZS: Record<string, string> = {
  DXB: 'Asia/Dubai',
  AAA: 'Europe/London',
  BBB: 'Asia/Singapore',
  CCC: 'America/New_York',
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

describe('generateMonthlyRoster — targetBlockMinutesMin/Max range bias', () => {
  const pairings = buildFixturePairings('A350');
  const baseInput = {
    fleetType: 'A350',
    year: YEAR,
    month: MONTH,
    pairings,
    airportTimeZones: AIRPORT_TZS,
  };

  // Route block minutes as built by buildFixturePairings: AAA=240+240=480,
  // BBB=420+420=840, CCC=500+500=1000 — all three routes start on (almost)
  // every day of the fixture month. On day 1 specifically, AAA's quick-turn
  // candidate is legally screened out by the real evaluateDuty() (its
  // report-to-report FDP span exceeds the Table A max for a 2-sector duty,
  // even though its own block time is the smallest of the three) — so the
  // smallest LEGAL day-1 candidate is BBB, not AAA. This is exactly why the
  // bias only reorders among already-legal candidates: illegal ones are
  // never reachable regardless of sort direction.
  const MIN_LEGAL_DAY1_BLOCK_MINUTES = 840; // BBB (AAA is illegal on day 1 — see above)
  const MAX_ROUTE_BLOCK_MINUTES = 1000; // CCC

  function firstFlightDayPairingBlockMinutes(days: ReturnType<typeof generateMonthlyRoster>['days']): number | null {
    const first = days[0];
    if (first.assignment.type !== 'FLIGHT') return null;
    return first.assignment.pairing.legs.reduce((sum, leg) => sum + leg.instance.blockTimeMin, 0);
  }

  it('prefers the higher-block-time legal candidate over the deterministic-shuffle order while below the floor', () => {
    const biased = generateMonthlyRoster({
      ...baseInput,
      targetBlockMinutesMin: 999_999,
      targetBlockMinutesMax: 1_999_999,
    });
    const biasedFirstDayBlock = firstFlightDayPairingBlockMinutes(biased.days);

    // Under an effectively-unreachable floor, day 1 (no rest-check history
    // yet, per item #6) should pick the highest-block-time legal candidate
    // available that day: the CCC route.
    expect(biasedFirstDayBlock).toBe(MAX_ROUTE_BLOCK_MINUTES);

    const unbiased = generateMonthlyRoster(baseInput);
    const unbiasedFirstDayBlock = firstFlightDayPairingBlockMinutes(unbiased.days);
    expect(biasedFirstDayBlock).toBeGreaterThanOrEqual(unbiasedFirstDayBlock ?? 0);
  });

  it('prefers the lower-block-time legal candidate once the running total is at/above the floor', () => {
    // Floor of 0 is "already met" from day 1, so day 1 should pick the
    // LOWEST-block-time LEGAL candidate available that day: BBB (AAA's
    // smaller block time is illegal on day 1 — see the constant's comment).
    const biased = generateMonthlyRoster({
      ...baseInput,
      targetBlockMinutesMin: 0,
      targetBlockMinutesMax: 1_999_999,
    });
    const biasedFirstDayBlock = firstFlightDayPairingBlockMinutes(biased.days);
    expect(biasedFirstDayBlock).toBe(MIN_LEGAL_DAY1_BLOCK_MINUTES);
  });

  it('both undefined matches the unbiased run exactly (byte-for-byte, no bias at all)', () => {
    const unbiased = generateMonthlyRoster(baseInput);
    const explicit = generateMonthlyRoster({
      ...baseInput,
      targetBlockMinutesMin: undefined,
      targetBlockMinutesMax: undefined,
    });

    expect(explicit.days).toEqual(unbiased.days);
    expect(explicit.summary).toEqual(unbiased.summary);
  });

  it('min-only degrades to the original open-floor behavior: reverts to unbiased ordering once at/above min', () => {
    // Floor already met from day 0 (min: 0), no max configured -> no
    // further bias at all, identical to the fully-unbiased run.
    const unbiased = generateMonthlyRoster(baseInput);
    const minOnlyMet = generateMonthlyRoster({ ...baseInput, targetBlockMinutesMin: 0 });

    expect(minOnlyMet.days).toEqual(unbiased.days);
    expect(minOnlyMet.summary).toEqual(unbiased.summary);

    // Still-below-min, min-only behaves like the original open floor:
    // prefer bigger.
    const minOnlyBelow = generateMonthlyRoster({ ...baseInput, targetBlockMinutesMin: 999_999 });
    expect(firstFlightDayPairingBlockMinutes(minOnlyBelow.days)).toBe(MAX_ROUTE_BLOCK_MINUTES);
  });

  it('max-only degrades to always preferring the smaller candidate from day 1 (no floor phase)', () => {
    const maxOnly = generateMonthlyRoster({ ...baseInput, targetBlockMinutesMax: 1_999_999 });
    expect(firstFlightDayPairingBlockMinutes(maxOnly.days)).toBe(MIN_LEGAL_DAY1_BLOCK_MINUTES);
  });

  it('never relaxes legality: zero RED evaluations even while the range bias is active all month', () => {
    const biased = generateMonthlyRoster({
      ...baseInput,
      targetBlockMinutesMin: 999_999,
      targetBlockMinutesMax: 1_999_999,
    });
    const reds = biased.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
  });

  it('never exceeds 7 consecutive duty days or drops below the days-off floor while range-biased', () => {
    const biased = generateMonthlyRoster({
      ...baseInput,
      targetBlockMinutesMin: 999_999,
      targetBlockMinutesMax: 1_999_999,
    });

    let run = 0;
    let maxRun = 0;
    for (const day of biased.days) {
      if (day.assignment.type === 'FLIGHT') {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 0;
      }
    }
    expect(maxRun).toBeLessThanOrEqual(7);

    const offCount = biased.days.filter((d) => d.assignment.type === 'OFF').length;
    expect(offCount).toBeGreaterThanOrEqual(7);
  });

  it('reports whatever total was actually achieved without erroring when the floor is unreachable', () => {
    // No candidates at all -> impossible to reach any positive floor;
    // generation must still complete normally, reporting 0 achieved.
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
