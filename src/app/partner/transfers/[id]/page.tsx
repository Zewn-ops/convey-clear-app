import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import TransferParties, { type PartyRow as TPartyRow, type PartyOption } from "@/components/transfers/TransferParties";
import {
  TRANSFER_PARTY_SELECT,
  mapTransferParties,
  type RawTransferParty,
} from "@/lib/transfer-parties";
import DetailFields from "@/components/ui/DetailFields";
import { workdaysSince } from "@/lib/elapsed";
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
import TransferFeed, { type TransferActivity } from "@/components/transfers/TransferFeed";
import LinkMatterControl from "@/components/transfers/LinkMatterControl";
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

  // Parties (050). RLS on transfer_parties routes through can_access_transfer,
  // so these rows exist only for transfers this firm already works.
  const { data: partyRows } = await supabase
    .from("transfer_parties")
    .select(TRANSFER_PARTY_SELECT)
    .eq("transfer_id", id)
    .order("role", { ascending: true });

  // Partners have no /admin/clients route, so a party never links out here —
  // the contact card in place IS the answer rather than a step toward one.
  // ID numbers are withheld: the firm works this transfer and legitimately sees
  // the parties, but FICA identity numbers are staff-only until Jukka says
  // otherwise.
  const partyList: TPartyRow[] = mapTransferParties(
    partyRows as RawTransferParty[] | null,
    { linkClients: false }
  );

  // Pickers are RLS-scoped too: a firm links only to clients it can already see.
  const [{ data: entityOpts }, { data: firmOpts }] = await Promise.all([
    supabase.from("clients").select("id, full_name, business_name, entity_type")
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("firms").select("id, name, partner_type").eq("active", true)
      .order("name", { ascending: true }).limit(100),
  ]);
  const entityOptions: PartyOption[] = ((entityOpts as { id: string; full_name: string | null; business_name: string | null; entity_type: string }[] | null) ?? []).map((c) => ({
    id: c.id, name: c.business_name?.trim() || c.full_name?.trim() || "Unnamed",
    kind: c.entity_type.replace("_", " "),
  }));
  const firmOptions: PartyOption[] = ((firmOpts as { id: string; name: string; partner_type: string | null }[] | null) ?? []).map((f) => ({
    id: f.id, name: f.name, kind: (f.partner_type ?? "firm").replace("_", " "),
  }));

  const { data: linkedData } = await supabase
    .from("matters")
    .select("id, title, current_phase, current_stage, status, municipality, service_subtype, created_at, services(code, name)")
    .eq("transfer_id", id)
    .order("created_at", { ascending: true });

  const linked = (linkedData as LinkedMatter[] | null) ?? [];

  // The firm's own matters not yet under any transfer — the pool this transfer
  // can pull from. RLS (can_access_matter) already scopes these to the firm.
  const { data: freeData } = await supabase
    .from("matters")
    .select("id, title, municipality, created_at")
    .is("transfer_id", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const candidates = ((freeData as { id: string; title: string | null; municipality: string | null }[] | null) ?? []).map(
    (m) => ({ id: m.id, label: m.title || `Untitled matter (${municipalityLabel(m.municipality)})` })
  );

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

  // The firm posts to the transfer feed as well as reading it — that two-way
  // channel is precisely why transfers didn't also need an enquiry thread (035).
  const { data: feedData } = await supabase
    .from("transfer_activities")
    .select("id, activity_type, body, author_label, created_at, users(full_name)")
    .eq("transfer_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  const feed = (feedData as unknown as TransferActivity[] | null) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/partner/transfers" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4">
          <ArrowLeft className="h-4 w-4" /> All property transfers
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">{transfer.reference}</h1>
            <p className="mt-2.5 text-[15px] font-medium text-ink-3">
              {transfer.property_description || "No property description"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {transfer.municipality && (
                <MetaChip label="Council" value={municipalityLabel(transfer.municipality)} />
              )}
              <MetaChip label="Matters" value={linked.length} tone={linked.length === 0 ? "required" : "neutral"} />
              {(() => {
                const live = transfer.status === "open" || transfer.status === "on_hold";
                const open = workdaysSince(transfer.created_at);
                return live && open !== null ? (
                  <MetaChip
                    label="Open"
                    value={`${open} workday${open === 1 ? "" : "s"}`}
                    tone={open > 60 ? "waiting" : "neutral"}
                  />
                ) : null;
              })()}
            </div>
          </div>
          <StatusPill
            tone={
              ({ open: "action", registered: "ok", cancelled: "danger", on_hold: "waiting" } as Record<string, StatusTone>)[
                transfer.status
              ] ?? "neutral"
            }
          >
            {TRANSFER_STATUS_LABELS[transfer.status]}
          </StatusPill>
        </div>
      </div>

      <Card>
        <TransferParties
          transferId={id}
          parties={partyList}
          entities={entityOptions}
          firms={firmOptions}
          canEdit
        />
      </Card>

      {/* Same two-tier card as the admin side. `notes` is deliberately NOT here:
          it is ConveyClear's internal working note on the transaction, and the
          admin card is the only place it belongs. */}
      <Card>
        <p className="mb-4 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">Transaction</p>
        <DetailFields
          primary={[
            { label: "Reference", value: transfer.reference },
            { label: "Status", value: TRANSFER_STATUS_LABELS[transfer.status] },
            { label: "Council", value: municipalityLabel(transfer.municipality) },
            { label: "Property", value: transfer.property_description, wide: true },
          ]}
          extra={[
            { label: "Matters linked", value: String(linked.length) },
            { label: "Opened", value: formatDate(transfer.created_at) },
            { label: "Last updated", value: formatDate(transfer.updated_at) },
          ]}
        />
      </Card>

      <Card padding="none">
        <div className="px-5 py-4 border-b border-line">
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">
            Matters in this transfer · {linked.length}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-raised">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Matter</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden md:table-cell">Phase</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden lg:table-cell">Stage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {linked.map((m) => {
                const pl = getPipeline(m.services?.code, m.municipality, m.service_subtype);
                return (
                  <tr key={m.id} className="hover:bg-raised transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/partner/matters/${m.id}`} className="font-medium text-ink hover:text-action hover:underline">
                        {m.title || "Untitled"}
                      </Link>
                      {m.services?.name && <p className="text-xs text-ink-3 mt-0.5">{m.services.name}</p>}
                    </td>
                    <td className="px-5 py-3 text-ink-2 hidden md:table-cell">
                      {m.current_phase ? (pl ? phaseLabel(pl, m.current_phase, true) : m.current_phase) : "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-3 hidden lg:table-cell">
                      {pl
                        ? m.current_stage
                          ? isStageClientVisible(pl, m.current_stage)
                            ? stageLabel(pl, m.current_stage)
                            : "In progress"
                          : "—"
                        : m.current_stage || "—"}
                    </td>
                    <td className="px-5 py-3">
                      {m.status && (
                        <StatusPill
                          tone={
                            ({ new: "waiting", open: "action", on_hold: "waiting", won: "ok", lost: "danger", archived: "neutral" } as Record<string, StatusTone>)[
                              m.status
                            ] ?? "neutral"
                          }
                        >
                          {MATTER_STATUS_LABELS[m.status]}
                        </StatusPill>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/partner/matters/${m.id}`} className="text-xs font-semibold text-action hover:underline">View</Link>
                    </td>
                  </tr>
                );
              })}
              {linked.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-ink-3">
                    No matters linked yet. Refer a matter, then attach it here to build up the transaction.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* The firm attaches its own referred matters (Meeting 2). Server route
            re-checks both matter and transfer belong to this firm. */}
        <div className="px-5 py-4 border-t border-line">
          <LinkMatterControl transferId={id} candidates={candidates} endpoint="/api/partner/transfers/link" />
        </div>
      </Card>

      {/* Read-only: the firm sees the property's documents, staff maintain them. */}
      <TransferDocuments transferId={id} docs={transferDocsWithUrls} canManage={false} />

      {/* …but the firm DOES post to the feed — it is the shared channel. */}
      <TransferFeed transferId={id} activities={feed} canPost />
    </div>
  );
}
