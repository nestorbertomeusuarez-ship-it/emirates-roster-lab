import { describe, expect, it } from 'vitest';
import { cityLabel } from './airportCityNames';

describe('cityLabel', () => {
  it('returns the bare code for DXB, never a city suffix', () => {
    expect(cityLabel('DXB')).toBe('DXB');
  });

  it('appends the known city name for a real destination', () => {
    expect(cityLabel('AKL')).toBe('AKL (Auckland)');
    expect(cityLabel('BOM')).toBe('BOM (Mumbai)');
  });

  it('falls back to the bare code for an unknown IATA code, never guessing', () => {
    expect(cityLabel('ZZZ')).toBe('ZZZ');
  });
});
