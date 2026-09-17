import { councilServiceSpec, documentsOfClass } from "@/lib/councils";
import { docLabel } from "@/lib/prc-docs";
import { isPostRegistration } from "@/lib/councils/registration-stage";
import type { PrcStage } from "@/lib/councils/types";

/**
 * The documents ONE service at ONE council asks an attorney for, as upload
 * slots.
 *
 * Zewn, 2026-09-17: "ideally I'd want the upload slots to all be customised to
 * each service list provided. So if we do a change of ownership in COT then it
 * should have upload slots for each document that the COO COT requires."
 *
 * Until now the matter-creation page showed the transfer's five NAMED documents
 * — deed search, transfer letter, clearance figures, proof of payment,
 * electrical COC — which are a fixed set, identical on every transfer at every
 * council, and have nothing to do with the service being opened. An attorney
 * opening Existing Building Plans read a list of five documents we needed and
 * was offered five different ones to upload.
 *
 * ── WHAT IS EXCLUDED, AND WHY ──────────────────────────────────────────────
 *
 * OUTPUT documents. Those are what ConveyClear produces and delivers — the
 * updated deed search, the clearance certificate. An attorney cannot upload
 * something we have not made yet, and offering the slot implies they should.
 *
 * FIRM-OWNED documents. The firm's FFC and letterhead autofill from its own
 * record (§11.3); asking again is asking twice.
 *
 * ── THE SLOT THAT IS ALWAYS THERE ──────────────────────────────────────────
 *
 * "Something else" is appended to every list, including an empty one. Zewn:
 * "just make sure there's always an option to upload other for docs we have not
 * specified that the attorney might consider useful to us in any capacity."
 *
 * That is not a nicety. The 2026-09-17 audit found 12 of 33 council/service
 * combinations with NO document list at all, so for those this slot is the only
 * way in until Jukka fills the gaps — and a page that asks for nothing and
 * offers nowhere to put anything is worse than no page.
 */
export interface ServiceDocSlot {
  /** Document type code — matches transfer_documents.document_type. */
  type: string;
  label: string;
  /** "input" = what we need to start; "supporting" = identity & verification. */
  docClass: "input" | "supporting";
  optional: boolean;
  /** Which side of registration this can exist on (097 / Jukka 2026-09-15). */
  postRegistration: boolean;
  /** Whose document it is, where the registry says. */
  owner?: string | null;
}

/** The catch-all. `type` matches the portal's existing "other" document type. */
export const OTHER_SLOT: ServiceDocSlot = {
  type: "other",
  label: "Something else",
  docClass: "supporting",
  optional: true,
  postRegistration: false,
  owner: null,
};

export function serviceDocSlots(
  municipality: string | null | undefined,
  serviceCode: string,
  prcStage?: string | null
): ServiceDocSlot[] {
  // The registry keys PRC on a closed set; anything else is not a stage.
  const stage = (["RCA", "RCF", "RCC"] as const).find((s) => s === (prcStage ?? "").toUpperCase()) ?? null;
  const spec = councilServiceSpec(municipality, serviceCode, stage as PrcStage | null);
  const slots: ServiceDocSlot[] = [];

  // Input first, then supporting — the order the page reads in, and the order
  // an attorney assembles a file in.
  for (const docClass of ["input", "supporting"] as const) {
    for (const r of documentsOfClass(spec, docClass)) {
      if (r.owner === "firm") continue;
      const shared = docLabel(r.type);
      const label = !r.label || r.label === shared ? shared : `${r.label} (${shared})`;
      // A council can list the same type under both classes; the first wins,
      // because a document belongs in one place on a page.
      if (slots.some((s) => s.type === r.type)) continue;
      slots.push({
        type: r.type,
        label,
        docClass,
        optional: r.optional === true,
        postRegistration: isPostRegistration(label),
        owner: r.owner ?? null,
      });
    }
  }

  slots.push(OTHER_SLOT);
  return slots;
}

/**
 * Match the slots against what the transaction already holds.
 *
 * Zewn, 2026-09-17: "if there are any of those documents already uploaded to
 * the prop trf that it should have a link from trf button next to it. We don't
 * need to see the whole list of docs uploaded, just a link button if the doc
 * types match."
 *
 * So the transfer's documents are not listed — they are only ever an answer to
 * "is this slot already filled somewhere on the transaction?".
 *
 * ⚠️ "other" is deliberately never matched. It is a catch-all, so every
 * unclassified document on the transfer would match it at once and the slot
 * would offer to link a pile of unrelated files.
 */
export interface TransferDocRef {
  id: string;
  document_type: string | null;
  file_name: string | null;
}

export function matchTransferDocs(
  slots: ServiceDocSlot[],
  transferDocs: TransferDocRef[]
): Map<string, TransferDocRef[]> {
  const byType = new Map<string, TransferDocRef[]>();
  for (const slot of slots) {
    if (slot.type === OTHER_SLOT.type) continue;
    const hits = transferDocs.filter((d) => (d.document_type ?? "") === slot.type);
    if (hits.length) byType.set(slot.type, hits);
  }
  return byType;
}
