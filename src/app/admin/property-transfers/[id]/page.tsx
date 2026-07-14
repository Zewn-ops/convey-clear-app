import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import LinkMatterControl from "@/components/transfers/LinkMatterControl";
import UnlinkMatterButton from "@/components/transfers/UnlinkMatterButton";
import { getPipeline, phaseLabel, stageLabel } from "@/lib/pipelines";
import { formatDate, municipalityLabel } from "@/lib/utils";
import {
  isStaffRole,
  isAdminRole,
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
import CreateMatterForm from "@/components/admin/CreateMatterForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrls } from "@/lib/storage";
import { ArrowLeft, Pencil, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s];
}
function matterStatusVariant(s: string): "info" | "success" | "danger" | "warning" | "gray" {
  return ({ new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[
    s as MatterStatus
  ] ?? "gray";
}

type Firm = { name: string | null } | null;
type ClientRef = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
} | null;

// PostgREST needs the FK constraint name to disambiguate: property_transfers has
// TWO foreign keys into business_partners (attorney + estate agent) and TWO into
// clients (seller + buyer).
type TransferDetail = PropertyTransfer & {
  attorney?: Firm;
  estate_agent?: Firm;
  seller?: ClientRef;
  buyer?: ClientRef;
};

type LinkedMatter = Matter & {
  service_subtype?: string | null;
  services?: { code: string | null; name: string | null } | null;
};

function PartyRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800 mt-0.5">
        {href ? (
          <Link href={href} className="text-[#1B2E6B] hover:underline">{value}</Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export default async function AdminTransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();

  const { data: transferData } = await supabase
    .from("property_transfers")
    .select(
      "*, attorney:business_partners!property_transfers_business_partner_id_fkey(name), estate_agent:business_partners!property_transfers_estate_agent_partner_id_fkey(name), seller:clients!property_transfers_seller_client_id_fkey(id, full_name, first_name, last_name, business_name), buyer:clients!property_transfers_buyer_client_id_fkey(id, full_name, first_name, last_name, business_name)"
    )
    .eq("id", id)
    .maybeSingle();

  const transfer = transferData as TransferDetail | null;
  if (!transfer) notFound();

  // Matters under this transfer + the pool of matters free to attach + what the
  // "create a matter in here" form needs (services, clients).
  const [{ data: linkedData }, { data: freeData }, { data: servicesData }, { data: clientsData }] = await Promise.all([
    supabase
      .from("matters")
      .select("id, title, current_phase, current_stage, status, municipality, service_subtype, created_at, services(code, name)")
      .eq("transfer_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("matters")
      .select("id, title, municipality, created_at")
      .is("transfer_id", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("services").select("id, code, name").order("name"),
    supabase
      .from("clients")
      .select("id, full_name, business_name")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const linked = (linkedData as LinkedMatter[] | null) ?? [];
  const candidates = ((freeData as { id: string; title: string | null; municipality: string | null }[] | null) ?? []).map(
    (m) => ({ id: m.id, label: m.title || `Untitled matter (${municipalityLabel(m.municipality)})` })
  );

  // The transaction's own seller/buyer, offered first when creating a matter in
  // here — on a transfer the matter is nearly always for one of these two.
  const transferParties = [
    transfer.seller ? { id: transfer.seller.id, label: clientDisplayName(transfer.seller), role: "Seller" } : null,
    transfer.buyer ? { id: transfer.buyer.id, label: clientDisplayName(transfer.buyer), role: "Buyer" } : null,
  ].filter((p): p is { id: string; label: string; role: string } => p !== null);

  // Transfer-level documents (migration 034) + how many matters already reuse
  // each one — that count is what tells staff a document is load-bearing before
  // they try to delete it.
  const { data: tdocData } = await supabase
    .from("transfer_documents")
    .select("*")
    .eq("transfer_id", id)
    .neq("status", "superseded")
    .order("created_at", { ascending: false });

  const transferDocs = (tdocData as TransferDocument[] | null) ?? [];
  const admin = createAdminClient();
  const tdocUrls = transferDocs.length > 0 ? await signedDocUrls(admin, transferDocs) : {};

  const { data: usageRows } = transferDocs.length
    ? await admin
        .from("documents")
        .select("transfer_document_id")
        .in("transfer_document_id", transferDocs.map((d) => d.id))
    : { data: [] };
  const usage: Record<string, number> = {};
  for (const r of (usageRows as { transfer_document_id: string }[] | null) ?? []) {
    usage[r.transfer_document_id] = (usage[r.transfer_document_id] ?? 0) + 1;
  }

  const transferDocsWithUrls = transferDocs.map((d) => ({
    ...d,
    url: d.storage_path ? tdocUrls[d.storage_path] : undefined,
    usedOn: usage[d.id] ?? 0,
  }));

  // The transaction's own feed (035).
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
        <Link href="/admin/property-transfers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
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
          <div className="flex items-center gap-2 shrink-0">
            <Badge label={TRANSFER_STATUS_LABELS[transfer.status]} variant={statusVariant(transfer.status)} />
            <Link
              href={`/admin/property-transfers/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </div>
        </div>
      </div>

      {/* Parties to the transaction */}
      <Card>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Parties</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <PartyRow label="Conveyancing attorney" value={transfer.attorney?.name ?? "—"} />
          <PartyRow label="Estate agent" value={transfer.estate_agent?.name ?? "—"} />
          <PartyRow
            label="Seller"
            value={transfer.seller ? clientDisplayName(transfer.seller) : "—"}
            href={transfer.seller ? `/admin/clients/${transfer.seller.id}` : undefined}
          />
          <PartyRow
            label="Buyer"
            value={transfer.buyer ? clientDisplayName(transfer.buyer) : "—"}
            href={transfer.buyer ? `/admin/clients/${transfer.buyer.id}` : undefined}
          />
        </dl>
        {!transfer.business_partner_id && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
            No attorney firm is set, so no partner can see this transfer. Set one on the Edit screen to give the firm access.
          </p>
        )}
      </Card>

      {/* Facts */}
      <Card>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-gray-400">Status</dt>
            <dd className="text-gray-800 mt-0.5">{TRANSFER_STATUS_LABELS[transfer.status]}</dd>
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
        {transfer.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <dt className="text-xs text-gray-400 mb-1">Notes</dt>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{transfer.notes}</p>
          </div>
        )}
      </Card>

      {/* Linked matters — the point of the hub */}
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
                const pipeline = getPipeline(m.services?.code, m.municipality, m.service_subtype);
                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/admin/matters/${m.id}`} className="font-medium text-gray-900 hover:text-[#E8521A] hover:underline">
                        {m.title || "Untitled"}
                      </Link>
                      {m.services?.name && <p className="text-xs text-gray-400 mt-0.5">{m.services.name}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden md:table-cell">
                      {m.current_phase ? (pipeline ? phaseLabel(pipeline, m.current_phase) : m.current_phase) : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">
                      {pipeline ? (m.current_stage ? stageLabel(pipeline, m.current_stage) : "—") : m.current_stage || "—"}
                    </td>
                    <td className="px-5 py-3">
                      {m.status && <Badge label={MATTER_STATUS_LABELS[m.status]} variant={matterStatusVariant(m.status)} />}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <UnlinkMatterButton matterId={m.id} />
                    </td>
                  </tr>
                );
              })}
              {linked.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                    No matters linked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Create a matter INSIDE the transfer (Jukka, meeting 1: "we want to move
            away from linking matters and instead create matters within the property
            transfer immediately"). Linking an existing matter stays — a PRC opened
            months before anyone knew it was part of this transaction still has to
            be attachable — but creating is now the primary path, so it is first.

            Native <details>: this is a server component, and a disclosure needs no
            JavaScript to be a disclosure. */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[#E8521A] hover:underline">
              <Plus className="h-4 w-4" /> Create a matter in this transfer
            </summary>
            <div className="mt-3">
              <CreateMatterForm
                services={(servicesData as { id: string; code: string; name: string }[] | null) ?? []}
                clients={(clientsData as { id: string; full_name: string | null; business_name: string | null }[] | null) ?? []}
                transfer={{
                  id,
                  reference: transfer.reference,
                  municipality: transfer.municipality,
                  property_description: transfer.property_description,
                  parties: transferParties,
                }}
              />
            </div>
          </details>

          <div className="border-t border-gray-100 pt-4">
            <LinkMatterControl transferId={id} candidates={candidates} />
          </div>
        </div>
      </Card>

      {/* Documents about the property itself — reused by every matter above
          instead of being fetched once per matter (migration 034). */}
      <TransferDocuments
        transferId={id}
        docs={transferDocsWithUrls}
        canManage
        canDelete={isAdminRole(session.profile?.role)}
      />

      {/* The transaction's history + conversation, shared with the owning firm. */}
      <TransferFeed transferId={id} activities={feed} canPost />
    </div>
  );
}
