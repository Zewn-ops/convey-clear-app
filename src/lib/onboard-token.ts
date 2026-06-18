import type { SupabaseClient } from "@supabase/supabase-js";

// Onboarding-link token validation, Supabase-native (replaces the n8n
// validate-token webhook). Used by the public /onboard page (render) and the
// onboard submit/upload routes. Always call with the service-role admin client
// (the public visitor has no session).

export interface TokenData {
  link_id: string;
  matter_id: string;
  purpose: string;
  expires_at: string;
  matter_title: string;
  sub_service: string | null;
  drive_folder_id: string | null;
  client_name: string;
  entity_type: "natural_person" | "business";
  primary_email: string;
  id_number?: string | null;
  primary_cell?: string | null;
  physical_address?: string | null;
  registration_no?: string | null;
  service_code: string;
  service_name: string;
  service_config: {
    required_documents: {
      natural_person: string[];
      business: string[];
    };
    documents_allow_not_available: boolean;
  };
  // Present for COO (and other multi-party) matters → form renders per-party
  // document sections. Absent/empty for single-client matters.
  parties?: {
    id: string;
    role: string;
    display_name: string;
    entity_type: "natural_person" | "business" | "trust";
  }[];
}

// Lightweight check → matter id, for the per-file upload route. Returns null on
// any problem (invalid / used / expired).
export async function resolveOnboardingMatter(
  admin: SupabaseClient,
  token: string
): Promise<string | null> {
  if (!token) return null;
  const { data: link } = await admin
    .from("onboarding_links")
    .select("matter_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || link.used_at) return null;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null;
  return link.matter_id as string;
}

// Full validation → TokenData for rendering the form.
export async function validateOnboardingToken(
  admin: SupabaseClient,
  token: string
): Promise<{ data: TokenData | null; error: string | null }> {
  if (!token) return { data: null, error: "No onboarding link was provided." };

  const { data: link } = await admin
    .from("onboarding_links")
    .select("id, matter_id, purpose, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { data: null, error: "This link is invalid." };
  if (link.used_at) return { data: null, error: "This link has already been used." };
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { data: null, error: "This onboarding link has expired." };
  }

  const { data: m } = await admin
    .from("matters")
    .select(
      "id, title, service_notes, drive_folder_id, client_id, services(code, name, config), clients(entity_type, full_name, business_name, primary_email, id_number, primary_cell, physical_address, registration_no)"
    )
    .eq("id", link.matter_id)
    .maybeSingle();

  if (!m) return { data: null, error: "Matter not found for this link." };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const svc = (m as any).services ?? null;
  const c = (m as any).clients ?? null;
  const config = svc?.config ?? {};
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const entityType: "natural_person" | "business" =
    c?.entity_type === "business" || c?.entity_type === "trust" ? "business" : "natural_person";
  const clientName = c ? c.business_name || c.full_name || "Client" : m.title || "Client";

  const data: TokenData = {
    link_id: link.id,
    matter_id: link.matter_id,
    purpose: link.purpose,
    expires_at: link.expires_at ?? "",
    matter_title: m.title ?? "",
    sub_service: m.service_notes ?? null,
    drive_folder_id: m.drive_folder_id ?? null,
    client_name: clientName,
    entity_type: entityType,
    primary_email: c?.primary_email ?? "",
    id_number: c?.id_number ?? null,
    primary_cell: c?.primary_cell ?? null,
    physical_address: c?.physical_address ?? null,
    registration_no: c?.registration_no ?? null,
    service_code: svc?.code ?? "",
    service_name: svc?.name ?? "Onboarding",
    service_config: {
      required_documents: {
        natural_person: config?.required_documents?.natural_person ?? [],
        business: config?.required_documents?.business ?? [],
      },
      documents_allow_not_available: Boolean(config?.documents_allow_not_available),
    },
  };

  // COO / multi-party matters: surface the parties so the form can collect
  // documents per buyer/seller.
  const { data: pData } = await admin
    .from("matter_parties")
    .select("id, role, entity_type, full_name, business_name")
    .eq("matter_id", link.matter_id)
    .order("role", { ascending: true });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const parties = (pData ?? []).map((p: any) => ({
    id: p.id as string,
    role: p.role as string,
    entity_type: p.entity_type as "natural_person" | "business" | "trust",
    display_name: (p.entity_type === "natural_person" ? p.full_name : p.business_name) ?? p.role,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (parties.length > 0) data.parties = parties;

  return { data, error: null };
}
