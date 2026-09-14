/**
 * Roster month picker — entry point for the Phase 2 manual roster
 * constructor. Deliberately minimal (see the [year]/[month] page for the
 * scope note on why this is plain HTML forms/links, not a polished
 * calendar-picker widget — that visual investment belongs to Phase 5).
 */
export default function RosterIndexPage() {
  // The seed data (prisma/seed-data/dxb-seed-schedule.json) covers
  // February 2026, so that's the most useful default to link to.
  const defaultYear = 2026;
  const defaultMonth = 2;

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Roster planner</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Personal planning tool, not an operational document — does not
        replace the official roster or the operator&apos;s OM-A.
      </p>

      <a
        href={`/roster/${defaultYear}/${defaultMonth}`}
        className="inline-block rounded bg-black px-4 py-2 text-white text-sm dark:bg-white dark:text-black"
      >
        Open {defaultYear}-{String(defaultMonth).padStart(2, '0')}
      </a>

      <p className="text-xs text-zinc-400 mt-8">
        Or navigate directly to <code>/roster/&lt;year&gt;/&lt;month&gt;</code>,
        e.g. <code>/roster/2026/3</code>. A month/year picker widget is a
        Phase 5 UI-polish concern — see the scope note on the
        [year]/[month] page.
      </p>
    </main>
  );
}
