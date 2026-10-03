/** Lifestyle estimates only. Never used as input to GCAA compliance checks. */
import type { RosterDayCell } from '@/pairing/db/roster';
import type { GeneratedPairing, PairingLegResult } from '@/pairing/types';
import type { RosterGenDay } from '@/roster-gen/types';
import { DEFAULT_PAIRING_CONSTRAINTS } from '@/pairing/constraints';
import { computeReportTime, computeDutyEndForRest } from '@/pairing/dutyTimes';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
type Interval = { start: number; end: number };

export const DEFAULT_LIFESTYLE_CONFIG = {
  commuteMinutes: 30,
  nightRecoveryHours: 12,
  jetlagThresholdHours: 3,
  jetlagRecoveryHours: 24,
  largeShiftHours: 6,
  largeShiftRecoveryHours: 36,
  familyWindowStartHour: 8,
  familyWindowEndHour: 22,
  standbyAtHome: true,
  vacationAtHome: false,
};
export type LifestyleConfig = typeof DEFAULT_LIFESTYLE_CONFIG;

export interface LifestyleDay {
  date: string;
  officialOff: boolean;
  realWork: boolean;
  homeHours: number | null;
  familyHours: number | null;
  fullFamilyDay: boolean;
  recoveryHours: number;
  nightMinutes: number;
  reports: number;
  status: 'UNKNOWN' | 'AWAY' | 'WORK' | 'STANDBY' | 'RECOVERY' | 'PARTIAL_HOME' | 'CLEAN_HOME';
}
export interface MonthLifestyle {
  days: LifestyleDay[];
  officialOffDays: number;
  realWorkDays: number;
  fullHomeDays: number;
  homeDayEquivalents: number;
  fullFamilyQualityDays: number;
  familyDayEquivalents: number;
  familyBlocksAtLeastThreeDays: number;
  longestFamilyBlock: number;
  nightDutyMinutes: number;
  nightDutyReports: number;
  jetlagTrips: number;
  recoveryAffectedDays: number;
  reports: number;
  dxbFlightReports: number;
  outstationFlightReports: number;
  trainingReports: number;
  unknownDays: number;
  missingTimeZoneTrips: number;
  priorContextKnown: boolean;
  config: LifestyleConfig;
}

/** Dubai has no DST: local midnight is 20:00 UTC on the previous date. */
function dayStart(date: string): number {
  return Date.parse(`${date}T00:00:00+04:00`);
}
function overlap(interval: Interval, start: number, end: number): number {
  return Math.max(0, Math.min(interval.end, end) - Math.max(interval.start, start));
}
/** Union before measuring: overlapping duties/trips/recovery never double count. */
function covered(intervals: Interval[], start: number, end: number): number {
  const clips = intervals.map(i => ({ start: Math.max(i.start, start), end: Math.min(i.end, end) }))
    .filter(i => i.end > i.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let until = start;
  for (const i of clips) {
    total += Math.max(0, i.end - Math.max(i.start, until));
    until = Math.max(until, i.end);
  }
  return total;
}
function offsetHours(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(date);
  const label = parts.find(p => p.type === 'timeZoneName')!.value;
  if (label === 'GMT') return 0;
  const m = label.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Unsupported timezone offset: ${label}`);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60);
}
function nightOverlap(duty: Interval): number {
  const first = Math.floor((duty.start + 4 * 60 * MINUTE) / DAY) * DAY - 4 * 60 * MINUTE;
  let total = 0;
  for (let start = first; start < duty.end; start += DAY) total += overlap(duty, start, start + 6 * 60 * MINUTE);
  return total;
}

/** A turnaround across midnight is one report. An actual layover splits duties. */
function dutiesForPairing(pairing: GeneratedPairing): { interval: Interval; depIata: string }[] {
  const groups: PairingLegResult[][] = [];
  for (const leg of [...pairing.legs].sort((a, b) => +a.instance.depUTC - +b.instance.depUTC)) {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    if (!previous || (+leg.instance.depUTC - +previous.instance.arrUTC) / MINUTE >= DEFAULT_PAIRING_CONSTRAINTS.minLayoverMinutes) {
      groups.push([leg]);
    } else group.push(leg);
  }
  return groups.map(group => ({
    interval: { start: +computeReportTime(group[0].instance.depUTC).reportUTC,
      end: +computeDutyEndForRest(group[group.length - 1].instance.arrUTC) },
    depIata: group[0].instance.depIata,
  }));
}

export function buildMonthLifestyle(input: {
  cells: RosterDayCell[];
  rosterDays: RosterGenDay[];
  /** Includes real previous/next month pairings, never invented empty months. */
  contextDays?: RosterGenDay[];
  airportTimeZones: Record<string, string>;
  priorContextKnown?: boolean;
  config?: Partial<LifestyleConfig>;
}): MonthLifestyle {
  const config = { ...DEFAULT_LIFESTYLE_CONFIG, ...input.config };
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) throw new Error(`Invalid lifestyle config: ${key}`);
  }
  if (config.familyWindowEndHour > 24 || config.familyWindowStartHour >= config.familyWindowEndHour) throw new Error('Invalid family window');
  const result: MonthLifestyle = {
    days: [], officialOffDays: 0, realWorkDays: 0, fullHomeDays: 0, homeDayEquivalents: 0,
    fullFamilyQualityDays: 0, familyDayEquivalents: 0, familyBlocksAtLeastThreeDays: 0,
    longestFamilyBlock: 0, nightDutyMinutes: 0, nightDutyReports: 0, jetlagTrips: 0,
    recoveryAffectedDays: 0, reports: 0, dxbFlightReports: 0, outstationFlightReports: 0,
    trainingReports: 0, unknownDays: 0, missingTimeZoneTrips: 0,
    priorContextKnown: input.priorContextKnown ?? false, config,
  };
  if (!input.cells.length) return result;
  const monthStart = dayStart(input.cells[0].date);
  const monthEnd = dayStart(input.cells[input.cells.length - 1].date) + DAY;
  const pairings = new Map<string | GeneratedPairing, GeneratedPairing>();
  for (const day of [...(input.contextDays ?? []), ...input.rosterDays]) {
    if (day.assignment.type === 'FLIGHT') {
      const p = day.assignment.pairing;
      pairings.set(p.id ?? p, p);
    }
  }
  const duties: { interval: Interval; depIata: string }[] = [];
  const away: Interval[] = [];
  const recovery: Interval[] = [];
  for (const p of pairings.values()) {
    const tripDuties = dutiesForPairing(p);
    if (!tripDuties.length) continue;
    duties.push(...tripDuties);
    const trip = { start: tripDuties[0].interval.start - config.commuteMinutes * MINUTE,
      end: tripDuties[tripDuties.length - 1].interval.end + config.commuteMinutes * MINUTE };
    away.push(trip);
    let maxShift = 0;
    let missingTz = false;
    for (const leg of p.legs) {
      const i = leg.instance;
      if (i.arrIata === 'DXB') continue;
      const tz = input.airportTimeZones[i.arrIata];
      if (!tz) { missingTz = true; continue; }
      maxShift = Math.max(maxShift, Math.abs(offsetHours(i.arrUTC, tz) - 4));
    }
    // Recovery is a planning sensitivity, not a medical or regulatory rule.
    // Apply night recovery after EACH night duty, including early trips in a month.
    for (const duty of tripDuties) {
      if (nightOverlap(duty.interval) > 0) recovery.push({ start: duty.interval.end,
        end: duty.interval.end + config.nightRecoveryHours * 60 * MINUTE });
    }
    const jetlag = maxShift >= config.jetlagThresholdHours;
    const hours = missingTz || maxShift >= config.largeShiftHours ? config.largeShiftRecoveryHours
      : jetlag ? config.jetlagRecoveryHours : 0;
    if (hours > 0) recovery.push({ start: trip.end, end: trip.end + hours * 60 * MINUTE });
    if (trip.end > monthStart && trip.start < monthEnd && missingTz) result.missingTimeZoneTrips += 1;
    // Count trips by their return-home date, so next-month trips do not leak in.
    if (trip.end >= monthStart && trip.end < monthEnd && jetlag) result.jetlagTrips += 1;
  }
  // Missing history prevents claiming clean family time immediately after a boundary.
  const uncertainRecovery: Interval[] = result.priorContextKnown ? [] : [{ start: monthStart,
    end: monthStart + Math.max(config.nightRecoveryHours, config.jetlagRecoveryHours,
      config.largeShiftRecoveryHours) * 60 * MINUTE }];
  const familyWindowHours = config.familyWindowEndHour - config.familyWindowStartHour;
  let streak = 0;
  for (const cell of input.cells) {
    const start = dayStart(cell.date);
    const end = start + DAY;
    const type = cell.entry?.dutyType;
    const training = type === 'SIM' || type === 'GROUND_SCHOOL';
    const flight = duties.filter(d => overlap(d.interval, start, end) > 0);
    const reports = duties.filter(d => d.interval.start >= start && d.interval.start < end);
    const realWork = training || flight.length > 0;
    const absent = covered(away, start, end);
    const known = !!type && (type !== 'VACATION' || config.vacationAtHome)
      && (type !== 'STANDBY' || config.standbyAtHome)
      && (type !== 'FLIGHT' || input.rosterDays.some(d => d.date === cell.date && d.assignment.type === 'FLIGHT'));
    // An incoming prior-month trip itself supplies location coverage on an empty cell.
    const locationKnown = known || absent === DAY;
    const homeHours = locationKnown ? (DAY - absent) / (60 * MINUTE) : null;
    const restricted: Interval[] = [...away, ...recovery, ...uncertainRecovery];
    if (training || type === 'STANDBY') restricted.push({ start, end });
    const familyStart = start + config.familyWindowStartHour * 60 * MINUTE;
    const familyEnd = start + config.familyWindowEndHour * 60 * MINUTE;
    const familyHours = locationKnown ? (familyEnd - familyStart - covered(restricted, familyStart, familyEnd)) / (60 * MINUTE) : null;
    const recoveryHours = covered(recovery, start, end) / (60 * MINUTE);
    const fullFamilyDay = familyHours === familyWindowHours && !realWork && type !== 'STANDBY';
    const nightMinutes = covered(flight.map(d => d.interval), start, start + 6 * 60 * MINUTE) / MINUTE;
    const officialOff = type === 'OFF';
    const status: LifestyleDay['status'] = !locationKnown ? 'UNKNOWN' : absent === DAY ? 'AWAY'
      : type === 'STANDBY' ? 'STANDBY' : realWork ? 'WORK'
      : recoveryHours > 0 || covered(uncertainRecovery, start, end) > 0 ? 'RECOVERY'
      : homeHours! < 24 ? 'PARTIAL_HOME' : 'CLEAN_HOME';
    result.days.push({ date: cell.date, officialOff, realWork, homeHours, familyHours,
      fullFamilyDay, recoveryHours, nightMinutes, reports: reports.length + Number(training), status });
    result.officialOffDays += Number(officialOff);
    result.realWorkDays += Number(realWork);
    result.fullHomeDays += Number(homeHours === 24 && !training);
    // Untimed training is not counted as a full home day; hours at home cannot be inferred.
    if (training) result.days[result.days.length - 1].homeHours = null;
    else result.homeDayEquivalents += (homeHours ?? 0) / 24;
    result.fullFamilyQualityDays += Number(fullFamilyDay);
    result.familyDayEquivalents += (familyHours ?? 0) / familyWindowHours;
    result.recoveryAffectedDays += Number(recoveryHours > 0);
    result.nightDutyMinutes += nightMinutes;
    result.reports += reports.length + Number(training);
    result.trainingReports += Number(training);
    result.dxbFlightReports += reports.filter(d => d.depIata === 'DXB').length;
    result.outstationFlightReports += reports.filter(d => d.depIata !== 'DXB').length;
    result.unknownDays += Number(!locationKnown || training);
    if (fullFamilyDay) streak += 1;
    else { if (streak >= 3) result.familyBlocksAtLeastThreeDays += 1; streak = 0; }
    result.longestFamilyBlock = Math.max(result.longestFamilyBlock, streak);
  }
  if (streak >= 3) result.familyBlocksAtLeastThreeDays += 1;
  result.nightDutyReports = duties.filter(d => overlap(d.interval, monthStart, monthEnd) > 0
    && nightOverlap({ start: Math.max(d.interval.start, monthStart), end: Math.min(d.interval.end, monthEnd) }) > 0).length;
  return result;
}
