import type { RosterEntry } from '@prisma/client';
import type { GeneratedPairing } from '@/pairing/types';
import { DUTY_TYPES } from '@/pairing/types';
import {
  assignPairingDutyAction,
  assignSimpleDutyAction,
  clearDutyAction,
} from './actions';

interface DayCardProps {
  rosterMonthId: string;
  year: number;
  month: number;
  date: string; // 'YYYY-MM-DD'
  entry: RosterEntry | null;
  isPairingContinuation: boolean;
  dayOfPairing: number | null;
  candidates: GeneratedPairing[];
}

function summarizePairing(pairing: GeneratedPairing): string {
  const route = pairing.legs.map((leg) => leg.instance.depIata).concat(
    pairing.legs[pairing.legs.length - 1].instance.arrIata
  );
  const layoverNote =
    pairing.legs.length > 1
      ? ` (layover ${Math.round(
          (pairing.legs[1].layoverMinutesBeforeThisLeg ?? 0) / 60
        )}h${(pairing.legs[1].layoverMinutesBeforeThisLeg ?? 0) % 60}m)`
      : '';
  return `${pairing.fleetType} ${route.join('→')}${layoverNote} — ${pairing.tripDays}d`;
}

/**
 * One calendar-day cell in the roster grid. Plain click-to-assign forms —
 * no drag-and-drop (see page.tsx's scope note).
 */
export default function DayCard({
  rosterMonthId,
  year,
  month,
  date,
  entry,
  isPairingContinuation,
  dayOfPairing,
  candidates,
}: DayCardProps) {
  const dayNumber = Number(date.slice(8, 10));

  return (
    <div className="border rounded p-2 min-h-[9rem] flex flex-col gap-1 text-xs">
      <div className="font-semibold text-sm">{dayNumber}</div>

      {isPairingContinuation ? (
        <div className="rounded bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100 px-1 py-0.5">
          Pairing cont&apos;d (day {dayOfPairing})
        </div>
      ) : entry ? (
        <div className="rounded bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 px-1 py-0.5">
          {entry.dutyType}
          {entry.dutyType === 'FLIGHT' && entry.spansDays
            ? ` (${entry.spansDays}d)`
            : ''}
        </div>
      ) : (
        <div className="text-zinc-400">unassigned</div>
      )}

      {!isPairingContinuation && (
        <>
          <form action={assignSimpleDutyAction} className="flex gap-1">
            <input type="hidden" name="rosterMonthId" value={rosterMonthId} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <select name="dutyType" className="border rounded flex-1 min-w-0" defaultValue="OFF">
              {DUTY_TYPES.filter((d) => d !== 'FLIGHT').map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button type="submit" className="border rounded px-1">
              Set
            </button>
          </form>

          {candidates.length > 0 && (
            <form action={assignPairingDutyAction} className="flex gap-1">
              <input type="hidden" name="rosterMonthId" value={rosterMonthId} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <select name="pairingIndex" className="border rounded flex-1 min-w-0">
                {candidates.map((pairing, index) => (
                  <option key={index} value={index}>
                    {summarizePairing(pairing)}
                  </option>
                ))}
              </select>
              <button type="submit" className="border rounded px-1">
                Fly
              </button>
            </form>
          )}

          {entry && (
            <form action={clearDutyAction}>
              <input type="hidden" name="rosterMonthId" value={rosterMonthId} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <button type="submit" className="text-zinc-400 underline">
                clear
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
