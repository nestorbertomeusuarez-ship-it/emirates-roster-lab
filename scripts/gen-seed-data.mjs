// One-off generator for the expanded DXB seed schedule (Part A of the
// roster-lab extension task, plus the 2026-09-15 A380 correction/expansion
// pass). NOT part of the app; run once via `node scripts/gen-seed-data.mjs`
// to (re)write:
//   - prisma/seed-data/dxb-seed-schedule.json
//   - src/ingest/data/airports-reference.json (new airports appended)
//
// Rationale for generating rather than hand-typing the flight records:
// stdUTCMin/staUTCMin/arrivalDayOffset must be internally consistent with
// each route's real-world block time (blockTimeMin is derived from them by
// computeBlockTimeMin, not stored directly), and hand-computing that for
// dozens of routes x 2 directions is exactly the kind of arithmetic that
// silently drifts. This script is the single place block-time -> UTC-
// minute-of-day arithmetic happens; the *route data itself* (block times,
// confidence, notes) is the human/research-sourced content described in the
// task. See docs/data-sources.md for the 2026-09-15 A380 reconciliation
// notes (BNE/KIX/GLA/MXP resolutions).

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const EFFECTIVE_FROM = '2026-10-01';
const EFFECTIVE_TO = '2026-10-31';
const DAILY = '1111111';

// ---------------------------------------------------------------------------
// Real local departure time -> UTC-minute-of-day conversion (docs/data-
// sources.md's 2026-09-19 real-STD pass). A route's `stdOutLocal`/
// `stdRetLocal` ('HH:MM', local clock time at the departing station) is
// converted to `stdUTCMin` using each station's real IANA timezone offset,
// resolved at ONE representative instant (`REPRESENTATIVE_DATE_FOR_DST`,
// local noon) — not per-day across the whole October effective period.
// JUDGMENT CALL: October 2026 includes real DST transitions at several
// European stations (BST ends the last Sunday of October); this generator
// still emits ONE fixed `stdUTCMin` for the whole month (the existing
// schema has no per-day-varying UTC offset concept), so the local
// departure clock time is only EXACTLY correct on one side of any
// mid-month DST transition and off by up to 1h on the other side — same
// class of simplification as this file's pre-existing "one representative
// daily line, not every real frequency" convention. Asia/Dubai itself
// never observes DST, so DXB-side times are never affected by this.
// ---------------------------------------------------------------------------
const REPRESENTATIVE_DATE_FOR_DST = '2026-10-15';

function utcOffsetMinutesAt(ianaTimeZone, dateISO) {
  const referenceUTC = new Date(`${dateISO}T12:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimeZone,
    timeZoneName: 'shortOffset',
  });
  const offsetPart = formatter
    .formatToParts(referenceUTC)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = offsetPart?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

/** 'HH:MM' local time at `ianaTimeZone` -> UTC minute-of-day (0-1439). */
function localHHMMToUTCMinutes(hhmm, ianaTimeZone) {
  const [hh, mm] = hhmm.split(':').map(Number);
  const localMinutes = hh * 60 + mm;
  const offsetMinutes = utcOffsetMinutesAt(ianaTimeZone, REPRESENTATIVE_DATE_FOR_DST);
  return ((localMinutes - offsetMinutes) % 1440 + 1440) % 1440;
}

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

  // --- Added for the 2026-09-15 user-supplied authoritative A380 destination
  // list (30-region correction/expansion pass). FRA, MAN and CDG are already
  // present above from an earlier pass and are deliberately NOT re-added
  // here (the merge below dedupes by IATA anyway, so this is belt-and-braces
  // documentation, not a functional requirement).
  { iata: 'AMS', icao: 'EHAM', name: 'Amsterdam Airport Schiphol', lat: 52.3086, lon: 4.7639, tz: 'Europe/Amsterdam' },
  { iata: 'BCN', icao: 'LEBL', name: 'Barcelona-El Prat Airport', lat: 41.2971, lon: 2.0785, tz: 'Europe/Madrid' },
  { iata: 'BHX', icao: 'EGBB', name: 'Birmingham Airport', lat: 52.4539, lon: -1.7480, tz: 'Europe/London' },
  { iata: 'DUS', icao: 'EDDL', name: 'Dusseldorf Airport', lat: 51.2895, lon: 6.7668, tz: 'Europe/Berlin' },
  { iata: 'MAD', icao: 'LEMD', name: 'Adolfo Suarez Madrid-Barajas Airport', lat: 40.4936, lon: -3.5668, tz: 'Europe/Madrid' },
  { iata: 'SVO', icao: 'UUEE', name: 'Sheremetyevo International Airport', lat: 55.9736, lon: 37.4125, tz: 'Europe/Moscow' },
  { iata: 'NCE', icao: 'LFMN', name: 'Nice Cote d\'Azur Airport', lat: 43.6584, lon: 7.2159, tz: 'Europe/Paris' },
  { iata: 'VIE', icao: 'LOWW', name: 'Vienna International Airport', lat: 48.1103, lon: 16.5697, tz: 'Europe/Vienna' },
  { iata: 'ZRH', icao: 'LSZH', name: 'Zurich Airport', lat: 47.4647, lon: 8.5492, tz: 'Europe/Zurich' },
  { iata: 'DPS', icao: 'WADD', name: 'Ngurah Rai (Bali) International Airport', lat: -8.7482, lon: 115.1672, tz: 'Asia/Makassar' },
  { iata: 'BLR', icao: 'VOBL', name: 'Kempegowda International Airport Bengaluru', lat: 13.1986, lon: 77.7066, tz: 'Asia/Kolkata' },
  { iata: 'CHC', icao: 'NZCH', name: 'Christchurch International Airport', lat: -43.4894, lon: 172.5320, tz: 'Pacific/Auckland' },
  { iata: 'ICN', icao: 'RKSI', name: 'Incheon International Airport', lat: 37.4602, lon: 126.4407, tz: 'Asia/Seoul' },
  { iata: 'PVG', icao: 'ZSPD', name: 'Shanghai Pudong International Airport', lat: 31.1443, lon: 121.8083, tz: 'Asia/Shanghai' },
  { iata: 'NRT', icao: 'RJAA', name: 'Narita International Airport', lat: 35.7720, lon: 140.3929, tz: 'Asia/Tokyo' },
  { iata: 'CMN', icao: 'GMMN', name: 'Mohammed V International Airport', lat: 33.3675, lon: -7.5900, tz: 'Africa/Casablanca' },
  { iata: 'MRU', icao: 'FIMP', name: 'Sir Seewoosagur Ramgoolam International Airport', lat: -20.4302, lon: 57.6836, tz: 'Indian/Mauritius' },

  // --- New A350 destinations this quarter, user-supplied 2026-09-19 (see
  // CONFIRM_2026_09_19 in the route table below).
  { iata: 'HEL', icao: 'EFHK', name: 'Helsinki-Vantaa Airport', lat: 60.3172, lon: 24.9633, tz: 'Europe/Helsinki' },
  { iata: 'LCA', icao: 'LCLK', name: 'Larnaca International Airport', lat: 34.8751, lon: 33.6249, tz: 'Asia/Nicosia' },
  { iata: 'MLA', icao: 'LMML', name: 'Malta International Airport', lat: 35.8575, lon: 14.4775, tz: 'Europe/Malta' },
  { iata: 'NBO', icao: 'HKJK', name: 'Jomo Kenyatta International Airport', lat: -1.3192, lon: 36.9278, tz: 'Africa/Nairobi' },
  { iata: 'HAM', icao: 'EDDH', name: 'Hamburg Airport', lat: 53.6304, lon: 9.9882, tz: 'Europe/Berlin' },
];

// CONFIRM_2026_09_19: shorthand appended to the sourceRef of every A350
// route added/reconfirmed per the user's 2026-09-19 message ("New A350
// route assignments this quarter include Kuala Lumpur, Helsinki, Larnaca,
// Malta, Nairobi, Hamburg, and Mauritius"). Block times for the genuinely
// new destinations (HEL/LCA/MLA/NBO/HAM) are ENGINEERING ESTIMATES derived
// from great-circle distance, not sourced published schedule times — same
// footing as this file's many pre-existing "reasonable estimate, not a
// sourced fact" entries (see e.g. the RUH/DEL/ISB/CGK rows below). MRU
// reuses the exact block time already CONFIRMED for its existing A380 row
// below (325 min) — a real multi-type route, same pattern as KUL/BOM/TPE.
const CONFIRM_2026_09_19 = 'user-supplied 2026-09-19 (new A350 quarterly route assignments)';

// REAL_STD_NOTE: appended to the sourceRef of every route given a real
// researched `stdOutLocal`/`stdRetLocal` pair (docs/data-sources.md's
// 2026-09-19 real-STD pass, direct user request: "las horas STD deben ser
// reales, investigalas y aplicalas a todos los pairings"). Scoped
// DELIBERATELY to only the ~1/3 of routes where research found HIGH or
// MEDIUM-HIGH confidence data for BOTH directions — the user explicitly
// chose this over applying lower-confidence/partial findings, after a
// 6-way parallel research pass showed most routes have only one direction
// (or no reliable direction) confirmable from public third-party
// aggregators (emirates.com itself is excluded — see docs/data-sources.md).
// Every route WITHOUT `stdOutLocal`/`stdRetLocal` keeps the synthetic
// `stdForRoute()` hash time — unchanged, not silently left looking more
// authoritative than it is.
const REAL_STD_NOTE =
  'STD/STA times from real third-party schedule-aggregator research (2026-09-19), high/medium-high confidence both directions — not from emirates.com (excluded per project rule); local departure clock time resolved against each station\'s real IANA timezone at a representative mid-month date, see REPRESENTATIVE_DATE_FOR_DST below for the DST caveat.';

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
  { iata: 'KWI', blockOut: 90, conf: 'ADVERTISED', stdOutLocal: '01:25', stdRetLocal: '03:40', note: REAL_STD_NOTE },
  { iata: 'JED', blockOut: 140, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact; now a confirmed multi-type route — see the new CONFIRMED A380 JED row below, added per the user-supplied 2026-09-15 authoritative A380 destination list' },
  { iata: 'RUH', blockOut: 140, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'DMM', blockOut: 85, conf: 'ADVERTISED' },
  { iata: 'MCT', blockOut: 75, conf: 'ADVERTISED' },
  { iata: 'AMM', blockOut: 205, conf: 'ADVERTISED', note: 'known multi-type route — A350/777/A380 all reported operating different AMM frequencies through 2026, do not treat as pure A350; corroborated by the user-supplied 2026-09-15 authoritative A380 destination list, which lists Amman as an active A380 destination — see the new CONFIRMED A380 AMM row below' },
  { iata: 'BGW', blockOut: 115, conf: 'CONFIRMED', note: 'history: mixed A350/other fleet through 2025, research found this route resolved to all-A350 from 1 Jan 2026 — current confidence reflects the post-2026-01-01 state' },
  { iata: 'EDI', blockOut: 435, conf: 'CONFIRMED', stdOutLocal: '14:50', stdRetLocal: '20:55', note: `launch route — exact published times found; ${REAL_STD_NOTE}` },
  { iata: 'LYS', blockOut: 405, conf: 'ADVERTISED' },
  { iata: 'BLQ', blockOut: 350, conf: 'ADVERTISED' },
  { iata: 'IST', blockOut: 270, conf: 'ADVERTISED' },
  { iata: 'OSL', blockOut: 410, conf: 'CONFIRMED', stdOutLocal: '07:30', stdRetLocal: '14:35', note: `Emirates press release confirmed 1 Sept 2026 debut; ${REAL_STD_NOTE}` },
  { iata: 'BOM', blockOut: 195, conf: 'ADVERTISED', note: 'high-frequency/multi-type route — also served by A380 and other widebodies on different frequencies; not every BOM flight is A350' },
  { iata: 'DEL', blockOut: 200, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'CMB', blockOut: 245, conf: 'ADVERTISED', stdOutLocal: '16:10', stdRetLocal: '02:55', note: REAL_STD_NOTE },
  { iata: 'ISB', blockOut: 190, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'CGK', blockOut: 510, conf: 'ADVERTISED', note: 'block time is a reasonable estimate, not a sourced fact' },
  { iata: 'ADL', blockOut: 705, conf: 'CONFIRMED', stdOutLocal: '02:00', stdRetLocal: '22:35', note: `daily from Dec 2025; ${REAL_STD_NOTE}` },
  { iata: 'SGN', blockOut: 255, conf: 'CONFIRMED', note: 'launched Aug 2025' },
  { iata: 'BNE', blockOut: 840, conf: 'UNKNOWN', note: 'CONFLICT — LIKELY RESOLVED IN FAVOR OF A380, 2026-09-15: original independent research found BNE listed as a "Medium confidence" A380 route with no A350 corroboration; the user\'s later 2026-09-15 authoritative A380 destination list explicitly confirms Brisbane as an A380 destination and does NOT include it as A350. Confidence lowered from ADVERTISED to UNKNOWN pending correction — this row is kept for history, not as the currently best-supported claim. See the new CONFIRMED A380 BNE row below, which supersedes this one. Block time is an estimate.' },
  { iata: 'KIX', blockOut: 590, conf: 'ADVERTISED', note: 'CONFLICT: user-supplied list places this under A350; independent research this session found KIX historically operated as A380, with an uncertain current state after a temporary May-2026 swap to 777 — needs user verification. Same airport as the A380 KIX row below; both rows are intentionally kept.' },
  { iata: 'AMD', blockOut: 165, conf: 'ADVERTISED', stdOutLocal: '22:50', stdRetLocal: '09:50', note: REAL_STD_NOTE },
  { iata: 'YUL', blockOut: 730, conf: 'CONFIRMED', note: 'daily from 11 Jan 2026' },
  { iata: 'LGW', blockOut: 440, conf: 'CONFIRMED', note: 'from 8 Feb 2026; now a confirmed multi-type route — see the new CONFIRMED A380 LGW row below, added per the user-supplied 2026-09-15 authoritative A380 destination list' },
  { iata: 'FCO', blockOut: 365, conf: 'CONFIRMED', note: 'from 29 Mar 2026; now a confirmed multi-type route — see the new CONFIRMED A380 FCO row below, added per the user-supplied 2026-09-15 authoritative A380 destination list' },
  { iata: 'TPE', blockOut: 530, conf: 'CONFIRMED', stdOutLocal: '03:45', stdRetLocal: '23:50', note: `from 1 May 2026; now a confirmed multi-type route — see the CONFIRMED A380 TPE row below, added per the user-supplied 2026-09-15 authoritative A380 destination list. ${REAL_STD_NOTE} (A380 TPE row's own STD stays synthetic — real-time research for that specific frequency was lower confidence)` },
  { iata: 'HKT', blockOut: 345, conf: 'CONFIRMED', note: '3rd-daily from 1 Jul 2026; modeled here as one representative daily line, not 3 separate frequencies' },
  { iata: 'CPT', blockOut: 590, conf: 'ADVERTISED', note: 'multi-type route — A350/777/A380 all serve CPT on different frequencies' },
  { iata: 'KUL', blockOut: 440, conf: 'CONFIRMED', note: `multi-type route — same pattern as CPT/AMM; corroborated by the user-supplied 2026-09-15 authoritative A380 destination list (see the CONFIRMED A380 KUL row below) and reconfirmed by the ${CONFIRM_2026_09_19}`, sourceBase: CONFIRM_2026_09_19 },
  { iata: 'CPH', blockOut: 395, conf: 'ADVERTISED', note: 'VOLATILITY: CPH is actively transitioning from A380 to A350/777 through late 2026 — treat current type as genuinely uncertain, re-verify before relying on this. See the A380 CPH row below, kept simultaneously to model the transition.' },

  // --- New A350 destinations this quarter, user-supplied 2026-09-19 (see
  // CONFIRM_2026_09_19 above). Block times are engineering estimates from
  // great-circle distance, not sourced published schedule times.
  { iata: 'HEL', blockOut: 400, conf: 'ADVERTISED', stdOutLocal: '08:45', stdRetLocal: '16:45', note: `new route this quarter, ${CONFIRM_2026_09_19}; block time is an engineering estimate (~5,600km great-circle), not a sourced fact. ${REAL_STD_NOTE}`, sourceBase: CONFIRM_2026_09_19 },
  { iata: 'LCA', blockOut: 210, conf: 'ADVERTISED', note: `new route this quarter, ${CONFIRM_2026_09_19}; block time is an engineering estimate (~2,700km great-circle), not a sourced fact`, sourceBase: CONFIRM_2026_09_19 },
  { iata: 'MLA', blockOut: 310, conf: 'ADVERTISED', note: `new route this quarter, ${CONFIRM_2026_09_19}; block time is an engineering estimate (~4,300km great-circle), not a sourced fact`, sourceBase: CONFIRM_2026_09_19 },
  { iata: 'NBO', blockOut: 285, conf: 'ADVERTISED', note: `new route this quarter, ${CONFIRM_2026_09_19}; block time is an engineering estimate (~3,300km great-circle), not a sourced fact`, sourceBase: CONFIRM_2026_09_19 },
  { iata: 'HAM', blockOut: 380, conf: 'ADVERTISED', note: `new route this quarter, ${CONFIRM_2026_09_19}; block time is an engineering estimate (~5,100km great-circle), not a sourced fact`, sourceBase: CONFIRM_2026_09_19 },
  { iata: 'MRU', blockOut: 325, conf: 'CONFIRMED', note: `new A350 route this quarter, ${CONFIRM_2026_09_19} — multi-type route, block time reuses the value already CONFIRMED for the existing A380 MRU row below (same pattern as KUL/BOM/TPE)`, sourceBase: CONFIRM_2026_09_19 },
];

// CONFIRM_2026_09_15: shorthand appended below to the sourceRef of every
// A380 route that the user's 2026-09-15 authoritative A380 destination list
// reaffirms or newly establishes.
const CONFIRM_2026_09_15 = 'user-supplied 2026-09-15 (authoritative A380 destination list)';

const A380_ROUTES = [
  // --- Reconfirmed by the 2026-09-15 list: upgraded ADVERTISED -> CONFIRMED ---
  { iata: 'LHR', blockOut: 435, blockRet: 465, conf: 'CONFIRMED', stdOutLocal: '07:45', stdRetLocal: '13:40', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'JFK', blockOut: 830, blockRet: 890, conf: 'CONFIRMED', stdOutLocal: '08:30', stdRetLocal: '23:00', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'LAX', blockOut: 970, conf: 'CONFIRMED', stdOutLocal: '08:00', stdRetLocal: '16:40', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'SFO', blockOut: 950, conf: 'CONFIRMED', stdOutLocal: '08:25', stdRetLocal: '17:00', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'IAH', blockOut: 875, conf: 'CONFIRMED', stdOutLocal: '09:30', stdRetLocal: '19:35', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'IAD', blockOut: 815, conf: 'CONFIRMED', stdOutLocal: '01:40', stdRetLocal: '10:55', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'YYZ', blockOut: 800, conf: 'CONFIRMED', stdOutLocal: '03:30', stdRetLocal: '14:55', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'GRU', blockOut: 920, conf: 'CONFIRMED', note: `reconfirmed by ${CONFIRM_2026_09_15}` },
  { iata: 'SYD', blockOut: 835, blockRet: 875, conf: 'CONFIRMED', stdOutLocal: '02:00', stdRetLocal: '20:45', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'AKL', blockOut: 1035, conf: 'CONFIRMED', note: `world's longest A380 route; daily from June 2026; reconfirmed by ${CONFIRM_2026_09_15}` },
  { iata: 'MEL', blockOut: 815, conf: 'CONFIRMED', stdOutLocal: '03:00', stdRetLocal: '21:15', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'PER', blockOut: 660, conf: 'CONFIRMED', stdOutLocal: '02:45', stdRetLocal: '22:20', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'BOM', blockOut: 195, conf: 'CONFIRMED', note: `multi-type route — also in the A350 list above; that is expected/correct, real airlines run multiple types on a high-frequency route; reconfirmed by ${CONFIRM_2026_09_15}`, numOffset: 1 },
  { iata: 'SIN', blockOut: 435, blockRet: 465, conf: 'CONFIRMED', note: `reconfirmed by ${CONFIRM_2026_09_15}` },
  { iata: 'BKK', blockOut: 395, conf: 'CONFIRMED', note: `reconfirmed by ${CONFIRM_2026_09_15}` },
  { iata: 'HKG', blockOut: 450, conf: 'CONFIRMED', note: `reconfirmed by ${CONFIRM_2026_09_15}` },
  { iata: 'JNB', blockOut: 495, conf: 'CONFIRMED', stdOutLocal: '04:05', stdRetLocal: '13:40', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}` },
  { iata: 'CAI', blockOut: 200, conf: 'CONFIRMED', stdOutLocal: '20:55', stdRetLocal: '00:50', note: `reconfirmed by ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE} Source flagged these flight numbers as possibly SkyCargo-tagged in some trackers; times are still consistent with the passenger schedule.` },

  // --- Not in the 2026-09-15 list: left untouched, still volatile/unconfirmed ---
  { iata: 'CPH', blockOut: 395, conf: 'ADVERTISED', stdOutLocal: '08:20', stdRetLocal: '15:15', note: `VOLATILITY: same route as the A350 CPH row above, kept simultaneously — CPH is still transitioning from A380 to A350/777 through late 2026, do not treat as settled. Not present on the 2026-09-15 A380 destination list, so left unconfirmed. ${REAL_STD_NOTE} (this real time does not resolve the aircraft-type volatility above — conf intentionally left ADVERTISED)`, numOffset: 1 },
  { iata: 'PRG', blockOut: 375, conf: 'ADVERTISED', note: 'reported swapped to 777-300ER in May 2026 amid regional disruption, unclear if reverted by research date. Not present on the 2026-09-15 A380 destination list, so left unconfirmed.' },

  // --- Special reconciliations: resolved/upgraded per the task's explicit judgment calls ---
  { iata: 'MXP', blockOut: 365, conf: 'CONFIRMED', note: `frequency reportedly halved May 2026 amid regional disruption; the ${CONFIRM_2026_09_15} reconfirms Milan (Malpensa) as an active A380 destination, superseding the May-2026 capacity-uncertainty note with more current information` },
  { iata: 'GLA', blockOut: 425, conf: 'CONFIRMED', stdOutLocal: '07:50', stdRetLocal: '14:20', note: `reported swapped to 777-300ER in May 2026 amid regional disruption; the ${CONFIRM_2026_09_15} reconfirms Glasgow as an active A380 destination, resolving the May-2026 uncertainty in favor of reverted-to/still-A380. ${REAL_STD_NOTE}` },
  { iata: 'KIX', blockOut: 590, conf: 'CONFIRMED', note: `VOLATILITY RESOLVED: same airport as the A350 KIX row above (that row's A350/A380 CONFLICT note is left intact, not touched — do not delete history). Reported swapped to 777-300ER in May 2026 amid regional disruption; the ${CONFIRM_2026_09_15} reconfirms KIX as A380, which outweighs the May-2026 research snapshot`, numOffset: 1 },

  // --- New multi-type rows: airport already has an A350 route above, now
  // also confirmed as A380 by the 2026-09-15 list (same pattern as the
  // pre-existing BOM/CPH dual rows) ---
  { iata: 'TPE', blockOut: 530, conf: 'CONFIRMED', note: `multi-type route — also served by A350 (see A350 TPE row, launched 1 May 2026); a route can carry both an A350 and an A380 frequency, same pattern as BOM. Added per the ${CONFIRM_2026_09_15}`, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'AMM', blockOut: 205, conf: 'CONFIRMED', note: `multi-type route — A350/777/A380 all reported operating different AMM frequencies through 2026 (see A350 AMM row above). Added per the ${CONFIRM_2026_09_15}`, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'JED', blockOut: 140, conf: 'CONFIRMED', note: `multi-type route — also served by A350 (see A350 JED row above), same multi-type pattern as BOM/TPE. Added per the ${CONFIRM_2026_09_15}`, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'LGW', blockOut: 440, conf: 'CONFIRMED', note: `multi-type route — also served by A350 (see A350 LGW row above, CONFIRMED from 8 Feb 2026). Added per the ${CONFIRM_2026_09_15}`, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'FCO', blockOut: 365, conf: 'CONFIRMED', note: `multi-type route — also served by A350 (see A350 FCO row above, CONFIRMED from 29 Mar 2026). Added per the ${CONFIRM_2026_09_15}`, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'KUL', blockOut: 440, conf: 'CONFIRMED', stdOutLocal: '03:40', stdRetLocal: '02:00', note: `multi-type route — also served by A350 (see A350 KUL row above, "same pattern as CPT/AMM"). Added per the ${CONFIRM_2026_09_15}. ${REAL_STD_NOTE}`, sourceBase: CONFIRM_2026_09_15 },

  // --- BNE conflict resolution: 2026-09-15 list confirms A380, not A350 ---
  { iata: 'BNE', blockOut: 840, conf: 'CONFIRMED', note: `resolves the earlier A350/A380 conflict on this route (see the now-downgraded A350 BNE row above) in favor of A380, per the ${CONFIRM_2026_09_15}`, sourceBase: CONFIRM_2026_09_15 },

  // --- Brand-new A380 routes/airports from the 2026-09-15 list, no prior
  // seed entry of any type existed for these ---
  { iata: 'AMS', blockOut: 405, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'BCN', blockOut: 395, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'BHX', blockOut: 430, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'DUS', blockOut: 380, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'FRA', blockOut: 380, conf: 'CONFIRMED', stdOutLocal: '15:20', stdRetLocal: '15:15', note: REAL_STD_NOTE, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'MAD', blockOut: 410, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'MAN', blockOut: 435, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'SVO', blockOut: 305, conf: 'CONFIRMED', note: 'Sheremetyevo — Emirates\' typical Moscow gateway', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'NCE', blockOut: 395, conf: 'CONFIRMED', stdOutLocal: '08:40', stdRetLocal: '15:40', note: REAL_STD_NOTE, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'CDG', blockOut: 410, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'VIE', blockOut: 345, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'ZRH', blockOut: 370, conf: 'CONFIRMED', stdOutLocal: '15:00', stdRetLocal: '22:00', note: REAL_STD_NOTE, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'DPS', blockOut: 500, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'BLR', blockOut: 210, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'CHC', blockOut: 930, conf: 'CONFIRMED', note: 'modeled as one representative direct daily line per this generator\'s existing convention (see the file-header judgment-call note); in reality Emirates routes CHC via SYD/AKL rather than nonstop from DXB', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'ICN', blockOut: 570, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'PVG', blockOut: 520, conf: 'CONFIRMED', stdOutLocal: '02:50', stdRetLocal: '00:05', note: REAL_STD_NOTE, sourceBase: CONFIRM_2026_09_15 },
  { iata: 'NRT', blockOut: 575, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'CMN', blockOut: 475, conf: 'CONFIRMED', sourceBase: CONFIRM_2026_09_15 },
  { iata: 'MRU', blockOut: 325, conf: 'CONFIRMED', stdOutLocal: '03:28', stdRetLocal: '21:50', note: REAL_STD_NOTE, sourceBase: CONFIRM_2026_09_15 },
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

// ---------------------------------------------------------------------------
// Airports reference loaded EARLY (moved up from the bottom of this script,
// 2026-09-19 real-STD pass) — the real-STD conversion below needs every
// destination's IANA timezone before generating routes, not after.
// ---------------------------------------------------------------------------
const airportsPath = join(ROOT, 'src', 'ingest', 'data', 'airports-reference.json');
const existingAirports = JSON.parse(readFileSync(airportsPath, 'utf-8'));
const existingIatas = new Set(existingAirports.map((a) => a.iata));
const toAdd = NEW_AIRPORTS.filter((a) => !existingIatas.has(a.iata));
const merged = [...existingAirports, ...toAdd];

const TZ_BY_IATA = new Map(merged.map((a) => [a.iata, a.tz]));
TZ_BY_IATA.set('DXB', 'Asia/Dubai');

function tzOf(iata) {
  const tz = TZ_BY_IATA.get(iata);
  if (!tz) {
    throw new Error(`tzOf: no timezone known for IATA "${iata}" — add it to NEW_AIRPORTS or the existing reference file first.`);
  }
  return tz;
}

const records = [];

for (const route of A350_ROUTES) {
  const blockOut = route.blockOut;
  const blockRet = route.blockRet ?? route.blockOut;
  const num = a350Num;
  a350Num += 2;
  const baseRef = route.sourceBase ?? 'user-supplied 2026-09-14 + research corroboration';
  const sourceRef = route.note ? `${baseRef} (${route.note})` : baseRef;

  const stdOut = route.stdOutLocal
    ? localHHMMToUTCMinutes(route.stdOutLocal, tzOf('DXB'))
    : stdForRoute(route.iata, 350);
  const stdRet = route.stdRetLocal
    ? localHHMMToUTCMinutes(route.stdRetLocal, tzOf(route.iata))
    : stdForRoute(route.iata, 351);

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
  const baseRef = route.sourceBase ?? 'research corroboration 2026-09-14';
  const sourceRef = route.note ? `${baseRef} (${route.note})` : baseRef;

  const stdOut = route.stdOutLocal
    ? localHHMMToUTCMinutes(route.stdOutLocal, tzOf('DXB'))
    : stdForRoute(route.iata, 480);
  const stdRet = route.stdRetLocal
    ? localHHMMToUTCMinutes(route.stdRetLocal, tzOf(route.iata))
    : stdForRoute(route.iata, 481);

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
writeFileSync(airportsPath, JSON.stringify(merged, null, 2) + '\n');

console.log(`Wrote ${records.length} flight records (${A350_ROUTES.length} A350 routes + ${A380_ROUTES.length} A380 routes, x2 legs each).`);
console.log(`Airports: ${existingAirports.length} existing + ${toAdd.length} new = ${merged.length} total.`);
