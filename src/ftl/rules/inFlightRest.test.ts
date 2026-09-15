import { describe, expect, it } from 'vitest';
import { evaluateInFlightRest } from './inFlightRest';

describe('evaluateInFlightRest', () => {
  it('grants no extension just under the 3h threshold', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 600,
      totalRestMinutesTaken: 179,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 600,
    });
    expect(result.severity).toBe('GREEN');
    expect(result.message).toMatch(/under 3h/);
  });

  it('RED when the planned FDP exceeds the base-plus-extension allowance, even though it is well under the absolute cap', () => {
    // This is the exact scenario that exposed the bug this test file was
    // rewritten for: a short-report-time duty (base FDP from the table is
    // only 10h = 600 min), exactly the 3h rest-eligibility floor taken on a
    // bunk (extension = 3h/2 = 1.5h), so the real allowed FDP is
    // 10h + 1.5h = 11.5h (690 min) — nowhere near the 18h absolute bunk
    // ceiling. A 15h planned FDP must be RED under the real
    // ORO.FTL.215.G(e) formula (base + extension, capped by the ceiling),
    // not GREEN just because it's under the ceiling alone.
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 15 * 60,
      totalRestMinutesTaken: 180,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 600,
    });
    expect(result.severity).toBe('RED');
    expect(result.marginMinutes).toBe(690 - 15 * 60);
  });

  it('GREEN when the planned FDP is within the base-plus-extension allowance', () => {
    // Same base/rest/facility as above, but a planned FDP that actually
    // fits within the 11.5h (690 min) real allowance.
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 660,
      totalRestMinutesTaken: 180,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 600,
    });
    expect(result.severity).toBe('GREEN');
    expect(result.marginMinutes).toBe(690 - 660);
  });

  it('applies the seat formula (divide by 3) the same way', () => {
    // base 540 (9h) + extension 240/3=80 = 620 (10h20) real allowance.
    const withinAllowance = evaluateInFlightRest({
      plannedFdpMinutes: 600,
      totalRestMinutesTaken: 240,
      facility: 'SEAT',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 540,
    });
    expect(withinAllowance.severity).toBe('GREEN');

    const overAllowance = evaluateInFlightRest({
      plannedFdpMinutes: 630,
      totalRestMinutesTaken: 240,
      facility: 'SEAT',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 540,
    });
    expect(overAllowance.severity).toBe('RED');
  });

  it('caps flight-crew bunk FDP at 18h regardless of how generous base+extension would otherwise allow', () => {
    // A deliberately large base + large rest-based extension so the formula
    // alone would allow well over 18h — the absolute ceiling must still bind.
    const withinCap = evaluateInFlightRest({
      plannedFdpMinutes: 18 * 60,
      totalRestMinutesTaken: 600,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 20 * 60,
    });
    expect(withinCap.severity).toBe('GREEN');

    const overCap = evaluateInFlightRest({
      plannedFdpMinutes: 18 * 60 + 1,
      totalRestMinutesTaken: 600,
      facility: 'BUNK',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 20 * 60,
    });
    expect(overCap.severity).toBe('RED');
  });

  it('caps cabin-crew bunk FDP at 19h regardless of how generous base+extension would otherwise allow', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 19 * 60,
      totalRestMinutesTaken: 600,
      facility: 'BUNK',
      role: 'CABIN_CREW',
      baseFdpMinutes: 20 * 60,
    });
    expect(result.severity).toBe('GREEN');
  });

  it('caps flight-crew reclining-seat FDP at 15h regardless of how generous base+extension would otherwise allow', () => {
    const withinCap = evaluateInFlightRest({
      plannedFdpMinutes: 15 * 60,
      totalRestMinutesTaken: 400,
      facility: 'SEAT',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 16 * 60,
    });
    expect(withinCap.severity).toBe('GREEN');

    const overCap = evaluateInFlightRest({
      plannedFdpMinutes: 15 * 60 + 1,
      totalRestMinutesTaken: 400,
      facility: 'SEAT',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 16 * 60,
    });
    expect(overCap.severity).toBe('RED');
  });

  it('caps cabin-crew reclining-seat FDP at 16h regardless of how generous base+extension would otherwise allow', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 16 * 60,
      totalRestMinutesTaken: 400,
      facility: 'SEAT',
      role: 'CABIN_CREW',
      baseFdpMinutes: 17 * 60,
    });
    expect(result.severity).toBe('GREEN');
  });

  it('flags a claimed rest with no facility as RED', () => {
    const result = evaluateInFlightRest({
      plannedFdpMinutes: 600,
      totalRestMinutesTaken: 200,
      facility: 'NONE',
      role: 'FLIGHT_CREW',
      baseFdpMinutes: 600,
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
        baseFdpMinutes: 600,
      })
    ).toThrow();
    expect(() =>
      evaluateInFlightRest({
        plannedFdpMinutes: 600,
        totalRestMinutesTaken: -1,
        facility: 'BUNK',
        role: 'FLIGHT_CREW',
        baseFdpMinutes: 600,
      })
    ).toThrow();
    expect(() =>
      evaluateInFlightRest({
        plannedFdpMinutes: 600,
        totalRestMinutesTaken: 200,
        facility: 'BUNK',
        role: 'FLIGHT_CREW',
        baseFdpMinutes: -1,
      })
    ).toThrow();
  });
});
