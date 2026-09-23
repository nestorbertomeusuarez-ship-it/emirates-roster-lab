/**
 * IATA -> city name lookup, for display purposes only (never fed into any
 * GCAA evaluation — this is cosmetic labeling, not normative/regulatory
 * data, so it does not need the sourced-and-dated citation trail
 * `docs/gcaa-sources.md` requires for FTL rule values).
 *
 * Direct user feedback (2026-09-17): "añade al codigo IATA de destino el
 * nombre de la ciudad, dxb no hace falta" — DXB is the home base, shown on
 * every single day, and doesn't need a city label; every other station
 * does.
 *
 * Covers every distinct destination IATA code that appears in the seeded
 * DXB schedule (`prisma/seed-data/dxb-seed-schedule.json`) — see
 * `docs/data-sources.md` for that schedule's own provenance. If a future
 * seed expansion introduces a new destination not in this map,
 * `cityLabel()` below falls back to the bare IATA code rather than
 * guessing a name.
 */
export const AIRPORT_CITY_NAMES: Readonly<Record<string, string>> = {
  ADL: 'Adelaide',
  AKL: 'Auckland',
  AMD: 'Ahmedabad',
  AMM: 'Amman',
  AMS: 'Amsterdam',
  BAH: 'Bahrain',
  BCN: 'Barcelona',
  BGW: 'Baghdad',
  BHX: 'Birmingham',
  BKK: 'Bangkok',
  BLQ: 'Bologna',
  BLR: 'Bengaluru',
  BNE: 'Brisbane',
  BOM: 'Mumbai',
  CAI: 'Cairo',
  CDG: 'Paris',
  CGK: 'Jakarta',
  CHC: 'Christchurch',
  CMB: 'Colombo',
  CMN: 'Casablanca',
  CPH: 'Copenhagen',
  CPT: 'Cape Town',
  DEL: 'Delhi',
  DMM: 'Dammam',
  DPS: 'Denpasar (Bali)',
  DUS: 'Düsseldorf',
  EDI: 'Edinburgh',
  FCO: 'Rome',
  FRA: 'Frankfurt',
  GLA: 'Glasgow',
  GRU: 'São Paulo',
  HAM: 'Hamburg',
  HEL: 'Helsinki',
  HKG: 'Hong Kong',
  HKT: 'Phuket',
  IAD: 'Washington, D.C.',
  IAH: 'Houston',
  ICN: 'Seoul',
  ISB: 'Islamabad',
  IST: 'Istanbul',
  JED: 'Jeddah',
  JFK: 'New York',
  JNB: 'Johannesburg',
  KIX: 'Osaka',
  KUL: 'Kuala Lumpur',
  KWI: 'Kuwait City',
  LAX: 'Los Angeles',
  LCA: 'Larnaca',
  LGW: 'London',
  LHR: 'London',
  LYS: 'Lyon',
  MAD: 'Madrid',
  MAN: 'Manchester',
  MCT: 'Muscat',
  MEL: 'Melbourne',
  MLA: 'Malta',
  MRU: 'Mauritius',
  MXP: 'Milan',
  NBO: 'Nairobi',
  NCE: 'Nice',
  NRT: 'Tokyo',
  OSL: 'Oslo',
  PER: 'Perth',
  PRG: 'Prague',
  PVG: 'Shanghai',
  RUH: 'Riyadh',
  SFO: 'San Francisco',
  SGN: 'Ho Chi Minh City',
  SIN: 'Singapore',
  SVO: 'Moscow',
  DME: 'Moscow',
  SYD: 'Sydney',
  TPE: 'Taipei',
  VIE: 'Vienna',
  YUL: 'Montreal',
  YYZ: 'Toronto',
  ZRH: 'Zurich',
};

/**
 * Formats an IATA code for display: `"AKL (Auckland)"` when a city name is
 * known and it isn't the home base, otherwise just the bare code (DXB, or
 * any future destination not yet in `AIRPORT_CITY_NAMES`).
 */
export function cityLabel(iata: string): string {
  if (iata === 'DXB') return iata;
  const city = AIRPORT_CITY_NAMES[iata];
  return city ? `${iata} (${city})` : iata;
}
