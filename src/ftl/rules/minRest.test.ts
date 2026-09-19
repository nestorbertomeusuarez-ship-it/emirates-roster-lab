import { describe, expect, it } from 'vitest';
import { evaluateLocalNightAfterExtendedDuty, evaluateMinRest } from './minRest';

describe('evaluateMinRest — flight crew, home base', () => {
  it('requires exactly 12h when preceding duty is shorter', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'FLIGHT_CREW',
      awayFromBase: false,
      earnedRestMinutes: 720,
    });
    expect(result.severity).toBe('GREEN');
    expect(result.marginMinutes).toBe(0);
  });

  it('flags 719 min earned rest as RED (1 min short of the 12h floor)', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'FLIGHT_CREW',
      awayFromBase: false,
      earnedRestMinutes: 719,
    });
    expect(result.severity).toBe('RED');
    expect(result.marginMinutes).toBe(-1);
  });

  it('requires rest equal to preceding duty when that exceeds 12h', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 800,
      role: 'FLIGHT_CREW',
      awayFromBase: false,
      earnedRestMinutes: 800,
    });
    expect(result.severity).toBe('GREEN');
  });

  it('at-base discretion never reduces below the 12h floor', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'FLIGHT_CREW',
      awayFromBase: false,
      earnedRestMinutes: 720,
      atBaseDiscretionAppliedMinutes: 120, // requests 2h reduction, capped at 1h
    });
    // required floor is still 12h even though 1h of discretion is allowed
    expect(result.severity).toBe('GREEN');
    expect(result.marginMinutes).toBe(0);
  });
});

describe('evaluateMinRest — flight crew, away from base', () => {
  it('allows the 1h reduction to 11h with suitable accommodation and no excess travel', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'FLIGHT_CREW',
      awayFromBase: true,
      suitableAccommodationProvided: true,
      travelTimeEachWayMinutes: 30,
      earnedRestMinutes: 660,
    });
    expect(result.severity).toBe('GREEN');
    expect(result.marginMinutes).toBe(0);
  });

  it('does not reduce below 12h without suitable accommodation', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'FLIGHT_CREW',
      awayFromBase: true,
      suitableAccommodationProvided: false,
      earnedRestMinutes: 660,
    });
    expect(result.severity).toBe('RED'); // 660 < required 720
  });

  it('never applies the reduction once earned/base rest already exceeds 12h', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 800, // base min rest = 800, not the 12h floor
      role: 'FLIGHT_CREW',
      awayFromBase: true,
      suitableAccommodationProvided: true,
      earnedRestMinutes: 740, // reduced below 800, should fail
    });
    expect(result.severity).toBe('RED');
  });

  it('increases required rest by the travel-time excess over 1h total travel, exactly at the 30-min-each-way threshold', () => {
    const atThreshold = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'FLIGHT_CREW',
      awayFromBase: true,
      suitableAccommodationProvided: true,
      travelTimeEachWayMinutes: 30,
      earnedRestMinutes: 660,
    });
    expect(atThreshold.severity).toBe('GREEN'); // no surcharge yet

    const overThreshold = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'FLIGHT_CREW',
      awayFromBase: true,
      suitableAccommodationProvided: true,
      travelTimeEachWayMinutes: 45, // total travel 90 min, excess over 60 = 30
      earnedRestMinutes: 660, // still only the un-surcharged 11h
    });
    expect(overThreshold.severity).toBe('RED');
    expect(overThreshold.marginMinutes).toBe(-30);
  });
});

describe('evaluateMinRest — cabin crew', () => {
  it('requires the greater of (preceding duty - 1h) or 11h', () => {
    const shortDuty = evaluateMinRest({
      precedingDutyMinutes: 600, // -60 = 540, below 11h floor
      role: 'CABIN_CREW',
      awayFromBase: false,
      earnedRestMinutes: 660,
    });
    expect(shortDuty.severity).toBe('GREEN');
    expect(shortDuty.marginMinutes).toBe(0);

    const longDuty = evaluateMinRest({
      precedingDutyMinutes: 900, // -60 = 840, above 11h floor
      role: 'CABIN_CREW',
      awayFromBase: false,
      earnedRestMinutes: 840,
    });
    expect(longDuty.severity).toBe('GREEN');
  });

  it('at-base discretion floor never goes below 11h', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'CABIN_CREW',
      awayFromBase: false,
      earnedRestMinutes: 660,
      atBaseDiscretionAppliedMinutes: 120,
    });
    expect(result.severity).toBe('GREEN');
    expect(result.marginMinutes).toBe(0);
  });

  it('flags 659 min earned rest as RED (1 min short of the 11h floor)', () => {
    const result = evaluateMinRest({
      precedingDutyMinutes: 600,
      role: 'CABIN_CREW',
      awayFromBase: false,
      earnedRestMinutes: 659,
    });
    expect(result.severity).toBe('RED');
  });
});

describe('evaluateLocalNightAfterExtendedDuty — ORO.FTL.225.G(e)', () => {
  it('returns null when preceding duty is exactly 18h (trigger is a strict >18h)', () => {
    expect(
      evaluateLocalNightAfterExtendedDuty({
        precedingDutyMinutes: 18 * 60,
        role: 'FLIGHT_CREW',
        awayFromBase: false,
        earnedRestMinutes: 720,
        restIncludesLocalNight: false,
      })
    ).toBeNull();
  });

  it('returns null for cabin crew regardless of duty length', () => {
    expect(
      evaluateLocalNightAfterExtendedDuty({
        precedingDutyMinutes: 20 * 60,
        role: 'CABIN_CREW',
        awayFromBase: false,
        earnedRestMinutes: 720,
        restIncludesLocalNight: false,
      })
    ).toBeNull();
  });

  it('is AMBER when preceding duty exceeds 18h and restIncludesLocalNight is unknown', () => {
    const result = evaluateLocalNightAfterExtendedDuty({
      precedingDutyMinutes: 19 * 60,
      role: 'FLIGHT_CREW',
      awayFromBase: false,
      earnedRestMinutes: 720,
    });
    expect(result?.severity).toBe('AMBER');
  });

  it('is RED when preceding duty exceeds 18h and the rest does not include a local night', () => {
    const result = evaluateLocalNightAfterExtendedDuty({
      precedingDutyMinutes: 19 * 60,
      role: 'FLIGHT_CREW',
      awayFromBase: false,
      earnedRestMinutes: 720,
      restIncludesLocalNight: false,
    });
    expect(result?.severity).toBe('RED');
  });

  it('is GREEN when preceding duty exceeds 18h and the rest includes a local night', () => {
    const result = evaluateLocalNightAfterExtendedDuty({
      precedingDutyMinutes: 19 * 60,
      role: 'FLIGHT_CREW',
      awayFromBase: false,
      earnedRestMinutes: 720,
      restIncludesLocalNight: true,
    });
    expect(result?.severity).toBe('GREEN');
  });
});

describe('evaluateMinRest — validation', () => {
  it('throws for negative preceding duty or earned rest', () => {
    expect(() =>
      evaluateMinRest({
        precedingDutyMinutes: -1,
        role: 'FLIGHT_CREW',
        awayFromBase: false,
        earnedRestMinutes: 720,
      })
    ).toThrow();
    expect(() =>
      evaluateMinRest({
        precedingDutyMinutes: 600,
        role: 'FLIGHT_CREW',
        awayFromBase: false,
        earnedRestMinutes: -1,
      })
    ).toThrow();
  });
});
