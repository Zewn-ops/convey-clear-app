import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import StatTile from "@/components/ui/StatTile";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import PhaseProgress from "@/components/ui/PhaseProgress";
import EmptyState from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { workdaysSince, relativeDays } from "@/lib/elapsed";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  type Matter,
  type MatterStatus,
} from "@/types";
import { getPipeline, phaseLabel, phaseOrder, phaseSteps } from "@/lib/pipelines";
import { ArrowRight, PlusCircle, Phone, Mail, MessageSquare, Briefcase } from "lucide-react";
import { CONVEYCLEAR_PHONE, CONVEYCLEAR_EMAIL, telHref } from "@/lib/contact";

export const metadata = { title: "Partner Overview — ConveyClear" };

const STATUS_TONE: Record<string, StatusTone> = {
  new: "waiting",
  open: "action",
  on_hold: "waiting",
  won: "ok",
  lost: "danger",
  archived: "neutral",
};

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
    <div className="mx-auto max-w-5xl space-y-7">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.025em] text-ink">Your matters</h1>
          <p className="mt-1 text-sm text-ink-3">Matters ConveyClear is handling for your clients.</p>
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
            href="/partner/refer"
            className="inline-flex items-center gap-2 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <PlusCircle className="h-4 w-4" /> Refer a matter
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile value={totalMatters ?? 0} label="Total" href="/partner/matters" />
        <StatTile value={activeMatters ?? 0} label="Active" tone="ok" href="/partner/matters?status=open" />
        <StatTile value={onHold ?? 0} label="On hold" tone="waiting" href="/partner/matters?status=on_hold" />
        <StatTile value={clientCount ?? 0} label="Clients" href="/partner/clients" />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">Active matters</h2>
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
              <Link href="/partner/refer" className="text-[12.5px] font-bold text-action hover:underline">
                Refer your first client
              </Link>
            }
          >
            Once you refer a client, their matter appears here with its phase, how long it has been
            running, and whatever is holding it up.
          </EmptyState>
        ) : (
          <ul className="space-y-2.5">
            {matters.map((m) => {
              const pl = getPipeline(m.services?.code, m.municipality, m.service_subtype);
              const steps = pl ? phaseSteps(pl) : [];
              const idx = pl ? phaseOrder(pl, m.current_phase) : -1;
              const open = workdaysSince(m.created_at);
              const seen = relativeDays((m as { updated_at?: string }).updated_at);
              const tone = STATUS_TONE[m.status ?? ""] ?? "neutral";
              const stalled = open !== null && open > 60;

              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-line bg-surface p-4 shadow-sm transition-shadow duration-200 ease-out hover:shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/partner/matters/${m.id}`}
                        className="flex items-center gap-2 text-[14.5px] font-bold tracking-[-0.01em] text-ink hover:text-action hover:underline"
                      >
                        {unread.has(m.id) && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-required-fill"
                            title="New activity"
                          />
                        )}
                        <span className="truncate">
                          {m.title || clientDisplayName(m.clients) || "Untitled matter"}
                        </span>
                      </Link>
                      {serviceLabel(m) && (
                        <p className="mt-0.5 text-[12px] text-ink-3">
                          {serviceLabel(m)}
                          {m.municipality ? ` · ${m.municipality}` : ""}
                        </p>
                      )}
                    </div>
                    {m.status && (
                      <StatusPill tone={tone}>
                        {MATTER_STATUS_LABELS[m.status as MatterStatus] ?? m.status}
                      </StatusPill>
                    )}
                  </div>

                  {pl && idx >= 0 && (
                    <div className="mt-3">
                      <PhaseProgress
                        phase={idx + 1}
                        total={steps.length}
                        label={phaseLabel(pl, m.current_phase, true)}
                        done={idx === steps.length - 1}
                      />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {open !== null && (
                      <MetaChip
                        label="Open"
                        value={`${open} workday${open === 1 ? "" : "s"}`}
                        tone={stalled ? "waiting" : "neutral"}
                      />
                    )}
                    {seen && <MetaChip label="Last update" value={seen} />}
                    <MetaChip label="Opened" value={formatDate(m.created_at)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
