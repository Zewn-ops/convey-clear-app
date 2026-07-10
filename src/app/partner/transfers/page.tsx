import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate, municipalityLabel } from "@/lib/utils";
import { TRANSFER_STATUS_LABELS, type PropertyTransfer, type TransferStatus } from "@/types";

export const metadata = { title: "Property Transfers — ConveyClear Partner" };
export const dynamic = "force-dynamic";

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s];
}

// Read-only. RLS (property_transfers_read_scoped) already limits these rows to
// the caller's own firm — no extra filter needed here.
export default async function PartnerTransfersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_transfers")
    .select("*")
    .order("created_at", { ascending: false });

  const transfers = (data as PropertyTransfer[] | null) ?? [];

  const counts = new Map<string, number>();
  if (transfers.length) {
    const { data: linked } = await supabase
      .from("matters")
      .select("transfer_id")
      .in("transfer_id", transfers.map((t) => t.id));
    (linked ?? []).forEach((m) => {
      const tid = (m as { transfer_id: string | null }).transfer_id;
      if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1);
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Property Transfers</h1>
        <p className="text-sm text-gray-500 mt-1">
          {transfers.length} transfer{transfers.length === 1 ? "" : "s"} · every matter in one transaction, together
        </p>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Council</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matters</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Opened</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/partner/transfers/${t.id}`} className="font-medium text-gray-900 hover:text-[#E8521A] hover:underline">
                      {t.reference}
                    </Link>
                    {t.property_description && <p className="text-xs text-gray-400 mt-0.5">{t.property_description}</p>}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{municipalityLabel(t.municipality)}</td>
                  <td className="px-5 py-3 text-gray-600">{counts.get(t.id) ?? 0}</td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{formatDate(t.created_at)}</td>
                  <td className="px-5 py-3">
                    <Badge label={TRANSFER_STATUS_LABELS[t.status]} variant={statusVariant(t.status)} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/partner/transfers/${t.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">View</Link>
                  </td>
                </tr>
              ))}
              {transfers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                    No property transfers yet. ConveyClear will group your matters here as transactions are set up.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
