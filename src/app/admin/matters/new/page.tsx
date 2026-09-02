import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";
import { createClient } from "@/lib/supabase/server";
import CreateMatterForm from "@/components/admin/CreateMatterForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "New Matter — ConveyClear Admin" };

export default async function NewMatterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // Arriving from a transfer's service checklist: "open this as a matter" knows
  // both the transaction and which of the seven services it means.
  const sp = (k: string) => {
    const v = searchParams?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const fromTransfer = sp("transfer");
  const fromService = sp("service");
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  // Open transfers, each with the parties already captured on it. Jukka's model:
  // the property transfer is the primary object and roughly 90% of matters hang
  // off one, so linking is offered at creation rather than as a later chore —
  // and the transfer's seller and buyer are then already known.
  const [{ data: services }, { data: clients }, { data: transferRows }] = await Promise.all([
    supabase.from("services").select("id, code, name").order("name"),
    supabase.from("clients").select("id, full_name, business_name").order("created_at", { ascending: false }).limit(200),
    supabase
      .from("property_transfers")
      .select(
        "id, reference, property_description, municipality, status, transfer_parties(role, client_id, full_name, business_name, entity_type, email, cell, clients(id, full_name, business_name)), transfer_services(service_code, prc_subtype, matter_id, parent_id, position)"
      )
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  type RawTransfer = {
    id: string;
    reference: string;
    property_description: string | null;
    municipality: string | null;
    transfer_parties: {
      role: string;
      client_id: string | null;
      full_name: string | null;
      business_name: string | null;
      entity_type: string | null;
      email: string | null;
      cell: string | null;
      clients: { id: string; full_name: string | null; business_name: string | null } | null;
    }[] | null;
    transfer_services: {
      service_code: string | null;
      prc_subtype: string | null;
      matter_id: string | null;
      parent_id: string | null;
      position: number | null;
    }[] | null;
  };

  const transfers = ((transferRows as RawTransfer[] | null) ?? []).map((t) => ({
    id: t.id,
    reference: t.reference,
    property_description: t.property_description,
    municipality: t.municipality,
    // The stage the PRC line already carries, so the title PREVIEW can show what
    // the server is actually going to save. Without it the preview read
    // COT_PRC_… while the created matter came out COT_RCF_…, because the stage
    // is inherited server-side and the form did not know it.
    //
    // Same rule the creation route adopts by: the first unclaimed top-level PRC
    // line in position order. If they ever disagree the preview is wrong again,
    // so they are written to match deliberately.
    prcSubtype:
      (t.transfer_services ?? [])
        .filter((s) => (s.service_code ?? "").toUpperCase() === "PRC" && !s.matter_id && !s.parent_id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.prc_subtype ?? null,
    // Only parties that ARE client records can be pre-selected as the matter's
    // client — a matter's client_id is a clients FK, so an uncaptured party has
    // nothing to point at.
    parties: (t.transfer_parties ?? [])
      .filter((p) => p.client_id && p.clients)
      .map((p) => ({
        id: p.clients!.id,
        role: p.role,
        label: p.clients!.business_name || p.clients!.full_name || "Unnamed",
      })),
    // 🔴 THE CAPTURED ONES, which the filter above deliberately drops and which
    // are now the COMMON case. Since 2026-09-02 a firm's transfer request writes
    // its seller and buyer onto the transfer as inline captures — real detail,
    // no client record — so a transfer typically arrives with two parties that
    // cannot be picked as the client and, until now, could not be used at all.
    //
    // Jukka, watching exactly this: "this we would have to have autofilled, it
    // doesn't do that at the moment." Zewn: "we want to autofill from the data
    // that's been entered into the property transfer."
    //
    // They are offered as a PREFILL for the new-client form rather than as a
    // selection, because that is what they are: what the attorney told us, ready
    // to become a client record once a staff member has checked it.
    capturedParties: (t.transfer_parties ?? [])
      .filter((p) => !p.client_id && (p.full_name || p.business_name))
      .map((p) => ({
        role: p.role,
        entityType: p.entity_type ?? "natural_person",
        fullName: p.full_name ?? null,
        businessName: p.business_name ?? null,
        email: p.email ?? null,
        cell: p.cell ?? null,
      })),
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/matters" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to matters
      </Link>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">New matter</h1>
        <p className="text-sm text-ink-3 mt-1">Create a matter directly in the portal — no Pipedrive needed.</p>
      </div>
      <CreateMatterForm
        services={(services as { id: string; code: string; name: string }[] | null) ?? []}
        clients={(clients as { id: string; full_name: string | null; business_name: string | null }[] | null) ?? []}
        transferOptions={transfers}
        initialServiceCode={fromService}
        transfer={fromTransfer ? transfers.find((t) => t.id === fromTransfer) : undefined}
      />
    </div>
  );
}
