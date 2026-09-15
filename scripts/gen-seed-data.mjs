// One-off generator for the expanded DXB seed schedule (Part A of the
// roster-lab extension task). NOT part of the app; run once via
// `node scripts/gen-seed-data.mjs` to (re)write:
//   - prisma/seed-data/dxb-seed-schedule.json
//   - src/ingest/data/airports-reference.json (new airports appended)
//
// Rationale for generating rather than hand-typing ~110 flight records:
// stdUTCMin/staUTCMin/arrivalDayOffset must be internally consistent with
// each route's real-world block time (blockTimeMin is derived from them by
// computeBlockTimeMin, not stored directly), and hand-computing that for
// ~55 routes x 2 directions is exactly the kind of arithmetic that silently
// drifts. This script is the single place block-time -> UTC-minute-of-day
// arithmetic happens; the *route data itself* (block times, confidence,
// notes) is the human/research-sourced content described in the task.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const EFFECTIVE_FROM = '2026-10-01';
const EFFECTIVE_TO = '2026-10-31';
const DAILY = '1111111';

// ---------------------------------------------------------------------------
// New airports (added to the existing curated reference; DXB and the dozen
// already present from the 12-route toy seed are left untouched).
// ---------------------------------------------------------------------------
const NEW_AIRPORTS = [
  { iata: 'JED', icao: 'OEJN', name: 'King Abdulaziz International Airport', lat: 21.6796, lon: 39.1565, tz: 'Asia/Riyadh' },
  { iata: 'RUH', icao: 'OERK', name: 'King Khalid International Airport', lat: 24.9576, lon: 46.6988, tz: 'Asia/Riyadh' },
  { iata: 'DMM', icao: 'OEDF', name: 'King Fahd International Airport', lat: 26.4712, lon: 49.7979, tz: 'Asia/Riyadh' },
  { iata: 'BGW', icao: 'ORBI', name: 'Baghdad International Airport', lat: 33.2625, lon: 44.2346, tz: 'Asia/Baghdad' },
  { iata: 'LYS', icao: 'LFLL', name: 'Lyon-Saint Exupery Airport', lat: 45.7256, lon: 5.0811, tz: 'Europe/Paris' },
  { iata: 'BLQ', icao: 'LIPE', name: 'Bologna Guglielmo Marconi Airport', lat: 44.5354, lon: 11.2887, tz: 'Europe/Rome' },
  { iata: 'OSL', icao: 'ENGM', name: 'Oslo Gardermoen Airport', lat: 60.1939, lon: 11.1004, tz: 'Europe/Oslo' },
  { iata: 'ISB', icao: 'OPIS', name: 'Islamabad International Airport', lat: 33.5492, lon: 72.8256, tz: 'Asia/Karachi' },
  { iata: 'CGK', icao: 'WIII', name: 'Soekarno-Hatta International Airport', lat: -6.1256, lon: 106.6559, tz: 'Asia/Jakarta' },
  { iata: 'ADL', icao: 'YPAD', name: 'Adelaide Airport', lat: -34.9461, lon: 138.5306, tz: 'Australia/Adelaide' },
  { iata: 'SGN', icao: 'VVTS', name: 'Tan Son Nhat International Airport', lat: 10.8188, lon: 106.6520, tz: 'Asia/Ho_Chi_Minh' },
  { iata: 'BNE', icao: 'YBBN', name: 'Brisbane Airport', lat: -27.3842, lon: 153.1175, tz: 'Australia/Brisbane' },
  { iata: 'KIX', icao: 'RJBB', name: 'Kansai International Airport', lat: 34.4347, lon: 135.2441, tz: 'Asia/Tokyo' },
  { iata: 'AMD', icao: 'VAAH', name: 'Sardar Vallabhbhai Patel International Airport', lat: 23.0772, lon: 72.6347, tz: 'Asia/Kolkata' },
  { iata: 'YUL', icao: 'CYUL', name: 'Montreal-Trudeau International Airport', lat: 45.4706, lon: -73.7408, tz: 'America/Toronto' },
  { iata: 'LGW', icao: 'EGKK', name: 'London Gatwick Airport', lat: 51.1481, lon: -0.1903, tz: 'Europe/London' },
  { iata: 'FCO', icao: 'LIRF', name: 'Rome Fiumicino Airport', lat: 41.8003, lon: 12.2389, tz: 'Europe/Rome' },
  { iata: 'TPE', icao: 'RCTP', name: 'Taiwan Taoyuan International Airport', lat: 25.0777, lon: 121.2328, tz: 'Asia/Taipei' },
  { iata: 'HKT', icao: 'VTSP', name: 'Phuket International Airport', lat: 8.1132, lon: 98.3169, tz: 'Asia/Bangkok' },
  { iata: 'KUL', icao: 'WMKK', name: 'Kuala Lumpur International Airport', lat: 2.7456, lon: 101.7099, tz: 'Asia/Kuala_Lumpur' },
  { iata: 'CPH', icao: 'EKCH', name: 'Copenhagen Kastrup Airport', lat: 55.6180, lon: 12.6560, tz: 'Europe/Copenhagen' },
  { iata: 'SFO', icao: 'KSFO', name: 'San Francisco International Airport', lat: 37.6213, lon: -122.3790, tz: 'America/Los_Angeles' },
  { iata: 'IAH', icao: 'KIAH', name: 'George Bush Intercontinental Airport', lat: 29.9902, lon: -95.3368, tz: 'America/Chicago' },
  { iata: 'IAD', icao: 'KIAD', name: 'Washington Dulles International Airport', lat: 38.9531, lon: -77.4565, tz: 'America/New_York' },
  { iata: 'YYZ', icao: 'CYYZ', name: 'Toronto Pearson International Airport', lat: 43.6777, lon: -79.6248, tz: 'America/Toronto' },
  { iata: 'GRU', icao: 'SBGR', name: 'Sao Paulo-Guarulhos International Airport', lat: -23.4356, lon: -46.4731, tz: 'America/Sao_Paulo' },
  { iata: 'AKL', icao: 'NZAA', name: 'Auckland Airport', lat: -37.0082, lon: 174.7850, tz: 'Pacific/Auckland' },
  { iata: 'PER', icao: 'YPPH', name: 'Perth Airport', lat: -31.9403, lon: 115.9669, tz: 'Australia/Perth' },
  { iata: 'MXP', icao: 'LIMC', name: 'Milan Malpensa Airport', lat: 45.6306, lon: 8.7281, tz: 'Europe/Rome' },
  { iata: 'GLA', icao: 'EGPF', name: 'Glasgow Airport', lat: 55.8719, lon: -4.4331, tz: 'Europe/London' },
  { iata: 'PRG', icao: 'LKPR', name: 'Vaclav Havel Airport Prague', lat: 50.1008, lon: 14.2600, tz: 'Europe/Prague' },
  { iata: 'CAI', icao: 'HECA', name: 'Cairo International Airport', lat: 30.1219, lon: 31.4056, tz: 'Africa/Cairo' },
];

// ---------------------------------------------------------------------------
// Route table. blockOut/blockRet in minutes. `daysOfWeek` defaults to daily:
// JUDGMENT CALL (documented in the task report) — every route is modeled as
// one representative daily outbound + daily return schedule line rather than
// multiple same-day frequencies (e.g. BAH's real "3x/day"), since the
// pairing engine only needs one reliable daily connection per route to find
// candidates, and multiplying near-identical lines adds volume without
// adding real signal for this tool.
// ---------------------------------------------------------------------------
const A350_ROUTES = [
  { iata: 'BAH', blockOut: 60, conf: 'ADVERTISED', note: 'user-supplied high-frequency route (multiple daily departures in reality e.g. ~3x/day); modeled here as one representative daily line' },
  { iata: 'KWI', blockOut: 90, conf: 'ADVERTISED' },
  { iata: 'JED', blockOut: 140, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'RUH', blockOut: 140, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'DMM', blockOut: 85, conf: 'ADVERTISED' },
  { iata: 'MCT', blockOut: 75, conf: 'ADVERTISED' },
  { iata: 'AMM', blockOut: 205, conf: 'ADVERTISED', note: 'known multi-type route — A350/777/A380 all reported operating different AMM frequencies through 2026, do not treat as pure A350' },
  { iata: 'BGW', blockOut: 115, conf: 'CONFIRMED', note: 'history: mixed A350/other fleet through 2025, research found this route resolved to all-A350 from 1 Jan 2026 — current confidence reflects the post-2026-01-01 state' },
  { iata: 'EDI', blockOut: 435, conf: 'CONFIRMED', note: 'launch route — exact published times found' },
  { iata: 'LYS', blockOut: 405, conf: 'ADVERTISED' },
  { iata: 'BLQ', blockOut: 350, conf: 'ADVERTISED' },
  { iata: 'IST', blockOut: 270, conf: 'ADVERTISED' },
  { iata: 'OSL', blockOut: 410, conf: 'CONFIRMED', note: 'Emirates press release confirmed 1 Sept 2026 debut' },
  { iata: 'BOM', blockOut: 195, conf: 'ADVERTISED', note: 'high-frequency/multi-type route — also served by A380 and other widebodies on different frequencies; not every BOM flight is A350' },
  { iata: 'DEL', blockOut: 200, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'CMB', blockOut: 245, conf: 'ADVERTISED' },
  { iata: 'ISB', blockOut: 190, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'CGK', blockOut: 510, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'ADL', blockOut: 705, conf: 'CONFIRMED', note: 'daily from Dec 2025' },
  { iata: 'SGN', blockOut: 255, conf: 'CONFIRMED', note: 'launched Aug 2025' },
  { iata: 'BNE', blockOut: 840, conf: 'ADVERTISED', note: 'CONFLICT: user-supplied list places this under A350; independent research this session found BNE listed as a "Medium confidence" A380 route with no A350 corroboration found — needs user verification. Block time is an estimate.' },
  { iata: 'KIX', blockOut: 590, conf: 'ADVERTISED', note: 'CONFLICT: user-supplied list places this under A350; independent research this session found KIX historically operated as A380, with an uncertain current state after a temporary May-2026 swap to 777 — needs user verification. Same airport as the A380 KIX row below; both rows are intentionally kept.' },
  { iata: 'AMD', blockOut: 165, conf: 'ADVERTISED' },
  { iata: 'YUL', blockOut: 730, conf: 'CONFIRMED', note: 'daily from 11 Jan 2026' },
  { iata: 'LGW', blockOut: 440, conf: 'CONFIRMED', note: 'from 8 Feb 2026' },
  { iata: 'FCO', blockOut: 365, conf: 'CONFIRMED', note: 'from 29 Mar 2026' },
  { iata: 'TPE', blockOut: 530, conf: 'CONFIRMED', note: 'from 1 May 2026' },
  { iata: 'HKT', blockOut: 345, conf: 'CONFIRMED', note: '3rd-daily from 1 Jul 2026; modeled here as one representative daily line, not 3 separate frequencies' },
  { iata: 'CPT', blockOut: 590, conf: 'ADVERTISED', note: 'multi-type route — A350/777/A380 all serve CPT on different frequencies' },
  { iata: 'KUL', blockOut: 440, conf: 'ADVERTISED', note: 'multi-type route — same pattern as CPT/AMM' },
  { iata: 'CPH', blockOut: 395, conf: 'ADVERTISED', note: 'VOLATILITY: CPH is actively transitioning from A380 to A350/777 through late 2026 — treat current type as genuinely uncertain, re-verify before relying on this. See the A380 CPH row below, kept simultaneously to model the transition.' },
];

const A380_ROUTES = [
  { iata: 'LHR', blockOut: 435, blockRet: 465, conf: 'ADVERTISED' },
  { iata: 'JFK', blockOut: 830, blockRet: 890, conf: 'ADVERTISED' },
  { iata: 'LAX', blockOut: 970, conf: 'ADVERTISED' },
  { iata: 'SFO', blockOut: 950, conf: 'ADVERTISED' },
  { iata: 'IAH', blockOut: 875, conf: 'ADVERTISED' },
  { iata: 'IAD', blockOut: 815, conf: 'ADVERTISED' },
  { iata: 'YYZ', blockOut: 800, conf: 'ADVERTISED' },
  { iata: 'GRU', blockOut: 920, conf: 'ADVERTISED' },
  { iata: 'SYD', blockOut: 835, blockRet: 875, conf: 'ADVERTISED' },
  { iata: 'AKL', blockOut: 1035, conf: 'ADVERTISED', note: "world's longest A380 route; daily from June 2026" },
  { iata: 'MEL', blockOut: 815, conf: 'ADVERTISED' },
  { iata: 'PER', blockOut: 660, conf: 'ADVERTISED' },
  { iata: 'BOM', blockOut: 195, conf: 'ADVERTISED', note: 'multi-type route — also in the A350 list above; that is expected/correct, real airlines run multiple types on a high-frequency route', numOffset: 1 },
  { iata: 'SIN', blockOut: 435, blockRet: 465, conf: 'ADVERTISED' },
  { iata: 'BKK', blockOut: 395, conf: 'ADVERTISED' },
  { iata: 'HKG', blockOut: 450, conf: 'ADVERTISED' },
  { iata: 'JNB', blockOut: 495, conf: 'ADVERTISED' },
  { iata: 'CAI', blockOut: 200, conf: 'ADVERTISED' },
  { iata: 'CPH', blockOut: 395, conf: 'ADVERTISED', note: 'VOLATILITY: same route as the A350 CPH row above, kept simultaneously — CPH is still transitioning from A380 to A350/777 through late 2026, do not treat as settled', numOffset: 1 },
  { iata: 'MXP', blockOut: 365, conf: 'ADVERTISED', note: 'frequency reportedly halved May 2026 amid regional disruption, current capacity uncertain' },
  { iata: 'GLA', blockOut: 425, conf: 'ADVERTISED', note: 'reported swapped to 777-300ER in May 2026 amid regional disruption, unclear if reverted by research date' },
  { iata: 'KIX', blockOut: 590, conf: 'ADVERTISED', note: 'CONFLICT/VOLATILITY: same airport as the conflicted A350 KIX row above; both rows kept intentionally. Reported swapped to 777-300ER in May 2026 amid regional disruption, unclear if reverted by research date', numOffset: 1 },
  { iata: 'PRG', blockOut: 375, conf: 'ADVERTISED', note: 'reported swapped to 777-300ER in May 2026 amid regional disruption, unclear if reverted by research date' },
];

// ---------------------------------------------------------------------------
// Flight-number + UTC-time-of-day allocation.
// ---------------------------------------------------------------------------
let a350Num = 801; // odd/even pairs, loosely mimicking real EK route-block numbering
let a380Num = 401;
// Deterministic pseudo-spread of STD across the day so not every flight
// departs at the same clock minute — purely cosmetic, has no bearing on
// pairing-engine correctness (see expandScheduleToInstances.ts: daysOfWeek
// is evaluated against UTC calendar day regardless of local time-of-day).
function stdForRoute(iata, seedOffset) {
  let hash = seedOffset;
  for (const ch of iata) hash = (hash * 31 + ch.charCodeAt(0)) % 1439;
  return hash;
}

function buildLeg(number, depIata, arrIata, stdUTCMin, blockMin, advertisedType, confidence, sourceRef) {
  const staRaw = stdUTCMin + blockMin;
  const staUTCMin = staRaw % 1440;
  const arrivalDayOffset = Math.floor(staRaw / 1440);
  const isConfirmed = confidence === 'CONFIRMED';
  return {
    number,
    depIata,
    arrIata,
    stdUTCMin,
    staUTCMin,
    arrivalDayOffset,
    advertisedType,
    ...(isConfirmed ? { observedType: advertisedType } : {}),
    confidence,
    daysOfWeek: DAILY,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: EFFECTIVE_TO,
    sourceRef,
  };
}

const records = [];

for (const route of A350_ROUTES) {
  const blockOut = route.blockOut;
  const blockRet = route.blockRet ?? route.blockOut;
  const num = a350Num;
  a350Num += 2;
  const baseRef = 'user-supplied 2026-09-14 + research corroboration';
  const sourceRef = route.note ? `${baseRef} (${route.note})` : baseRef;

  const stdOut = stdForRoute(route.iata, 350);
  const stdRet = stdForRoute(route.iata, 351);

  records.push(
    buildLeg(`EK${num}`, 'DXB', route.iata, stdOut, blockOut, 'A350', route.conf, sourceRef)
  );
  records.push(
    buildLeg(`EK${num + 1}`, route.iata, 'DXB', stdRet, blockRet, 'A350', route.conf, sourceRef)
  );
}

for (const route of A380_ROUTES) {
  const blockOut = route.blockOut;
  const blockRet = route.blockRet ?? route.blockOut;
  const num = a380Num + (route.numOffset ?? 0) * 0; // numOffset unused for value, kept for clarity of intent
  const flightNum = a380Num;
  a380Num += 2;
  const baseRef = 'research corroboration 2026-09-14';
  const sourceRef = route.note ? `${baseRef} (${route.note})` : baseRef;

  const stdOut = stdForRoute(route.iata, 480);
  const stdRet = stdForRoute(route.iata, 481);

  records.push(
    buildLeg(`EK${flightNum}`, 'DXB', route.iata, stdOut, blockOut, 'A380', route.conf, sourceRef)
  );
  records.push(
    buildLeg(`EK${flightNum + 1}`, route.iata, 'DXB', stdRet, blockRet, 'A380', route.conf, sourceRef)
  );
}

writeFileSync(
  join(ROOT, 'prisma', 'seed-data', 'dxb-seed-schedule.json'),
  JSON.stringify(records, null, 2) + '\n'
);

// ---------------------------------------------------------------------------
// Airports reference: append new airports, keep existing ones untouched,
// de-duplicate by IATA.
// ---------------------------------------------------------------------------
const airportsPath = join(ROOT, 'src', 'ingest', 'data', 'airports-reference.json');
const existingAirports = JSON.parse(readFileSync(airportsPath, 'utf-8'));
const existingIatas = new Set(existingAirports.map((a) => a.iata));
const toAdd = NEW_AIRPORTS.filter((a) => !existingIatas.has(a.iata));
const merged = [...existingAirports, ...toAdd];
writeFileSync(airportsPath, JSON.stringify(merged, null, 2) + '\n');

console.log(`Wrote ${records.length} flight records (${A350_ROUTES.length} A350 routes + ${A380_ROUTES.length} A380 routes, x2 legs each).`);
console.log(`Airports: ${existingAirports.length} existing + ${toAdd.length} new = ${merged.length} total.`);
