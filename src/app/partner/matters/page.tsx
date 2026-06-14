import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  PHASE_LABELS,
  MATTER_STATUS_LABELS,
  type Matter,
  type MatterPhase,
  type MatterStatus,
} from "@/types";

export const metadata = { title: "Matters — ConveyClear Partner" };

function statusVariant(s: string): "info" | "success" | "danger" | "warning" | "gray" {
  return ({ open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[s] ?? "gray";
}

export default async function PartnerMatters() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matters")
    .select("id, title, current_phase, status, municipality, created_at, clients(full_name, business_name)")
    .order("created_at", { ascending: false });
  const matters = (data as Matter[] | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Matters</h1>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matter</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Municipality</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phase</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {matters.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{m.title || clientDisplayName(m.clients) || "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{m.municipality || "—"}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {m.current_phase ? `Phase ${m.current_phase}: ${PHASE_LABELS[m.current_phase as MatterPhase]}` : "—"}
                  </td>
                  <td className="px-5 py-3">{m.status && <Badge label={MATTER_STATUS_LABELS[m.status as MatterStatus]} variant={statusVariant(m.status)} />}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/partner/matters/${m.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">View</Link>
                  </td>
                </tr>
              ))}
              {matters.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">No matters yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
