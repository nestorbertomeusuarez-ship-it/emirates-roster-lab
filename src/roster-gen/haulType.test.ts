import { describe, expect, it } from 'vitest';
import { classifyHaulType } from './haulType';
import type { DatedFlightInstance, GeneratedPairing, PairingLegResult } from '../pairing/types';

function buildInstance(blockTimeMin: number): DatedFlightInstance {
  return {
    scheduleLineId: 'test-line',
    number: 'EK000',
    depIata: 'DXB',
    arrIata: 'XXX',
    serviceDate: '2027-06-01',
    depUTC: new Date('2027-06-01T00:00:00.000Z'),
    arrUTC: new Date('2027-06-01T00:00:00.000Z'),
    blockTimeMin,
    aircraftType: 'A350',
  };
}

function buildLeg(blockTimeMin: number): PairingLegResult {
  return {
    instance: buildInstance(blockTimeMin),
    layoverMinutesBeforeThisLeg: null,
  };
}

function buildPairing(legBlockMinutes: number[]): GeneratedPairing {
  return {
    fleetType: 'A350',
    legs: legBlockMinutes.map((min) => buildLeg(min)),
    startServiceDate: '2027-06-01',
    endServiceDate: '2027-06-01',
    tripDays: 1,
  };
}

describe('classifyHaulType', () => {
  it('classifies a pure short-haul pairing (< 180min longest leg) as SHORT', () => {
    expect(classifyHaulType(buildPairing([90, 120]))).toBe('SHORT');
  });

  it('classifies a pure medium-haul pairing (180-360min longest leg) as MEDIUM', () => {
    expect(classifyHaulType(buildPairing([240, 250]))).toBe('MEDIUM');
  });

  it('classifies a pure long-haul pairing (> 360min longest leg) as LONG', () => {
    expect(classifyHaulType(buildPairing([500, 480]))).toBe('LONG');
  });

  it('classifies a mixed multi-leg pairing by its LONGEST leg, not average or total', () => {
    // 3-leg trip: two short sectors + one long sector -> LONG overall, even
    // though the average (~197min) or total (~590min) would suggest
    // something smaller/different than what the single long sector demands.
    expect(classifyHaulType(buildPairing([90, 400, 100]))).toBe('LONG');
  });

  it('a mixed pairing with only short+medium legs (no long sector) classifies as MEDIUM by its longest leg', () => {
    expect(classifyHaulType(buildPairing([90, 300]))).toBe('MEDIUM');
  });

  it('boundary: exactly 180min longest leg is MEDIUM, not SHORT', () => {
    expect(classifyHaulType(buildPairing([180]))).toBe('MEDIUM');
  });

  it('boundary: exactly 360min longest leg is MEDIUM, not LONG', () => {
    expect(classifyHaulType(buildPairing([360]))).toBe('MEDIUM');
  });

  it('boundary: 361min longest leg is LONG', () => {
    expect(classifyHaulType(buildPairing([361]))).toBe('LONG');
  });

  it('boundary: 179min longest leg is SHORT', () => {
    expect(classifyHaulType(buildPairing([179]))).toBe('SHORT');
  });
});
