import { describe, expect, it } from 'vitest';
import {
  evaluateCommanderDiscretion,
  evaluateSplitDutyExtension,
} from './discretion';

describe('evaluateCommanderDiscretion', () => {
  it('permits exactly 3h on a single-sector flight, non-emergency', () => {
    const result = evaluateCommanderDiscretion({
      extensionMinutesRequested: 180,
      isEmergency: false,
      isSingleSectorOrLastSectorOfMultiSector: true,
      combinedWithOtherReductionProvision: false,
      precededByReducedRest: false,
    });
    expect(result.severity).toBe('AMBER'); // >2h always needs a report
  });

  it('rejects just over 3h when not an emergency', () => {
    const result = evaluateCommanderDiscretion({
      extensionMinutesRequested: 181,
      isEmergency: false,
      isSingleSectorOrLastSectorOfMultiSector: true,
      combinedWithOtherReductionProvision: false,
      precededByReducedRest: false,
    });
    expect(result.severity).toBe('RED');
  });

  it('allows over 3h for a genuine emergency', () => {
    const result = evaluateCommanderDiscretion({
      extensionMinutesRequested: 200,
      isEmergency: true,
      isSingleSectorOrLastSectorOfMultiSector: true,
      combinedWithOtherReductionProvision: false,
      precededByReducedRest: false,
    });
    expect(result.severity).not.toBe('RED');
  });

  it('caps mid-duty (non-last-sector) discretion at exactly 2h', () => {
    const atCap = evaluateCommanderDiscretion({
      extensionMinutesRequested: 120,
      isEmergency: false,
      isSingleSectorOrLastSectorOfMultiSector: false,
      combinedWithOtherReductionProvision: false,
      precededByReducedRest: false,
    });
    expect(atCap.severity).toBe('GREEN'); // exactly at the 2h cap, not over the >2h report threshold

    const overCap = evaluateCommanderDiscretion({
      extensionMinutesRequested: 121,
      isEmergency: false,
      isSingleSectorOrLastSectorOfMultiSector: false,
      combinedWithOtherReductionProvision: false,
      precededByReducedRest: false,
    });
    expect(overCap.severity).toBe('RED');
  });

  it('is GREEN with no report needed at or below the 2h reporting threshold, no reduced rest', () => {
    const result = evaluateCommanderDiscretion({
      extensionMinutesRequested: 120,
      isEmergency: false,
      isSingleSectorOrLastSectorOfMultiSector: true,
      combinedWithOtherReductionProvision: false,
      precededByReducedRest: false,
    });
    expect(result.severity).toBe('GREEN');
  });

  it('requires a report just over the 2h threshold', () => {
    const result = evaluateCommanderDiscretion({
      extensionMinutesRequested: 121,
      isEmergency: false,
      isSingleSectorOrLastSectorOfMultiSector: true,
      combinedWithOtherReductionProvision: false,
      precededByReducedRest: false,
    });
    expect(result.severity).toBe('AMBER');
  });

  it('requires a report whenever preceded by reduced rest, regardless of extension length', () => {
    const result = evaluateCommanderDiscretion({
      extensionMinutesRequested: 30,
      isEmergency: false,
      isSingleSectorOrLastSectorOfMultiSector: true,
      combinedWithOtherReductionProvision: false,
      precededByReducedRest: true,
    });
    expect(result.severity).toBe('AMBER');
  });

  it('is RED when combined with another rest-reduction/duty-extension provision', () => {
    const result = evaluateCommanderDiscretion({
      extensionMinutesRequested: 30,
      isEmergency: false,
      isSingleSectorOrLastSectorOfMultiSector: true,
      combinedWithOtherReductionProvision: true,
      precededByReducedRest: false,
    });
    expect(result.severity).toBe('RED');
  });

  it('throws for a negative requested extension', () => {
    expect(() =>
      evaluateCommanderDiscretion({
        extensionMinutesRequested: -1,
        isEmergency: false,
        isSingleSectorOrLastSectorOfMultiSector: true,
        combinedWithOtherReductionProvision: false,
        precededByReducedRest: false,
      })
    ).toThrow();
  });
});

describe('evaluateSplitDutyExtension', () => {
  it('grants no extension just under 3h rest', () => {
    const result = evaluateSplitDutyExtension({
      consecutiveRestMinutesTaken: 179,
      restFacility: 'RECLINING_SEAT',
    });
    expect(result.marginMinutes).toBe(0);
  });

  it('grants half the rest as extension at exactly 3h', () => {
    const result = evaluateSplitDutyExtension({
      consecutiveRestMinutesTaken: 180,
      restFacility: 'RECLINING_SEAT',
    });
    expect(result.marginMinutes).toBe(90);
    expect(result.severity).toBe('GREEN');
  });

  it('grants half the rest as extension at exactly 10h', () => {
    const result = evaluateSplitDutyExtension({
      consecutiveRestMinutesTaken: 600,
      restFacility: 'BUNK',
    });
    expect(result.marginMinutes).toBe(300);
  });

  it('caps the extension at the 10h-row value beyond 10h rest', () => {
    const result = evaluateSplitDutyExtension({
      consecutiveRestMinutesTaken: 720,
      restFacility: 'BUNK',
    });
    expect(result.marginMinutes).toBe(300);
  });

  it('requires a reclining seat or bunk for rest <=6h', () => {
    const result = evaluateSplitDutyExtension({
      consecutiveRestMinutesTaken: 360,
      restFacility: 'NONE',
    });
    expect(result.severity).toBe('RED');
  });

  it('requires suitable accommodation for rest >6h', () => {
    const result = evaluateSplitDutyExtension({
      consecutiveRestMinutesTaken: 361,
      restFacility: 'NONE',
    });
    expect(result.severity).toBe('RED');
  });

  it('throws for a negative rest value', () => {
    expect(() =>
      evaluateSplitDutyExtension({
        consecutiveRestMinutesTaken: -1,
        restFacility: 'BUNK',
      })
    ).toThrow();
  });
});
