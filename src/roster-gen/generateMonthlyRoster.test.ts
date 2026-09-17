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

describe('generateMonthlyRoster — targetBlockMinutes bias', () => {
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
  // every day of the fixture month, so day 1 has three legal candidates of
  // three distinct block-time totals to choose among.
  const MAX_ROUTE_BLOCK_MINUTES = 1000; // CCC

  function firstFlightDayPairingBlockMinutes(days: ReturnType<typeof generateMonthlyRoster>['days']): number | null {
    const first = days[0];
    if (first.assignment.type !== 'FLIGHT') return null;
    return first.assignment.pairing.legs.reduce((sum, leg) => sum + leg.instance.blockTimeMin, 0);
  }

  it('prefers the higher-block-time legal candidate over the deterministic-shuffle order while under target', () => {
    const biased = generateMonthlyRoster({ ...baseInput, targetBlockMinutes: 999_999 });
    const biasedFirstDayBlock = firstFlightDayPairingBlockMinutes(biased.days);

    // Under an effectively-unreachable target, day 1 (no rest-check history
    // yet, per item #6) should pick the highest-block-time legal candidate
    // available that day: the CCC route.
    expect(biasedFirstDayBlock).toBe(MAX_ROUTE_BLOCK_MINUTES);

    const unbiased = generateMonthlyRoster(baseInput);
    const unbiasedFirstDayBlock = firstFlightDayPairingBlockMinutes(unbiased.days);
    expect(biasedFirstDayBlock).toBeGreaterThanOrEqual(unbiasedFirstDayBlock ?? 0);
  });

  it('stops mattering once the target is already met — targetBlockMinutes: 0 matches the unbiased run exactly', () => {
    const unbiased = generateMonthlyRoster(baseInput);
    const metFromTheStart = generateMonthlyRoster({ ...baseInput, targetBlockMinutes: 0 });

    expect(metFromTheStart.days).toEqual(unbiased.days);
    expect(metFromTheStart.summary).toEqual(unbiased.summary);
  });

  it('never relaxes legality: zero RED evaluations even while the bias is active all month', () => {
    const biased = generateMonthlyRoster({ ...baseInput, targetBlockMinutes: 999_999 });
    const reds = biased.evaluations.filter((e) => e.evaluation.severity === 'RED');
    expect(reds).toEqual([]);
  });

  it('never exceeds 7 consecutive duty days or drops below the days-off floor while biased', () => {
    const biased = generateMonthlyRoster({ ...baseInput, targetBlockMinutes: 999_999 });

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

  it('reports whatever total was actually achieved without erroring when the target is unreachable', () => {
    // No candidates at all -> impossible to reach any positive target;
    // generation must still complete normally, reporting 0 achieved.
    const result = generateMonthlyRoster({
      fleetType: 'A380',
      year: YEAR,
      month: MONTH,
      pairings: [],
      airportTimeZones: AIRPORT_TZS,
      targetBlockMinutes: 999_999,
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
