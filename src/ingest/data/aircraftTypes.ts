/**
 * Known aircraft type codes, used only for a soft warning (not a hard
 * validation failure) when an ingest row's advertised/observed type isn't
 * recognized. Not exhaustive — extend as needed.
 */
export const KNOWN_AIRCRAFT_TYPES: readonly string[] = [
  'A380',
  'A350',
  'A340',
  'A330',
  'B77W',
  'B773',
  'B772',
  'B788',
  'B789',
  'B78X',
  'B738',
  'B737',
];

export function isKnownAircraftType(type: string): boolean {
  return KNOWN_AIRCRAFT_TYPES.includes(type.toUpperCase());
}
