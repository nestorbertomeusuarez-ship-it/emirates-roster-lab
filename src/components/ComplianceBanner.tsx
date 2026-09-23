/**
 * Permanent disclaimer required on every user-facing surface from Phase 5
 * onward (see PLAN.md's "Permanent banner requirement"). Mounted once at
 * the root layout rather than duplicated per page, so no future route can
 * ship without it.
 *
 * Text is PLAN.md's exact mandated string, verbatim — do not paraphrase.
 */
export function ComplianceBanner() {
  return (
    <p className="bg-surface border-b border-rule px-6 py-2 text-xs text-amber text-center">
      personal planning tool, not an operational document, does not replace
      the official roster or the operator&apos;s OM-A.
    </p>
  );
}
