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

  it('evaluateAugmentedCrewRestFacilityTable is AMBER and flagged operator-specific by default', () => {
    const result = evaluateAugmentedCrewRestFacilityTable();
    expect(result.severity).toBe('AMBER');
    expect(result.isOperatorSpecific).toBe(true);
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
