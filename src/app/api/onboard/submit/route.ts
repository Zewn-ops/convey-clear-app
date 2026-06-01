import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// NOTE: documents are sent by the form STRAIGHT to n8n (nginx 50MB) to avoid Vercel's
// ~4.5MB function body limit. This route only persists the FICA fields (small JSON).

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

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const matterId = String(form.get("matter_id") ?? "");
  const entityType = String(form.get("entity_type") ?? "");

  let fica: FicaPayload = {};
  try {
    fica = JSON.parse(String(form.get("fica") ?? "{}")) as FicaPayload;
  } catch {
    fica = {};
  }

  if (!token || !matterId) {
    return NextResponse.json({ message: "Missing onboarding token." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Validate token → matter (the form already validated on render; re-check server-side)
  const { data: link } = await admin
    .from("onboarding_links")
    .select("id, matter_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.matter_id !== matterId) {
    return NextResponse.json({ message: "Invalid onboarding link." }, { status: 401 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ message: "This onboarding link has expired." }, { status: 401 });
  }

  // 2. Resolve the matter's client
  const { data: matter } = await admin
    .from("matters")
    .select("client_id")
    .eq("id", matterId)
    .maybeSingle();
  const clientId = matter?.client_id as string | undefined;

  // 3. Persist FICA fields (best-effort — never block document submission on a field error)
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
      await admin.from("clients").update(patch).eq("id", clientId);

      const directors = (fica.directors ?? []).filter((x) => x.full_name || x.email);
      if (directors.length) {
        await admin.from("contacts").insert(
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
      }

      await admin.from("consent_events").insert(
        (["popia", "terms", "marketing"] as const).map((t) => ({
          client_id: clientId,
          matter_id: matterId,
          consent_type: t,
          granted: Boolean(consents[t]),
          source: "fica_form",
        }))
      );
    } catch {
      // swallow — field persistence is non-critical relative to doc submission
    }
  }

  // Documents are submitted directly to n8n by the form (not through here).
  return NextResponse.json({ ok: true });
}
