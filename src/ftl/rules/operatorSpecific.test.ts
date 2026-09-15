import { describe, expect, it } from 'vitest';
import {
  evaluateAugmentedCrewRestFacilityTable,
  evaluateOperatorPairingAndStandbyLimits,
  evaluateUlrFtlVariationScheme,
} from './operatorSpecific';

describe('operator-specific placeholders — default (no override)', () => {
  it('evaluateUlrFtlVariationScheme is AMBER and flagged operator-specific by default', () => {
    const result = evaluateUlrFtlVariationScheme();
    expect(result.severity).toBe('AMBER');
    expect(result.isOperatorSpecific).toBe(true);
  });

  it('evaluateUlrFtlVariationScheme AMBER message cites the real EASA CS FTL.1.205(c) Class 1 figures', () => {
    const result = evaluateUlrFtlVariationScheme();
    expect(result.message).toMatch(/EASA/);
    expect(result.message).toContain('960');
    expect(result.message).toContain('1020');
    expect(result.message).toMatch(/not Emirates|NOT Emirates/i);
  });

  it('evaluateAugmentedCrewRestFacilityTable is AMBER and flagged operator-specific by default', () => {
    const result = evaluateAugmentedCrewRestFacilityTable();
    expect(result.severity).toBe('AMBER');
    expect(result.isOperatorSpecific).toBe(true);
  });

  it('evaluateAugmentedCrewRestFacilityTable AMBER message cites the real EASA CS FTL.1.205(c) Class 1 figures', () => {
    const result = evaluateAugmentedCrewRestFacilityTable();
    expect(result.message).toMatch(/EASA/);
    expect(result.message).toContain('960');
    expect(result.message).toContain('1020');
    expect(result.message).toMatch(/not Emirates|NOT Emirates/i);
  });

  it('evaluateOperatorPairingAndStandbyLimits is AMBER and flagged operator-specific by default', () => {
    const result = evaluateOperatorPairingAndStandbyLimits();
    expect(result.severity).toBe('AMBER');
    expect(result.isOperatorSpecific).toBe(true);
  });

  it('all three default to AMBER even with an empty overrides object', () => {
    expect(evaluateUlrFtlVariationScheme({}).severity).toBe('AMBER');
    expect(evaluateAugmentedCrewRestFacilityTable({}).severity).toBe('AMBER');
    expect(evaluateOperatorPairingAndStandbyLimits({}).severity).toBe('AMBER');
  });

  it('an empty overrides object does NOT trigger the new sentinel semantics for item 3 (still AMBER, not GREEN)', () => {
    const result = evaluateOperatorPairingAndStandbyLimits({});
    expect(result.severity).toBe('AMBER');
  });
});

describe('operator-specific placeholders — with an explicit override', () => {
  it('evaluateUlrFtlVariationScheme respects an override: GREEN, still flagged, mentions the value', () => {
    const result = evaluateUlrFtlVariationScheme({
      ulrFtlVariationMaxFdpMinutes: 1080,
    });
    expect(result.severity).toBe('GREEN');
    expect(result.isOperatorSpecific).toBe(true);
    expect(result.message).toContain('1080');
    expect(result.message).toMatch(/user-entered/i);
  });

  it('evaluateAugmentedCrewRestFacilityTable respects an override', () => {
    const result = evaluateAugmentedCrewRestFacilityTable({
      augmentedCrewRestFacilityMaxFdpMinutes: 1200,
    });
    expect(result.severity).toBe('GREEN');
    expect(result.isOperatorSpecific).toBe(true);
  });

  it('evaluateOperatorPairingAndStandbyLimits respects a maxPairingsPerMonth override', () => {
    const result = evaluateOperatorPairingAndStandbyLimits({
      maxPairingsPerMonth: 18,
    });
    expect(result.severity).toBe('GREEN');
    expect(result.message).toContain('18');
  });

  it('evaluateOperatorPairingAndStandbyLimits respects a standby-definition override', () => {
    const result = evaluateOperatorPairingAndStandbyLimits({
      standbyContactablePeriodDefinition: '12h airport standby',
    });
    expect(result.severity).toBe('GREEN');
    expect(result.message).toContain('12h airport standby');
  });
});

describe('operator-specific placeholders — explicit operator-confirmation sentinels (item 3)', () => {
  it("maxPairingsPerMonth: 'none' resolves GREEN with an operator-confirmed-no-cap message, not a configured-limit message", () => {
    const result = evaluateOperatorPairingAndStandbyLimits({ maxPairingsPerMonth: 'none' });
    expect(result.severity).toBe('GREEN');
    expect(result.isOperatorSpecific).toBe(true);
    expect(result.message).toMatch(/confirmed/i);
    expect(result.message).toMatch(/no.*cap/i);
  });

  it("standbyContactablePeriodDefinition: 'not_used' resolves GREEN with an operator-confirmed-standby-not-used message", () => {
    const result = evaluateOperatorPairingAndStandbyLimits({
      standbyContactablePeriodDefinition: 'not_used',
    });
    expect(result.severity).toBe('GREEN');
    expect(result.isOperatorSpecific).toBe(true);
    expect(result.message).toMatch(/confirmed/i);
    expect(result.message).toMatch(/standby/i);
  });

  it('both sentinels together resolve GREEN and the message mentions both confirmations', () => {
    const result = evaluateOperatorPairingAndStandbyLimits({
      maxPairingsPerMonth: 'none',
      standbyContactablePeriodDefinition: 'not_used',
    });
    expect(result.severity).toBe('GREEN');
    expect(result.message).toMatch(/no.*cap/i);
    expect(result.message).toMatch(/standby/i);
  });

  it('a real numeric cap still works exactly as before alongside the new sentinel type (not confused with it)', () => {
    const result = evaluateOperatorPairingAndStandbyLimits({ maxPairingsPerMonth: 18 });
    expect(result.severity).toBe('GREEN');
    expect(result.message).toContain('18');
    expect(result.message).not.toMatch(/confirmed/i);
  });
});
