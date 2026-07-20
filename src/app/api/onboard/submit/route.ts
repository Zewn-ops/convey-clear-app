import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logMatterActivity } from "@/lib/activity";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { MATTER_DOCS_BUCKET } from "@/lib/storage";
import { notifyStaff } from "@/lib/notify";
import { dedupeSlotBatch, supersedeSlot, syncMatterDocToTransfer, isUndefinedColumn } from "@/lib/documents";
import { canonicalDocumentName } from "@/lib/doc-naming";

export const runtime = "nodejs";

// Onboard submit (Supabase-native — replaces the old n8n submit-docs webhook).
// Files are already in Supabase Storage (uploaded direct via signed URLs from
// /api/onboard/signed-upload). This persists the FICA fields, records the
// documents rows from their storage paths, logs "not available" reasons, and
// marks the onboarding link used. JSON body (files no longer transit Vercel).

interface FicaDetails {
  full_name?: string;
  surname?: string;
  business_name?: string;
  registration_no?: string;
  cell?: string;
  email?: string;
  id_number?: string;
  home_address?: string;
  industry?: string;
  designation?: string;
  municipal_username?: string;
  municipal_password?: string;
}
interface FicaDirector {
  full_name?: string;
  surname?: string;
  cell?: string;
  work_number?: string;
  email?: string;
  designation?: string;
}
interface FicaPayload {
  entity_type?: string;
  details?: FicaDetails;
  directors?: FicaDirector[];
  consents?: { popia?: boolean; terms?: boolean; marketing?: boolean };
}
interface UploadedDoc {
  storage_path?: string;
  document_type?: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  matter_party_id?: string;
}
interface NotAvailableDoc {
  document_type?: string;
  reason?: string;
  matter_party_id?: string;
}

export async function POST(request: Request) {
  if (!rateLimit(`onboard:${clientIp(request)}`, 15, 60_000)) {
    return NextResponse.json({ message: "Too many requests — please slow down." }, { status: 429 });
  }

  let body: {
    token?: string;
    matter_id?: string;
    entity_type?: string;
    fica?: FicaPayload;
    documents?: UploadedDoc[];
    not_available?: NotAvailableDoc[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const token = body.token ?? "";
  const matterId = body.matter_id ?? "";
  const entityType = body.entity_type ?? "";
  const fica = body.fica ?? {};
  if (!token || !matterId) {
    return NextResponse.json({ message: "Missing onboarding token." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Validate token → matter (server-side re-check).
  const { data: link } = await admin
    .from("onboarding_links")
    .select("id, matter_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || link.matter_id !== matterId) {
    return NextResponse.json({ message: "Invalid onboarding link." }, { status: 401 });
  }
  if (link.used_at) {
    return NextResponse.json({ message: "This onboarding link has already been used." }, { status: 401 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ message: "This onboarding link has expired." }, { status: 401 });
  }

  // 2. Resolve the matter's client (may be null for partner-managed COO matters).
  const { data: matter } = await admin.from("matters").select("client_id").eq("id", matterId).maybeSingle();
  const clientId = matter?.client_id as string | undefined;

  // 3. Persist FICA fields (best-effort — never block document recording).
  if (clientId && fica.details) {
    const d = fica.details;
    const consents = fica.consents ?? {};
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };

    // Only overwrite a field the form actually PROVIDED. Onboarding links are
    // re-issued routinely ("request a fresh link"), so a second submission with a
    // field left blank must not null what was already captured. `x || null` on
    // every field did exactly that.
    const put = (k: string, v: unknown) => {
      if (typeof v === "string") { const t = v.trim(); if (t) patch[k] = t; }
      else if (v != null) patch[k] = v;
    };
    put("primary_cell", d.cell);
    put("primary_email", d.email);
    put("id_number", d.id_number);
    put("physical_address", d.home_address);
    put("person_industry", d.industry);
    put("person_designation", d.designation);
    // NOTE: municipal_username/password are NOT written here. They are the
    // client's council login — a staff-only (sensitive) field the public onboard
    // form does not collect, so `d.municipal_* || null` only ever ERASED what
    // staff had entered. This path does not own them.

    // marketing is a preference — safe to set either way.
    patch.marketing_opt_in = Boolean(consents.marketing);
    // Consent timestamps are stamped only when granted, never nulled here: a
    // re-submit that doesn't re-tick must not erase a consent already on record
    // (the durable audit trail is consent_events, written below regardless).
    if (consents.popia) patch.popia_consent_at = now;
    if (consents.terms) patch.terms_accepted_at = now;

    if (entityType === "business") {
      put("business_name", d.business_name);
      put("registration_no", d.registration_no);
    } else {
      // FICA form's "full_name" field holds first name(s); surname is separate.
      const first = d.full_name?.trim() || "";
      const last = d.surname?.trim() || "";
      if (first) patch.first_name = first;
      if (last) patch.last_name = last;
      const full = `${first} ${last}`.trim();
      if (full) patch.full_name = full;
    }
    try {
      const { error: clientErr } = await admin.from("clients").update(patch).eq("id", clientId);
      if (clientErr) console.error("[onboard/submit] clients update failed:", clientErr.message);

      const directors = (fica.directors ?? []).filter((x) => x.full_name || x.email);
      if (directors.length) {
        const { error: contactErr } = await admin.from("contacts").insert(
          directors.map((x) => ({
            client_id: clientId,
            name: `${x.full_name ?? ""} ${x.surname ?? ""}`.trim(),
            email: x.email || null,
            cell: x.cell || null,
            work_number: x.work_number || null,
            designation: x.designation || null,
            is_director: true,
          }))
        );
        if (contactErr) console.error("[onboard/submit] contacts insert failed:", contactErr.message);
      }
    } catch (e) {
      console.error("[onboard/submit] field persistence error:", e);
    }
  }

  // 3b. Record consent events at the MATTER level — ALWAYS, even for COO /
  // partner-managed matters that have no client row (client_id is nullable).
  // POPIA requires a durable record of consent regardless of who submitted.
  if (fica.consents) {
    const consents = fica.consents;
    const { error: consentErr } = await admin.from("consent_events").insert(
      (["popia", "terms", "marketing"] as const).map((t) => ({
        client_id: clientId ?? null,
        matter_id: matterId,
        consent_type: t,
        granted: Boolean(consents[t]),
        source: "fica_form",
        ip_address: clientIp(request),
      }))
    );
    if (consentErr) console.error("[onboard/submit] consent_events insert failed:", consentErr.message);
  }

  // A token holder must not file a document under a matter_party_id from ANOTHER
  // matter: the id would pass the FK but attach the doc to a stranger's party.
  // Unknown ids are scrubbed to null (the doc lands at matter level) rather than
  // failing the whole submission.
  const { data: validParties } = await admin.from("matter_parties").select("id").eq("matter_id", matterId);
  const validPartyIds = new Set(((validParties as { id: string }[] | null) ?? []).map((p) => p.id));
  const safeParty = (pid?: string | null) => (pid && validPartyIds.has(pid) ? pid : null);

  // 4. Record document rows from their Storage paths (files already uploaded).
  const docs = (body.documents ?? []).filter(
    (d) => d.storage_path && d.storage_path.startsWith(`${matterId}/`)
  );
  if (docs.length) {
    // One document per (party, type) slot — migration 030. Two guards are needed:
    // in-batch, because the unique index rejects the WHOLE insert on the first
    // collision (a client attaching two files to one slot would lose the entire
    // submission to a raw 23505); and against rows already on the matter, since
    // a re-issued onboarding link means this form can be submitted twice.
    const rows = dedupeSlotBatch(
      await Promise.all(
        docs.map(async (d) => {
          // Canonical name, same as the portal upload path. Best-effort — a
          // naming failure must not cost the client their submission.
          let displayName = d.file_name || null;
          try {
            displayName = await canonicalDocumentName(admin, {
              matterId,
              matterPartyId: safeParty(d.matter_party_id),
              documentType: d.document_type || "other",
              originalFileName: d.file_name || null,
            });
          } catch (e) {
            console.error("[onboard/submit] canonical naming failed", e);
          }
          return {
            matter_id: matterId,
            document_type: d.document_type || "other",
            document_status: "provided",
            storage_bucket: MATTER_DOCS_BUCKET,
            storage_path: d.storage_path,
            file_name: displayName,
            original_file_name: d.file_name || null,
            mime_type: d.mime_type || null,
            size_bytes: d.size_bytes || null,
            matter_party_id: safeParty(d.matter_party_id),
            uploaded_by: "client",
          };
        })
      )
    );

    try {
      for (const r of rows) {
        await supersedeSlot(admin, {
          matterId,
          matterPartyId: r.matter_party_id,
          documentType: r.document_type,
        });
      }
    } catch (e) {
      return NextResponse.json({ message: `Could not record documents: ${(e as Error).message}` }, { status: 400 });
    }

    const SELECT_BACK = "id, document_type, file_name, mime_type, size_bytes, storage_path";
    let { data: insertedDocs, error: docErr } = await admin
      .from("documents")
      .insert(rows)
      .select(SELECT_BACK);

    // Deployed ahead of migration 040 — drop the new column and retry rather
    // than losing a client's whole submission to a missing column.
    if (docErr && isUndefinedColumn(docErr)) {
      const legacyRows = rows.map(({ original_file_name: _dropped, ...rest }) => rest);
      ({ data: insertedDocs, error: docErr } = await admin
        .from("documents")
        .insert(legacyRows)
        .select(SELECT_BACK));
    }
    if (docErr) {
      return NextResponse.json({ message: `Could not record documents: ${docErr.message}` }, { status: 400 });
    }

    // Two-way sync: a client's onboarding upload also lands on the matter's
    // property transfer. Best-effort per document — the submission has already
    // been recorded and must not be failed by the mirror. The client is not a
    // portal user, so these rows carry no uploaded_by.
    for (const d of insertedDocs ?? []) {
      try {
        await syncMatterDocToTransfer(admin, {
          documentId: d.id as string,
          matterId,
          documentType: (d.document_type as string) || "other",
          fileName: (d.file_name as string | null) ?? null,
          mimeType: (d.mime_type as string | null) ?? null,
          sizeBytes: (d.size_bytes as number | null) ?? null,
          storageBucket: MATTER_DOCS_BUCKET,
          storagePath: d.storage_path as string,
          uploadedById: null,
        });
      } catch (e) {
        console.error("[onboard/submit] transfer sync failed", e);
      }
    }
  }

  // 5. Record "not available" declarations as document rows.
  const na = (body.not_available ?? []).filter((x) => x.document_type);
  if (na.length) {
    const { error: naErr } = await admin.from("documents").insert(
      na.map((x) => ({
        matter_id: matterId,
        document_type: x.document_type,
        document_status: "not_available_reason_given",
        not_available_reason: x.reason || null,
        matter_party_id: safeParty(x.matter_party_id),
        uploaded_by: "client",
      }))
    );
    if (naErr) console.error("[onboard/submit] not_available insert failed:", naErr.message);
  }

  // 6. Mark the link used + log activity (best-effort).
  await admin.from("onboarding_links").update({ used_at: new Date().toISOString() }).eq("id", link.id);
  await logMatterActivity(admin, {
    matterId,
    activityType: "document_upload",
    authorLabel: "Client (onboarding form)",
    body: `Onboarding submitted — ${docs.length} document(s) uploaded${na.length ? `, ${na.length} marked not available` : ""}.`,
  });

  if (docs.length > 0) {
    await notifyStaff({
      type: "document",
      title: "Documents uploaded",
      body: `${docs.length} document(s) received via onboarding`,
      matter_id: matterId,
      link: `/admin/matters/${matterId}`,
    });
  }

  return NextResponse.json({ ok: true, doc_count: docs.length });
}
