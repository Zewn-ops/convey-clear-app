"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// In-place intake: staff mark an OPTIONAL required document as "not available"
// so an intentionally-absent doc reads as handled, not forgotten. Stored as a
// list of "<partyId|shared>:<docType>" keys on service_data.docs_unavailable.
// User-scoped client → RLS gates who can update the matter (staff).
export async function toggleDocUnavailable(formData: FormData) {
  const matterId = (formData.get("matter_id") as string) || "";
  const key = (formData.get("doc_key") as string) || "";
  const make = formData.get("make") === "1";
  if (!matterId || !key) return;

  const supabase = await createClient();
  const { data } = await supabase.from("matters").select("service_data").eq("id", matterId).maybeSingle();
  const sd = ((data as { service_data?: Record<string, unknown> } | null)?.service_data ?? {}) as Record<string, unknown>;
  const cur = Array.isArray(sd.docs_unavailable) ? (sd.docs_unavailable as string[]) : [];
  const next = make ? Array.from(new Set([...cur, key])) : cur.filter((k) => k !== key);

  await supabase.from("matters").update({ service_data: { ...sd, docs_unavailable: next } }).eq("id", matterId);
  revalidatePath(`/admin/matters/${matterId}`);
  revalidatePath(`/partner/matters/${matterId}`);
}
