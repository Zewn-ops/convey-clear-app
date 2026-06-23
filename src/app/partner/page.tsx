import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  type Matter,
  type MatterStatus,
} from "@/types";
import { getPipeline, phaseLabel } from "@/lib/pipelines";
import { Briefcase, Users, Clock, ArrowRight, PlusCircle, Phone, Mail, MessageSquare } from "lucide-react";
import { CONVEYCLEAR_PHONE, CONVEYCLEAR_EMAIL, telHref } from "@/lib/contact";

export const metadata = { title: "Partner Overview — ConveyClear" };

function statusVariant(s: string): "info" | "success" | "danger" | "warning" | "gray" {
  return ({ new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[s] ?? "gray";
}

export default async function PartnerOverview() {
  const supabase = await createClient();

  // RLS scopes all of these to the partner's firm automatically.
  const [{ count: totalMatters }, { count: activeMatters }, { count: clientCount }, { data: recent }] =
    await Promise.all([
      supabase.from("matters").select("id", { count: "exact", head: true }),
      supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("clients").select("id", { count: "exact", head: true }),
      supabase
        .from("matters")
        .select("id, title, current_phase, status, municipality, service_subtype, created_at, clients(full_name, business_name), services(code, name)")
        .in("status", ["open", "on_hold"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  type PartnerMatterRow = Matter & {
    municipality?: string | null;
    service_subtype?: string | null;
    services?: { code?: string | null; name?: string | null } | null;
  };
  const serviceLabel = (m: PartnerMatterRow) => [m.services?.name, m.service_subtype].filter(Boolean).join(": ");
  const matters = (recent as PartnerMatterRow[] | null) ?? [];

  // Per-row unread notification dots (cleared when the matter is opened).
  const meId = (await getSessionProfile())?.profile?.id ?? null;
  const unread = new Set<string>();
  if (meId && matters.length) {
    const { data: notes } = await supabase
      .from("notifications")
      .select("matter_id")
      .eq("user_id", meId)
      .is("read_at", null)
      .in("matter_id", matters.map((m) => m.id));
    (notes ?? []).forEach((n) => (n as { matter_id: string | null }).matter_id && unread.add((n as { matter_id: string }).matter_id));
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your matters</h1>
          <p className="text-sm text-gray-500 mt-1">Matters ConveyClear is handling for your clients.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`mailto:${CONVEYCLEAR_EMAIL}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1B2E6B] px-4 py-2 text-sm font-medium text-[#1B2E6B] hover:bg-[#1B2E6B]/5"
          >
            <Mail className="h-4 w-4" /> Email ConveyClear
          </a>
          <a
            href={telHref(CONVEYCLEAR_PHONE)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1B2E6B] px-4 py-2 text-sm font-medium text-[#1B2E6B] hover:bg-[#1B2E6B]/5"
          >
            <Phone className="h-4 w-4" /> Call ConveyClear · {CONVEYCLEAR_PHONE}
          </a>
          <Link
            href="/partner/enquiries"
            className="inline-flex items-center gap-2 rounded-lg border border-[#1B2E6B] px-4 py-2 text-sm font-medium text-[#1B2E6B] hover:bg-[#1B2E6B]/5"
          >
            <MessageSquare className="h-4 w-4" /> New enquiry
          </Link>
          <Link
            href="/partner/refer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#E8521A] px-4 py-2 text-sm font-medium text-white hover:bg-[#c94415]"
          >
            <PlusCircle className="h-4 w-4" /> Refer a matter
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-[#1B2E6B]/10 p-2.5"><Briefcase className="h-5 w-5 text-[#1B2E6B]" /></div>
          <div><p className="text-2xl font-bold text-[#1B2E6B]">{totalMatters ?? 0}</p><p className="text-xs text-gray-500">Total matters</p></div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2.5"><Clock className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-2xl font-bold text-blue-600">{activeMatters ?? 0}</p><p className="text-xs text-gray-500">Active</p></div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-[#E8521A]/10 p-2.5"><Users className="h-5 w-5 text-[#E8521A]" /></div>
          <div><p className="text-2xl font-bold text-[#E8521A]">{clientCount ?? 0}</p><p className="text-xs text-gray-500">Clients</p></div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Active matters</h2>
          <Link href="/partner/matters" className="flex items-center gap-1 text-sm text-[#E8521A] hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matter</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phase</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Opened</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {matters.map((m) => {
                  const pl = getPipeline(m.services?.code, m.municipality, m.service_subtype);
                  return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      <span className="flex items-center gap-2">
                        {unread.has(m.id) && <span className="h-2 w-2 rounded-full bg-[#E8521A] shrink-0" title="New activity" />}
                        <Link href={`/partner/matters/${m.id}`} className="hover:text-[#E8521A] hover:underline">
                          {m.title || clientDisplayName(m.clients) || "—"}
                        </Link>
                      </span>
                      {serviceLabel(m) && <p className="text-xs font-normal text-gray-400 mt-0.5">{serviceLabel(m)}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {m.current_phase ? (pl ? phaseLabel(pl, m.current_phase, true) : m.current_phase) : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{formatDate(m.created_at)}</td>
                    <td className="px-5 py-3">{m.status && <Badge label={MATTER_STATUS_LABELS[m.status as MatterStatus]} variant={statusVariant(m.status)} />}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/partner/matters/${m.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">View</Link>
                    </td>
                  </tr>
                  );
                })}
                {matters.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">No matters yet — refer your first client.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
