import { describe, expect, it } from 'vitest';
import { evaluateInFlightRest } from './inFlightRest';

describe('evaluateInFlightRest', () => {
  it('grants no extension just under the 3h threshold', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 600,
      totalRestMinutesTaken: 179,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
    });
    expect(result.severity).toBe('GREEN');
    expect(result.message).toMatch(/under 3h/);
  });

  it('applies the bunk formula at exactly the 3h threshold', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 600,
      totalRestMinutesTaken: 180,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
    });
    expect(result.severity).toBe('GREEN');
  });

  it('caps flight-crew bunk FDP at 18h', () => {
    const withinCap = evaluateInFlightRest({
      plannedFdpMinutes: 18 * 60,
      totalRestMinutesTaken: 600,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
    });
    expect(withinCap.severity).toBe('GREEN');

    const overCap = evaluateInFlightRest({
      plannedFdpMinutes: 18 * 60 + 1,
      totalRestMinutesTaken: 600,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
    });
    expect(overCap.severity).toBe('RED');
  });

  it('caps cabin-crew bunk FDP at 19h', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 19 * 60,
      totalRestMinutesTaken: 600,
      facility: 'BUNK',
      role: 'CABIN_CREW',
    });
    expect(result.severity).toBe('GREEN');
  });

  it('caps flight-crew reclining-seat FDP at 15h', () => {
    const withinCap = evaluateInFlightRest({
      plannedFdpMinutes: 15 * 60,
      totalRestMinutesTaken: 400,
      facility: 'SEAT',
      role: 'FLIGHT_CREW',
    });
    expect(withinCap.severity).toBe('GREEN');

    const overCap = evaluateInFlightRest({
      plannedFdpMinutes: 15 * 60 + 1,
      totalRestMinutesTaken: 400,
      facility: 'SEAT',
      role: 'FLIGHT_CREW',
    });
    expect(overCap.severity).toBe('RED');
  });

  it('caps cabin-crew reclining-seat FDP at 16h', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 16 * 60,
      totalRestMinutesTaken: 400,
      facility: 'SEAT',
      role: 'CABIN_CREW',
    });
    expect(result.severity).toBe('GREEN');
  });

  it('flags a claimed rest with no facility as RED', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 600,
      totalRestMinutesTaken: 200,
      facility: 'NONE',
      role: 'FLIGHT_CREW',
    });
    expect(result.severity).toBe('RED');
  });

  it('throws for negative inputs', () => {
    expect(() =>
      evaluateInFlightRest({
        plannedFdpMinutes: -1,
        totalRestMinutesTaken: 200,
        facility: 'BUNK',
        role: 'FLIGHT_CREW',
      })
    ).toThrow();
    expect(() =>
      evaluateInFlightRest({
        plannedFdpMinutes: 600,
        totalRestMinutesTaken: -1,
        facility: 'BUNK',
        role: 'FLIGHT_CREW',
      })
    ).toThrow();
  });
});
