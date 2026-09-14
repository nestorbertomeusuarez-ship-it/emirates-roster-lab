import { describe, expect, it } from 'vitest';
import { maxFdpMinutes } from './fdpTables';

describe('maxFdpMinutes — Table A (acclimatised) band boundaries', () => {
  it('05:59 falls in the 22:00-05:59 band (wraps past midnight)', () => {
    expect(maxFdpMinutes('05:59', 1, true)).toBe(11 * 60); // 11:00
  });

  it('06:00 crosses into the 06:00-07:59 band', () => {
    expect(maxFdpMinutes('06:00', 1, true)).toBe(13 * 60); // 13:00
  });

  it('07:59 stays in the 06:00-07:59 band', () => {
    expect(maxFdpMinutes('07:59', 1, true)).toBe(13 * 60);
  });

  it('08:00 crosses into the 08:00-12:59 band', () => {
    expect(maxFdpMinutes('08:00', 1, true)).toBe(14 * 60); // 14:00
  });

  it('21:59 stays in the 18:00-21:59 band, 22:00 crosses into 22:00-05:59', () => {
    expect(maxFdpMinutes('21:59', 1, true)).toBe(12 * 60); // 12:00
    expect(maxFdpMinutes('22:00', 1, true)).toBe(11 * 60); // 11:00
  });
});

describe('maxFdpMinutes — Table A sector-count boundaries', () => {
  it('exactly 7 sectors vs exactly 8 sectors in the 08:00-12:59 band', () => {
    expect(maxFdpMinutes('09:00', 7, true)).toBe(10 * 60); // 10:00
    expect(maxFdpMinutes('09:00', 8, true)).toBe(9 * 60 + 30); // 9:30
  });

  it('9+ sectors clamp to the 8-sector column', () => {
    expect(maxFdpMinutes('09:00', 12, true)).toBe(maxFdpMinutes('09:00', 8, true));
  });

  it('reads every published value in the 06:00-07:59 row', () => {
    const expected = [780, 735, 690, 645, 600, 570, 540, 540];
    expected.forEach((minutes, i) => {
      expect(maxFdpMinutes('07:00', i + 1, true)).toBe(minutes);
    });
  });
});

describe('maxFdpMinutes — Table B (not acclimatised) rest-hour boundaries', () => {
  it('exactly 18h preceding rest uses the "up to 18h" row', () => {
    expect(maxFdpMinutes('10:00', 1, false, 18)).toBe(13 * 60); // 13:00
  });

  it('18.01h preceding rest crosses into the "18h-30h" row', () => {
    expect(maxFdpMinutes('10:00', 1, false, 18.01)).toBe(11 * 60 + 30); // 11:30
  });

  it('exactly 30h preceding rest stays in the "18h-30h" row', () => {
    expect(maxFdpMinutes('10:00', 1, false, 30)).toBe(11 * 60 + 30); // 11:30
  });

  it('30.01h preceding rest crosses back into the "over 30h" row', () => {
    expect(maxFdpMinutes('10:00', 1, false, 30.01)).toBe(13 * 60); // 13:00
  });

  it('exactly 0h preceding rest uses the "up to 18h" row', () => {
    expect(maxFdpMinutes('10:00', 1, false, 0)).toBe(13 * 60);
  });
});

describe('maxFdpMinutes — Table B sector-count boundary (6 vs 7+)', () => {
  it('exactly 6 sectors vs 7+ sectors in the "up to 18h" row', () => {
    expect(maxFdpMinutes('10:00', 6, false, 10)).toBe(9 * 60 + 15); // 9:15
    expect(maxFdpMinutes('10:00', 7, false, 10)).toBe(9 * 60); // 9:00
    expect(maxFdpMinutes('10:00', 10, false, 10)).toBe(9 * 60); // clamps
  });
});

describe('maxFdpMinutes — validation', () => {
  it('throws for a malformed local time', () => {
    expect(() => maxFdpMinutes('25:00', 1, true)).toThrow();
    expect(() => maxFdpMinutes('9:00', 1, true)).toThrow();
  });

  it('throws for a non-positive or non-integer sector count', () => {
    expect(() => maxFdpMinutes('09:00', 0, true)).toThrow();
    expect(() => maxFdpMinutes('09:00', 1.5, true)).toThrow();
  });

  it('throws when not acclimatised and precedingRestHours is missing', () => {
    expect(() => maxFdpMinutes('09:00', 1, false)).toThrow();
  });
});
