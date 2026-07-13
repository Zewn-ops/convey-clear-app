import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { getPipeline, phaseLabel, stageLabel, isStageClientVisible } from "@/lib/pipelines";
import { formatDate, municipalityLabel } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  TRANSFER_STATUS_LABELS,
  type Matter,
  type MatterStatus,
  type PropertyTransfer,
  type TransferStatus,
  type TransferDocument,
} from "@/types";
import TransferDocuments from "@/components/transfers/TransferDocuments";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrls } from "@/lib/storage";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s];
}
function matterStatusVariant(s: string): "info" | "success" | "danger" | "warning" | "gray" {
  return ({ new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[
    s as MatterStatus
  ] ?? "gray";
}

type ClientRef = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
} | null;

type TransferDetail = PropertyTransfer & { seller?: ClientRef; buyer?: ClientRef };

type LinkedMatter = Matter & {
  service_subtype?: string | null;
  services?: { code: string | null; name: string | null } | null;
};

// Read-only view of one of the firm's transfers. RLS decides visibility: a
// transfer belonging to another firm simply isn't returned (→ 404). The linked
// matters list is likewise scoped by can_access_matter, so a matter on this
// transfer that the firm doesn't manage stays hidden.
export default async function PartnerTransferDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: transferData } = await supabase
    .from("property_transfers")
    .select(
      "*, seller:clients!property_transfers_seller_client_id_fkey(id, full_name, first_name, last_name, business_name), buyer:clients!property_transfers_buyer_client_id_fkey(id, full_name, first_name, last_name, business_name)"
    )
    .eq("id", id)
    .maybeSingle();

  const transfer = transferData as TransferDetail | null;
  if (!transfer) notFound();

  const { data: linkedData } = await supabase
    .from("matters")
    .select("id, title, current_phase, current_stage, status, municipality, service_subtype, created_at, services(code, name)")
    .eq("transfer_id", id)
    .order("created_at", { ascending: true });

  const linked = (linkedData as LinkedMatter[] | null) ?? [];

  // Transfer documents — the owning firm READS them (RLS: can_access_transfer)
  // but does not author them, matching how transfers themselves work (026).
  const { data: tdocData } = await supabase
    .from("transfer_documents")
    .select("*")
    .eq("transfer_id", id)
    .eq("status", "current")
    .order("created_at", { ascending: false });

  const transferDocs = (tdocData as TransferDocument[] | null) ?? [];
  const tdocUrls = transferDocs.length > 0 ? await signedDocUrls(createAdminClient(), transferDocs) : {};
  const transferDocsWithUrls = transferDocs.map((d) => ({
    ...d,
    url: d.storage_path ? tdocUrls[d.storage_path] : undefined,
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/partner/transfers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4" /> All property transfers
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1B2E6B]">{transfer.reference}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {transfer.property_description || "No property description"}
              {transfer.municipality ? ` · ${municipalityLabel(transfer.municipality)}` : ""}
            </p>
          </div>
          <Badge label={TRANSFER_STATUS_LABELS[transfer.status]} variant={statusVariant(transfer.status)} />
        </div>
      </div>

      <Card>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Transaction</p>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-gray-400">Seller</dt>
            <dd className="text-gray-800 mt-0.5">{transfer.seller ? clientDisplayName(transfer.seller) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Buyer</dt>
            <dd className="text-gray-800 mt-0.5">{transfer.buyer ? clientDisplayName(transfer.buyer) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Council</dt>
            <dd className="text-gray-800 mt-0.5">{municipalityLabel(transfer.municipality)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Opened</dt>
            <dd className="text-gray-800 mt-0.5">{formatDate(transfer.created_at)}</dd>
          </div>
        </dl>
      </Card>

      <Card padding="none">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Matters in this transfer · {linked.length}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matter</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Phase</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Stage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linked.map((m) => {
                const pl = getPipeline(m.services?.code, m.municipality, m.service_subtype);
                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/partner/matters/${m.id}`} className="font-medium text-gray-900 hover:text-[#E8521A] hover:underline">
                        {m.title || "Untitled"}
                      </Link>
                      {m.services?.name && <p className="text-xs text-gray-400 mt-0.5">{m.services.name}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden md:table-cell">
                      {m.current_phase ? (pl ? phaseLabel(pl, m.current_phase, true) : m.current_phase) : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">
                      {pl
                        ? m.current_stage
                          ? isStageClientVisible(pl, m.current_stage)
                            ? stageLabel(pl, m.current_stage)
                            : "In progress"
                          : "—"
                        : m.current_stage || "—"}
                    </td>
                    <td className="px-5 py-3">
                      {m.status && <Badge label={MATTER_STATUS_LABELS[m.status]} variant={matterStatusVariant(m.status)} />}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/partner/matters/${m.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">View</Link>
                    </td>
                  </tr>
                );
              })}
              {linked.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No matters linked yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Read-only: the firm sees the property's documents, staff maintain them. */}
      <TransferDocuments transferId={id} docs={transferDocsWithUrls} canManage={false} />
    </div>
  );
}
