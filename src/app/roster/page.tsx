/**
 * Roster month picker — entry point for the Phase 2 manual roster
 * constructor. Deliberately minimal (see the [year]/[month] page for the
 * scope note on why this is plain HTML forms/links, not a polished
 * calendar-picker widget — that visual investment belongs to Phase 5).
 */
export default function RosterIndexPage() {
  // The seed data (prisma/seed-data/dxb-seed-schedule.json) covers
  // October 2026 (see PLAN.md's Phase 4 reconciled-network note), so that's
  // the most useful default to link to.
  const defaultYear = 2026;
  const defaultMonth = 10;

  // Real current month — UTC-day convention (see
  // docs/roster-gen-assumptions.md item 16 / docs/pairing-assumptions.md
  // item 2), so a pilot can jump straight to "now" even outside the seed
  // data's covered month.
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const isCurrentMonthSameAsDefault =
    currentYear === defaultYear && currentMonth === defaultMonth;

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Roster planner</h1>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/roster/${defaultYear}/${defaultMonth}`}
          className="inline-block rounded bg-black px-4 py-2 text-white text-sm dark:bg-white dark:text-black"
        >
          Open {defaultYear}-{String(defaultMonth).padStart(2, '0')} (seed data)
        </a>

        {!isCurrentMonthSameAsDefault && (
          <a
            href={`/roster/${currentYear}/${currentMonth}`}
            className="inline-block rounded border px-4 py-2 text-sm"
          >
            Open current month ({currentYear}-{String(currentMonth).padStart(2, '0')})
          </a>
        )}
      </div>

      <p className="text-xs text-zinc-400 mt-8">
        Or navigate directly to <code>/roster/&lt;year&gt;/&lt;month&gt;</code>,
        e.g. <code>/roster/2026/3</code>. A month/year picker widget is a
        Phase 5 UI-polish concern — see the scope note on the
        [year]/[month] page.
      </p>
    </main>
  );
}
