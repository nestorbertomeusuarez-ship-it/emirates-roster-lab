/**
 * Phase 5 Slice 4 — pairing detail timeline route: the "zoom in" view for
 * one specific multi-day trip, showing its full leg-by-leg detail (station,
 * local dep/arr times, block time, layover-before, cumulative duty) instead
 * of just the calendar's compact route summary. Deep-linked from the
 * calendar's FLIGHT day cells (`DayCard.tsx`).
 *
 * Server component, same `params: Promise<{...}>` convention as the parent
 * `[year]/[month]/page.tsx` (confirmed against
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md),
 * one segment deeper.
 *
 * This is a separate route/request from the month page, so it cannot
 * receive props from it — it re-runs the exact same
 * `loadRosterGenDaysForMonth` + `getAirportTimeZones` + `evaluateRosterDays`
 * composition `page.tsx` already uses (Slice 1/2 plumbing, frozen/reused as
 * intended) to get this month's compliance evaluations, then slices them
 * down to this pairing's own date range — see
 * docs/roster-gen-assumptions.md item 13 for the judgment call on how a
 * pairing spanning outside the requested month's window is handled.
 */

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { loadPairingById } from '@/pairing/db/loadPairing';
import { getOrCreateRosterMonth } from '@/pairing/db/roster';
import { loadRosterGenDaysForMonth } from '@/roster-gen/db/loadRosterGenDays';
import { evaluateRosterDays } from '@/roster-gen/generateMonthlyRoster';
import { getAirportTimeZones } from '@/lib/airportTimeZones';
import { buildWorstSeverityMap } from '../../dayPresentation';
import CompliancePanel from '../../CompliancePanel';
import { buildPairingTimelineRows } from './pairingTimelineData';
import PairingTimeline from './PairingTimeline';

interface PairingDetailPageProps {
  params: Promise<{ year: string; month: string; pairingId: string }>;
}

export default async function PairingDetailPage({ params }: PairingDetailPageProps) {
  const { year: yearParam, month: monthParam, pairingId } = await params;
  const year = Number(yearParam);
  const month = Number(monthParam);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <p className="text-red-600">
          Invalid roster URL — expected /roster/&lt;year&gt;/&lt;month 1-12&gt;/pairing/&lt;pairingId&gt;.
        </p>
      </main>
    );
  }

  let pairing;
  try {
    pairing = await loadPairingById(prisma, pairingId);
  } catch {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <p className="text-red-600">No pairing found with id &quot;{pairingId}&quot;.</p>
        <Link href={`/roster/${year}/${month}`} className="underline text-xs">
          &larr; Back to {year}-{String(month).padStart(2, '0')}
        </Link>
      </main>
    );
  }

  const rosterMonth = await getOrCreateRosterMonth(prisma, year, month);
  const rosterGenDays = await loadRosterGenDaysForMonth(prisma, rosterMonth.id, year, month);
  const airportTimeZones = await getAirportTimeZones(prisma);
  const monthEvaluations = evaluateRosterDays(rosterGenDays, airportTimeZones);

  // JUDGMENT CALL (docs/roster-gen-assumptions.md item 13): sliced to this
  // pairing's own date range from THIS month's evaluation window only — a
  // pairing day outside [startServiceDate, endServiceDate] never belongs to
  // it, and a pairing day inside that range but outside the requested
  // month's own day range (e.g. a trip starting on the month's last day and
  // continuing into next month) simply has no evaluation entry here, since
  // `loadRosterGenDaysForMonth`/`evaluateRosterDays` only ever see this
  // month's own calendar cells — not a claim that the out-of-month portion
  // is compliant, just not evaluated from this route.
  const pairingEvaluations = monthEvaluations.filter(
    (e) => e.date >= pairing.startServiceDate && e.date <= pairing.endServiceDate
  );

  const rows = buildPairingTimelineRows(pairing, airportTimeZones);
  const worstSeverityByDate = buildWorstSeverityMap(pairingEvaluations);

  const route = pairing.legs
    .map((leg) => leg.instance.depIata)
    .concat(pairing.legs[pairing.legs.length - 1].instance.arrIata)
    .join(' → ');

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <Link href={`/roster/${year}/${month}`} className="underline text-xs">
        &larr; Back to {year}-{String(month).padStart(2, '0')}
      </Link>

      <h1 className="text-xl font-semibold mt-2 mb-1">
        {pairing.fleetType} pairing &mdash; {route}
      </h1>
      <p className="text-xs text-zinc-400 mb-6">
        {pairing.startServiceDate} to {pairing.endServiceDate} ({pairing.tripDays} day
        {pairing.tripDays === 1 ? '' : 's'})
      </p>

      <CompliancePanel evaluations={pairingEvaluations} />

      <section className="border rounded p-3 text-xs overflow-x-auto">
        <h2 className="text-sm font-semibold mb-2">Leg-by-leg timeline</h2>
        <PairingTimeline rows={rows} worstSeverityByDate={worstSeverityByDate} />
      </section>
    </main>
  );
}
