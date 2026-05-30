import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { isStaffRole, clientDisplayName, MATTER_STATUS_LABELS, PHASE_LABELS, type Matter, type MatterPhase, type MatterStatus } from "@/types";
import { ClipboardList, Users, Clock, Briefcase, ArrowRight } from "lucide-react";

export const metadata = { title: "Admin Overview — ConveyClear" };

function matterStatusVariant(status: string): "info" | "success" | "danger" | "warning" | "gray" {
  const map: Record<string, "info" | "success" | "danger" | "warning" | "gray"> = {
    open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning",
  };
  return map[status] ?? "gray";
}

export default async function AdminPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();

  const [
    { count: totalMatters },
    { count: openMatters },
    { count: needsAction },
    { count: clientCount },
    { data: recentData },
  ] = await Promise.all([
    supabase.from("matters").select("id", { count: "exact", head: true }),
    supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("matters").select("id", { count: "exact", head: true }).in("current_phase", ["1", "2"]).eq("status", "open"),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("matters")
      .select("id, title, current_phase, status, priority, created_at, clients(full_name, business_name)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const matters = (recentData as Matter[] | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="text-sm text-gray-500 mt-1">ConveyClear client portal management</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-[#1B2E6B]/10 p-2.5">
            <Briefcase className="h-5 w-5 text-[#1B2E6B]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#1B2E6B]">{totalMatters ?? 0}</p>
            <p className="text-xs text-gray-500">Total matters</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2.5">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">{needsAction ?? 0}</p>
            <p className="text-xs text-gray-500">Needs action</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2.5">
            <ClipboardList className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600">{openMatters ?? 0}</p>
            <p className="text-xs text-gray-500">Open matters</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-[#E8521A]/10 p-2.5">
            <Users className="h-5 w-5 text-[#E8521A]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#E8521A]">{clientCount ?? 0}</p>
            <p className="text-xs text-gray-500">Clients</p>
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Recent Matters</h2>
          <Link href="/admin/matters" className="flex items-center gap-1 text-sm text-[#E8521A] hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phase</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Opened</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {matters.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {m.title || clientDisplayName(m.clients) || "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {m.current_phase
                        ? `Phase ${m.current_phase}: ${PHASE_LABELS[m.current_phase as MatterPhase]}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{formatDate(m.created_at)}</td>
                    <td className="px-5 py-3">
                      {m.status && (
                        <Badge
                          label={MATTER_STATUS_LABELS[m.status as MatterStatus]}
                          variant={matterStatusVariant(m.status)}
                        />
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/admin/matters/${m.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
                {matters.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-gray-400">No matters yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
