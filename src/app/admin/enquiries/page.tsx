import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import { isStaffRole, ENQUIRY_STATUS_LABELS, type Enquiry, type EnquiryStatus } from "@/types";

export const metadata = { title: "Enquiries — ConveyClear Admin" };
export const dynamic = "force-dynamic";

function statusVariant(s: EnquiryStatus): "info" | "success" | "warning" | "gray" {
  return ({ open: "warning", assigned: "info", resolved: "success", closed: "gray" } as const)[s] ?? "gray";
}
const STATUS_ORDER: Record<EnquiryStatus, number> = { open: 0, assigned: 1, resolved: 2, closed: 3 };

type Row = Enquiry & { firms?: { name: string } | null };

export default async function AdminEnquiriesPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("enquiries")
    .select("id, subject, status, created_at, updated_at, business_partner_id, assigned_to, firms(name)")
    .order("updated_at", { ascending: false });

  const rows = ((data as Row[] | null) ?? []).slice().sort((a, b) => {
    const d = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return d !== 0 ? d : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
  const openCount = rows.filter((r) => r.status === "open").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Enquiries</h1>
        <p className="text-sm text-ink-3 mt-1">{openCount} open · {rows.length} total — claim one to handle it.</p>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-raised">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Subject</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden md:table-cell">Firm</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden lg:table-cell">Updated</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-raised transition-colors">
                  <td className="px-5 py-3 font-medium text-ink">{e.subject}</td>
                  <td className="px-5 py-3 text-ink-3 hidden md:table-cell">{e.firms?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-3 hidden lg:table-cell">{formatDateTime(e.updated_at)}</td>
                  <td className="px-5 py-3"><Badge label={ENQUIRY_STATUS_LABELS[e.status]} variant={statusVariant(e.status)} /></td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/enquiries/${e.id}`} className="text-action hover:underline text-xs font-medium">Open</Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-ink-3">No enquiries</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
