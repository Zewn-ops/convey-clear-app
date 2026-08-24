import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import StatTile from "@/components/ui/StatTile";
import MatterCard from "@/components/matters/MatterCard";
import EmptyState from "@/components/ui/EmptyState";
import { type Matter } from "@/types";
import { ArrowRight, PlusCircle, Phone, Mail, MessageSquare, Briefcase } from "lucide-react";
import { CONVEYCLEAR_PHONE, CONVEYCLEAR_EMAIL, telHref } from "@/lib/contact";

export const metadata = { title: "Partner Overview — ConveyClear" };

export default async function PartnerOverview() {
  const supabase = await createClient();

  // RLS scopes all of these to the partner's firm automatically.
  const [{ count: totalMatters }, { count: activeMatters }, { count: onHold }, { count: clientCount }, { data: recent }] =
    await Promise.all([
      supabase.from("matters").select("id", { count: "exact", head: true }),
      supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "on_hold"),
      supabase.from("clients").select("id", { count: "exact", head: true }),
      supabase
        .from("matters")
        .select("id, title, current_phase, status, municipality, service_subtype, created_at, updated_at, clients(full_name, business_name), services(code, name)")
        .in("status", ["open", "on_hold"])
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  type PartnerMatterRow = Matter & {
    municipality?: string | null;
    service_subtype?: string | null;
    services?: { code?: string | null; name?: string | null } | null;
  };
  const serviceLabel = (m: PartnerMatterRow) =>
    [m.services?.name, m.service_subtype].filter(Boolean).join(": ");
  const matters = (recent as PartnerMatterRow[] | null) ?? [];
  const ids = matters.map((m) => m.id);

  // Per-row unread dots, and the last time anything happened on each matter.
  // Both are single queries over the listed ids rather than one per row.
  // Unread dots only. "Last update" deliberately comes from matters.updated_at,
  // NOT matter_activities: that table's RLS hides staff notes from partners
  // (activities_read_scoped allows non-staff only status_change,
  // document_upload, phase_transition and poa_signed), so a chip driven by it
  // renders blank for exactly the people reading this page. updated_at also
  // avoids leaking that an internal note was written, since notes do not touch
  // the matters row.
  const meId = (await getSessionProfile())?.profile?.id ?? null;
  const unread = new Set<string>();

  if (ids.length && meId) {
    const { data: notes } = await supabase
      .from("notifications")
      .select("matter_id")
      .eq("user_id", meId)
      .is("read_at", null)
      .in("matter_id", ids);
    (notes ?? []).forEach((n) => {
      const id = (n as { matter_id: string | null }).matter_id;
      if (id) unread.add(id);
    });
  }

  const actionLink =
    "inline-flex items-center gap-2 rounded border border-line px-3.5 py-2 text-sm font-medium text-ink-2 transition-colors duration-150 ease-out hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Your matters</h1>
          <p className="mt-2.5 text-[15px] font-medium text-ink-3">Matters ConveyClear is handling for your clients.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`mailto:${CONVEYCLEAR_EMAIL}`} className={actionLink}>
            <Mail className="h-4 w-4" /> Email ConveyClear
          </a>
          <a href={telHref(CONVEYCLEAR_PHONE)} className={actionLink}>
            <Phone className="h-4 w-4" /> Call &middot; {CONVEYCLEAR_PHONE}
          </a>
          <Link href="/partner/enquiries" className={actionLink}>
            <MessageSquare className="h-4 w-4" /> New enquiry
          </Link>
          <Link
            href="/partner/transfers/new"
            className="inline-flex items-center gap-2 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <PlusCircle className="h-4 w-4" /> Request a property transfer
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={totalMatters ?? 0} label="Total" href="/partner/matters" />
        <StatTile value={activeMatters ?? 0} label="Active" tone="ok" href="/partner/matters?status=open" />
        <StatTile value={onHold ?? 0} label="On hold" tone="waiting" href="/partner/matters?status=on_hold" />
        <StatTile value={clientCount ?? 0} label="Clients" href="/partner/clients" />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">Active matters</h2>
          <Link
            href="/partner/matters"
            className="flex items-center gap-1 text-sm font-medium text-action hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {matters.length === 0 ? (
          <EmptyState
            title="No active matters"
            icon={<Briefcase className="h-6 w-6" />}
            action={
              <Link href="/partner/transfers/new" className="text-[12.5px] font-bold text-action hover:underline">
                Request your first property transfer
              </Link>
            }
          >
            Once you request a property transfer, its matters appear here with their phase, how long
            they have been running, and whatever is holding them up.
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {matters.map((m) => (
              <MatterCard
                key={m.id}
                matter={m}
                href={`/partner/matters/${m.id}`}
                unread={unread.has(m.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
