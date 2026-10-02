import type { MonthLifestyle } from '@/lifestyle/monthLifestyle';

const labels = {
  UNKNOWN: 'Location unknown', AWAY: 'Away / layover', WORK: 'Actual work',
  STANDBY: 'Standby at home', RECOVERY: 'Recovery / history uncertain',
  PARTIAL_HOME: 'Partial home day', CLEAN_HOME: 'Clean home day',
};
const decimal = (n: number) => n.toFixed(1);

export default function LifestylePanel({ summary: s }: { summary: MonthLifestyle }) {
  const metrics = [
    ['OFF oficiales', s.officialOffDays, 'Assigned OFF codes only; leave, standby and recovery stay distinct. Generated OFF is a simulation.'],
    ['Real Work Days', s.realWorkDays, 'Dubai calendar days touched by flight duty, SIM or ground school. Layovers and unactivated standby excluded.'],
    ['Home Days', s.fullHomeDays, `${decimal(s.homeDayEquivalents)} day equivalents, including partial days. Standby at home can count here.`],
    ['Family Quality Days', s.fullFamilyQualityDays, `${decimal(s.familyDayEquivalents)} equivalents in the family window; ${s.familyBlocksAtLeastThreeDays} blocks of 3+ clean days; longest ${s.longestFamilyBlock}d.`],
    ['Night / Jetlag Burden', `${decimal(s.nightDutyMinutes / 60)}h`, `${s.nightDutyReports} night duties · ${s.jetlagTrips} jetlag trips returning this month · ${s.recoveryAffectedDays} days touched by estimated recovery.`],
    ['Reports / mes', s.reports, `${s.dxbFlightReports} flight reports at DXB + ${s.outstationFlightReports} at outstations + ${s.trainingReports} untimed training reports. Trips and sectors are different counts.`],
  ];
  return (
    <section aria-labelledby="lifestyle-title" className="bg-surface border border-rule rounded-lg p-4 mb-6">
      <h2 id="lifestyle-title" className="font-display text-lg font-semibold text-ink">Time at home and family availability</h2>
      <p className="text-xs text-muted mt-1 mb-4">
        Based on this roster, using Dubai calendar dates. Family time and recovery are planning estimates.
        These metrics overlap and do not add up to the number of days in a month.
      </p>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map(([label, value, detail]) => (
          <div key={label} className="border border-rule rounded p-3">
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="font-display text-2xl font-semibold tabular-nums mt-1">{value}</dd>
            <dd className="text-xs text-muted mt-2 leading-relaxed">{detail}</dd>
          </div>
        ))}
      </dl>
      {(s.unknownDays > 0 || !s.priorContextKnown || s.missingTimeZoneTrips > 0) && (
        <p className="text-xs text-amber mt-3" role="status">
          Incomplete information: {s.unknownDays} days with unknown home hours.
          {!s.priorContextKnown && ' Previous-month history is incomplete; the first recovery window cannot be claimed as clean family time.'}
          {s.missingTimeZoneTrips > 0 && ` ${s.missingTimeZoneTrips} trips have missing station timezones; the longer recovery assumption is used.`}
          {' '}Unassigned days and leave with unconfirmed location do not count as home or family time.
        </p>
      )}
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer font-semibold text-ink">Definitions and recovery assumptions</summary>
        <div className="mt-3 space-y-2 text-muted leading-relaxed">
          <p>Home Days means full 24-hour days physically at home. Partial home hours are shown separately as equivalents. Untimed SIM and ground school do not imply 24 hours at home.</p>
          <p>Family Quality Days means no work or standby that day, with the entire {s.config.familyWindowStartHour}:00–{s.config.familyWindowEndHour}:00 window at home and outside modeled recovery. Equivalents measure available window hours, not confirmed time spent with family.</p>
          <p>Night burden measures duty overlap with 00:00–06:00 Dubai time, including estimated debrief. It is a base-clock exposure indicator, not a GCAA WOCL or a validated fatigue score. Jetlag trips have a maximum station clock shift of at least {s.config.jetlagThresholdHours} hours from Dubai, using the station offset on the travel date.</p>
          <p>Reports count the start of each duty, including outstations. Turns separated by less than 8 hours remain one duty even across midnight. A layover of at least 8 hours starts a new duty. The 90-minute report offset and 30-minute debrief use the existing pairing assumptions.</p>
          <p>Recovery windows overlap by union, so the same hour is deducted once. Night recovery follows each night duty; jetlag recovery starts on return home. The defaults below are sensitivity assumptions chosen for planning; the PilotTalk document provides qualitative evidence, not these numerical thresholds.</p>
        </div>
        <form method="get" className="flex flex-wrap gap-3 items-end mt-4">
          {[
            ['commute', 'Commute each way (min)', s.config.commuteMinutes, 180],
            ['nightRecovery', 'After night duty (h)', s.config.nightRecoveryHours, 72],
            ['jetlagRecovery', 'Shift ≥3h recovery (h)', s.config.jetlagRecoveryHours, 72],
            ['largeShiftRecovery', 'Shift ≥6h recovery (h)', s.config.largeShiftRecoveryHours, 72],
          ].map(([name, label, value, max]) => (
            <label key={name} className="flex flex-col gap-1">{label}
              <input name={String(name)} type="number" min="0" max={Number(max)} step="1" defaultValue={value}
                className="w-20 border border-rule rounded bg-paper p-1 text-ink" />
            </label>
          ))}
          <label className="flex flex-col gap-1">Standby location
            <select name="standbyAtHome" defaultValue={String(s.config.standbyAtHome)} className="border border-rule rounded bg-paper p-1 text-ink">
              <option value="true">Assume at home</option><option value="false">Unknown / airport</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">Leave location
            <select name="vacationAtHome" defaultValue={String(s.config.vacationAtHome)} className="border border-rule rounded bg-paper p-1 text-ink">
              <option value="false">Unknown / travelling</option><option value="true">Assume at home</option>
            </select>
          </label>
          <button type="submit" className="bg-flight text-white rounded px-3 py-1.5">Recalculate estimates</button>
        </form>
      </details>
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer font-semibold text-ink">Daily breakdown</summary>
        <div className="overflow-x-auto max-h-80 mt-3">
          <table className="w-full text-left tabular-nums">
            <thead><tr className="border-b border-rule">
              {['Date', 'Status', 'OFF', 'Work', 'Home h', 'Family h', 'Recovery h', 'Night h', 'Reports'].map(h => <th key={h} scope="col" className="p-2 whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>{s.days.map(d => (
              <tr key={d.date} className="border-b border-rule">
                <th scope="row" className="p-2 font-normal whitespace-nowrap">{d.date}</th>
                <td className="p-2 whitespace-nowrap">{labels[d.status]}</td>
                <td className="p-2">{d.officialOff ? 'Yes' : '—'}</td><td className="p-2">{d.realWork ? 'Yes' : '—'}</td>
                <td className="p-2">{d.homeHours === null ? '?' : decimal(d.homeHours)}</td>
                <td className="p-2">{d.familyHours === null ? '?' : decimal(d.familyHours)}</td>
                <td className="p-2">{decimal(d.recoveryHours)}</td><td className="p-2">{decimal(d.nightMinutes / 60)}</td><td className="p-2">{d.reports}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
      <p className="text-xs text-muted mt-4">Evidence: PilotTalk 2022 and later thematic videos. Historical B777 observations inform interpretation; A350/A380 ranges remain hypotheses, not Emirates guarantees.</p>
    </section>
  );
}
