import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { MATTER_DOCS_BUCKET } from "@/lib/storage";
import { notifyStaff } from "@/lib/notify";

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
    const patch: Record<string, unknown> = {
      primary_cell: d.cell || null,
      primary_email: d.email || null,
      id_number: d.id_number || null,
      physical_address: d.home_address || null,
      person_industry: d.industry || null,
      person_designation: d.designation || null,
      municipal_username: d.municipal_username || null,
      municipal_password: d.municipal_password || null,
      marketing_opt_in: Boolean(consents.marketing),
      popia_consent_at: consents.popia ? now : null,
      terms_accepted_at: consents.terms ? now : null,
      updated_at: now,
    };
    if (entityType === "business") {
      patch.business_name = d.business_name || null;
      patch.registration_no = d.registration_no || null;
    } else {
      patch.full_name = `${d.full_name ?? ""} ${d.surname ?? ""}`.trim() || null;
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

  // 4. Record document rows from their Storage paths (files already uploaded).
  const docs = (body.documents ?? []).filter(
    (d) => d.storage_path && d.storage_path.startsWith(`${matterId}/`)
  );
  if (docs.length) {
    const { error: docErr } = await admin.from("documents").insert(
      docs.map((d) => ({
        matter_id: matterId,
        document_type: d.document_type || "other",
        document_status: "provided",
        storage_bucket: MATTER_DOCS_BUCKET,
        storage_path: d.storage_path,
        file_name: d.file_name || null,
        mime_type: d.mime_type || null,
        size_bytes: d.size_bytes || null,
        matter_party_id: d.matter_party_id || null,
        uploaded_by: "client",
      }))
    );
    if (docErr) {
      return NextResponse.json({ message: `Could not record documents: ${docErr.message}` }, { status: 400 });
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
        matter_party_id: x.matter_party_id || null,
        uploaded_by: "client",
      }))
    );
    if (naErr) console.error("[onboard/submit] not_available insert failed:", naErr.message);
  }

  // 6. Mark the link used + log activity (best-effort).
  await admin.from("onboarding_links").update({ used_at: new Date().toISOString() }).eq("id", link.id);
  await admin.from("matter_activities").insert({
    matter_id: matterId,
    activity_type: "document_upload",
    author_label: "Client (onboarding form)",
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
