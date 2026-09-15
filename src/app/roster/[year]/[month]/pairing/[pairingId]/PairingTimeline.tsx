/**
 * Phase 5 Slice 4 — leg-by-leg pairing detail timeline. The "zoom in" view
 * for a specific multi-day trip, deep-linked from the calendar's FLIGHT day
 * cells (`DayCard.tsx`).
 *
 * Purely presentational — the row data is built by the pure
 * `pairingTimelineData.ts#buildPairingTimelineRows` (unit-tested there, per
 * this project's established precedent — see `complianceGrouping.ts`'s and
 * `dayPresentation.ts`'s doc comments for why this component itself is
 * not). Severity badges reuse `dayPresentation.ts`'s worst-severity-per-date
 * lookup and the same badge styling `DayCard.tsx` already uses, for visual
 * consistency with the calendar grid.
 */

import type { Severity } from '@/ftl/types';
import type { PairingTimelineRow } from './pairingTimelineData';

interface PairingTimelineProps {
  rows: PairingTimelineRow[];
  worstSeverityByDate: Map<string, Severity>;
}

const SEVERITY_BADGES: Record<Severity, string> = {
  RED: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  AMBER: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  GREEN: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
};

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${String(mins).padStart(2, '0')}m`;
}

export default function PairingTimeline({ rows, worstSeverityByDate }: PairingTimelineProps) {
  if (rows.length === 0) {
    return <p className="text-zinc-400 text-xs">This pairing has no legs.</p>;
  }

  const firstRowIndexByDate = new Map<string, number>();
  rows.forEach((row, index) => {
    if (!firstRowIndexByDate.has(row.serviceDate)) {
      firstRowIndexByDate.set(row.serviceDate, index);
    }
  });

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-zinc-500 border-b">
          <th className="py-1 pr-2">Date</th>
          <th className="py-1 pr-2">Flight</th>
          <th className="py-1 pr-2">Route</th>
          <th className="py-1 pr-2">Dep (local)</th>
          <th className="py-1 pr-2">Arr (local)</th>
          <th className="py-1 pr-2">Block</th>
          <th className="py-1 pr-2">Layover before</th>
          <th className="py-1 pr-2">Duty (day)</th>
          <th className="py-1 pr-2">Cumulative duty</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const showDate = firstRowIndexByDate.get(row.serviceDate) === index;
          const severity = showDate ? worstSeverityByDate.get(row.serviceDate) : undefined;

          return (
            <tr key={row.legIndex} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-1 pr-2 align-top whitespace-nowrap">
                {showDate ? (
                  <div className="flex items-center gap-1">
                    <span>{row.serviceDate}</span>
                    {severity && (
                      <span
                        className={`rounded px-1 py-0.5 font-semibold ${SEVERITY_BADGES[severity]}`}
                        title={`Worst GCAA compliance severity for ${row.serviceDate}: ${severity}`}
                      >
                        {severity}
                      </span>
                    )}
                  </div>
                ) : (
                  ''
                )}
              </td>
              <td className="py-1 pr-2 align-top whitespace-nowrap">{row.flightNumber}</td>
              <td className="py-1 pr-2 align-top whitespace-nowrap">
                {row.depIata}&rarr;{row.arrIata}
              </td>
              <td className="py-1 pr-2 align-top whitespace-nowrap">{row.depLocalTime}</td>
              <td className="py-1 pr-2 align-top whitespace-nowrap">{row.arrLocalTime}</td>
              <td className="py-1 pr-2 align-top whitespace-nowrap">
                {formatMinutes(row.blockTimeMin)}
              </td>
              <td className="py-1 pr-2 align-top whitespace-nowrap">
                {formatMinutes(row.layoverBeforeMinutes)}
              </td>
              <td className="py-1 pr-2 align-top whitespace-nowrap">
                {formatMinutes(row.dailyDutyMinutes)}
              </td>
              <td className="py-1 pr-2 align-top whitespace-nowrap">
                {formatMinutes(row.cumulativeDutyMinutes)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
