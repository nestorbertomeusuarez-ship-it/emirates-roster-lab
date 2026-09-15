/**
 * Shared regulatory-source constants for every rule in this engine, so the
 * document/URL/date-consulted triple is defined exactly once instead of
 * being copy-pasted (and risking drift) into every rule file.
 *
 * Source verified this session: CAR-AIR OPS – Part-ORO, Issue 03, Subpart
 * FTL, Section 1 (General, ORO.FTL.100.G-125.G) and Section 2 (Aeroplanes,
 * ORO.FTL.200.G-270.G). Issued by the UAE General Civil Aviation Authority
 * (GCAA). See `docs/gcaa-sources.md` for the full citation table and the
 * explicit superseded-document / helicopter-scope warnings.
 */

export const GCAA_DOCUMENT =
  'CAR-AIR OPS – Part-ORO, Issue 03';

export const GCAA_DOCUMENT_URL =
  'https://www.gcaa.gov.ae/en/epublication/EPublications/Civil%20Aviation%20Regulations%20(CARs)/CAR%20IV%20-%20FLIGHT%20OPERATIONS%20REGULATIONS/CAR%20AIR%20OPS/CAR%20-%20AIR-OPS%20-%20ISSUE%2003/CAR-AIR%20OPS%20-%20PART-ORO%20-%20ISSUE%2003.pdf';

export const GCAA_DATE_CONSULTED = '2026-09-14';

import type { RuleCitation } from './types';

/**
 * Builds a `RuleCitation` against the verified GCAA source above. `clause`
 * must be an exact clause identifier from the public text (e.g.
 * 'ORO.FTL.255.G(c)') — never a guessed or approximated one.
 */
export function gcaaCitation(ruleId: string, clause: string): RuleCitation {
  return {
    ruleId,
    clause,
    document: GCAA_DOCUMENT,
    documentUrl: GCAA_DOCUMENT_URL,
    dateConsulted: GCAA_DATE_CONSULTED,
  };
}

/**
 * Builds a citation for an operator-specific placeholder rule: there is no
 * GCAA clause to point to (the scheme is not publicly published), but the
 * same source/date context is kept for traceability of *why* it's a gap.
 */
export function operatorSpecificCitation(
  ruleId: string,
  scopeNote: string
): RuleCitation {
  return {
    ruleId,
    clause: `N/A — operator-specific, not published in ORO.FTL.100.G-270.G (${scopeNote})`,
    document: GCAA_DOCUMENT,
    documentUrl: GCAA_DOCUMENT_URL,
    dateConsulted: GCAA_DATE_CONSULTED,
  };
}

/**
 * EASA CS-FTL.1.205(c) (the augmented-crew rest-facility -> max-FDP table),
 * corroborated against the UK CAA's own hosted regulatory-library copy of
 * the same text. Verified this session (see `docs/roster-gen-assumptions.md`
 * for the full judgment-call log). Used, per explicit user instruction, as
 * the closest available PUBLIC proxy for two GCAA `OPERATOR_SPECIFIC` gaps
 * (`src/ftl/rules/operatorSpecific.ts`) — it is a DIFFERENT regulator's
 * public text, never Emirates' actual confidential/approved scheme, so it
 * must never be built with `gcaaCitation` (which asserts the GCAA document
 * above as the source).
 */
export const EASA_UK_CAA_PROXY_DOCUMENT =
  "EASA CS-FTL.1.205(c) (Certification Specifications and Guidance Material to Part-ORO — Subpart FTL), corroborated against the UK CAA Regulatory Library's hosted copy of the same clause. NOT a GCAA document, and NOT Emirates' actual approved scheme — used only as the closest public proxy, per explicit user instruction.";

export const EASA_UK_CAA_PROXY_DOCUMENT_URL =
  'https://regulatorylibrary.caa.co.uk/965-2012/Content/Document%20Structure/03%20ORO/5%20CS/CS%20FTL%201%20205%20Flight%20duty%20period.htm';

export const EASA_UK_CAA_PROXY_DATE_CONSULTED = '2026-09-15';

/**
 * Builds a citation against the EASA/UK-CAA proxy source above, for use
 * only where GCAA publishes no equivalent public data and a different
 * regulator's public text is being used as an explicit stand-in (never for
 * anything GCAA-sourced — use `gcaaCitation` for that).
 */
export function easaProxyCitation(ruleId: string, clause: string): RuleCitation {
  return {
    ruleId,
    clause,
    document: EASA_UK_CAA_PROXY_DOCUMENT,
    documentUrl: EASA_UK_CAA_PROXY_DOCUMENT_URL,
    dateConsulted: EASA_UK_CAA_PROXY_DATE_CONSULTED,
  };
}
