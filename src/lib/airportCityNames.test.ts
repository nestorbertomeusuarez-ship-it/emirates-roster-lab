import { describe, expect, it } from 'vitest';
import { cityLabel, routeLabel } from './airportCityNames';

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

describe('routeLabel', () => {
  it('labels every non-home station, including the origin of a return leg', () => {
    expect(routeLabel(['KIX', 'DXB'])).toBe('KIX (Osaka)–DXB');
  });

  it('labels a turnaround destination sitting mid-route', () => {
    expect(routeLabel(['DXB', 'BOM', 'DXB'])).toBe('DXB–BOM (Mumbai)–DXB');
  });

  it('accepts a custom separator', () => {
    expect(routeLabel(['DXB', 'AKL'], ' → ')).toBe('DXB → AKL (Auckland)');
  });
});
