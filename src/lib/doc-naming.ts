import type { SupabaseClient } from "@supabase/supabase-js";
import { docLabel } from "@/lib/prc-docs";

// Canonical document names.
//
// THE PROBLEM
//   A document was stored under whatever the uploader's file happened to be
//   called. On the matter you could still work out what `A4 - 1.pdf` was from
//   the slot it sat in — but the moment it travelled, that context was gone.
//   A property transfer listing `A4 - 1.pdf`, `A4 - 2.pdf`, `A4 - 5.pdf`, and a
//   council pack built from the same files, are both unreadable.
//
// THE SHAPE
//   <Document type> — <who or what it is about> — <YYYY-MM-DD>
//
//     Certified ID — Peter van der Merwe — 2026-07-20.pdf
//     COR 14.3 — Vela Holdings (Pty) Ltd — 2026-07-20.pdf
//     Deed Search — ERF 1234 Waterkloof — 2026-07-20.pdf
//
//   The subject is decided by the DATA, not by a hard-coded list of which types
//   are person-scoped: a document attached to a matter party is about that
//   person, anything else is about the property. That way a new document type
//   names itself correctly without anyone remembering to categorise it.
//
//   ISO dates, deliberately: they sort correctly in any list, and they are not
//   ambiguous about day-versus-month for whoever opens the council pack at the
//   other end.
//
// The uploader's original filename is kept in documents.original_file_name
// (migration 040) — provenance for matching a document back to the email it
// arrived in. Staff can still rename; nothing here overrides a later rename.

/** Filesystem-hostile characters, collapsed rather than dropped. */
function clean(part: string): string {
  return part
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extensionOf(fileName: string | null | undefined): string {
  if (!fileName) return "";
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(fileName);
  return m ? m[0].toLowerCase() : "";
}

export function buildDocumentName(input: {
  documentType: string;
  subject?: string | null;
  originalFileName?: string | null;
  when?: Date;
}): string {
  const date = (input.when ?? new Date()).toISOString().slice(0, 10);
  const parts = [clean(docLabel(input.documentType))];

  const subject = input.subject ? clean(input.subject) : "";
  if (subject) parts.push(subject);

  parts.push(date);
  return parts.join(" — ") + extensionOf(input.originalFileName);
}

/**
 * Work out what a document is ABOUT: the party it belongs to, or failing that
 * the property the matter concerns.
 *
 * Returns null when neither is known — the caller then names the document by
 * type and date alone, which is still far better than `A4 - 1.pdf`.
 *
 * Call with a service-role client; this runs after the caller is authorised.
 */
export async function resolveDocumentSubject(
  admin: SupabaseClient,
  input: { matterId: string; matterPartyId?: string | null }
): Promise<string | null> {
  if (input.matterPartyId) {
    const { data: party } = await admin
      .from("matter_parties")
      .select("full_name, business_name")
      .eq("id", input.matterPartyId)
      .maybeSingle();
    const name =
      (party?.business_name as string | null) || (party?.full_name as string | null) || null;
    if (name) return name;
  }

  const { data: matter } = await admin
    .from("matters")
    .select("property_description")
    .eq("id", input.matterId)
    .maybeSingle();

  return (matter?.property_description as string | null) || null;
}

/** Convenience: resolve the subject and build the name in one call. */
export async function canonicalDocumentName(
  admin: SupabaseClient,
  input: {
    matterId: string;
    matterPartyId?: string | null;
    documentType: string;
    originalFileName?: string | null;
  }
): Promise<string> {
  const subject = await resolveDocumentSubject(admin, {
    matterId: input.matterId,
    matterPartyId: input.matterPartyId,
  });
  return buildDocumentName({
    documentType: input.documentType,
    subject,
    originalFileName: input.originalFileName,
  });
}
