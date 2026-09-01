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
import { formatDate, municipalityLabel, formatRands } from "@/lib/utils";
import {
  clientDisplayName,
  TRANSFER_STATUS_LABELS,
  type Matter,
  type MatterStatus,
  type PropertyTransfer,
  type TransferStatus,
  type TransferDocument,
} from "@/types";
import TransferDocuments from "@/components/transfers/TransferDocuments";
import TransferServices, { type ServiceRow } from "@/components/transfers/TransferServices";
import TransferProgressBar from "@/components/transfers/TransferProgressBar";
import {
  serviceProgress,
  transferProgress,
  LINKED_MATTER_SELECT,
  type LinkedMatterShape,
} from "@/lib/transfer-service-progress";
import TransferFeed, { type TransferActivity } from "@/components/transfers/TransferFeed";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrls } from "@/lib/storage";
import { DOC_UPLOADING_FIRM_TYPES } from "@/lib/transfer-upload-access";
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

type MemberRef = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

/**
 * The designated ConveyClear member (077), as a name for the fourth block.
 *
 * The firm sees who at ConveyClear is on this — the question an attorney asks
 * before picking up the phone, and one the portal could not answer at all.
 *
 * 🔒 Read with the SERVICE ROLE, and it has to be. `users` carries one SELECT
 * policy, 006's `users_self_read` (`auth_user_id = auth.uid() OR
 * app_is_staff()`), so a PostgREST embed off property_transfers comes back null
 * for every partner — the block read "Nobody assigned yet" on every transfer,
 * forever, which is the exact opposite of the point. Caught in review
 * 2026-08-31.
 *
 * Scoped to the one id already on a transfer this firm can see, and returns a
 * NAME and nothing else. Email is the last resort rather than a display choice,
 * so a member with no name recorded still reads as somebody.
 */
async function designatedMemberOf(
  memberId: string | null
): Promise<{ id: string; name: string } | null> {
  if (!memberId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("id, full_name, first_name, last_name, email")
    .eq("id", memberId)
    .maybeSingle();
  const m = data as MemberRef | null;
  if (!m) return null;
  return {
    id: m.id,
    name:
      m.full_name ||
      [m.first_name, m.last_name].filter(Boolean).join(" ") ||
      m.email ||
      "ConveyClear member",
  };
}

type TransferDetail = PropertyTransfer & {
  seller?: ClientRef;
  buyer?: ClientRef;
  // The owning firm — i.e. the viewer's own firm here, used to name their
  // side of the transfer conversation.
  attorney?: { name: string | null } | null;
};

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
      "*, attorney:firms!property_transfers_business_partner_id_fkey(name), seller:clients!property_transfers_seller_client_id_fkey(id, full_name, first_name, last_name, business_name), buyer:clients!property_transfers_buyer_client_id_fkey(id, full_name, first_name, last_name, business_name)"
    )
    .eq("id", id)
    .maybeSingle();

  const transfer = transferData as TransferDetail | null;
  if (!transfer) notFound();

  // Resolved separately rather than embedded — see designatedMemberOf().
  const designatedMember = await designatedMemberOf(transfer.designated_member_id);

  // §112 — only attorney firms author transfer documents; an estate agency on the
  // same transfer reads them. Mirrors DOC_UPLOADING_FIRM_TYPES in
  // lib/transfer-upload-access.ts, which is what actually enforces it. Hiding a
  // control is presentation; the route is the permission.
  const { data: myProfile } = await supabase
    .from("users")
    .select("business_partner_id")
    .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  const myFirmId = (myProfile as { business_partner_id: string | null } | null)?.business_partner_id ?? null;
  const { data: myFirm } = myFirmId
    ? await supabase.from("firms").select("partner_type").eq("id", myFirmId).maybeSingle()
    : { data: null };
  const firmMayUpload = DOC_UPLOADING_FIRM_TYPES.includes(
    ((myFirm as { partner_type?: string } | null)?.partner_type ?? "") as (typeof DOC_UPLOADING_FIRM_TYPES)[number]
  );

  // 071 — may this firm mark which services it needs?
  //
  // The same firm-type set as uploading, and deliberately the same constant
  // rather than a second identical list: `business_partner` covers law firms AND
  // estate agencies (059, §112), Zewn's note said "attorneys", and two lists
  // that must agree are two lists that eventually will not. If agencies should
  // ever mark services, that is a deliberate widening and the constant is where
  // it happens, once.
  //
  // ⚠️ Role gate only. RLS (transfer_services_partner_mark) still decides whether
  // it is THIS transfer, and 071's trigger decides what may change on the row.
  const firmMayMarkServices = firmMayUpload;

  // Parties (050). RLS on transfer_parties routes through can_access_transfer,
  // so these rows exist only for transfers this firm already works.
  const { data: partyRows } = await supabase
    .from("transfer_parties")
    .select(TRANSFER_PARTY_SELECT)
    .eq("transfer_id", id)
    .order("role", { ascending: true });

  // The umbrella checklist (063). Same RLS route as the parties above.
  const { data: serviceItems } = await supabase
    .from("transfer_services")
    .select("id, parent_id, service_code, label, status, third_party, notes, matter_id, position, "
        + "prc_subtype, rates_scope, "
        + LINKED_MATTER_SELECT)
    .eq("transfer_id", id)
    .order("position", { ascending: true });

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

  // Progress is the linked matter's, derived here so the pipeline definitions
  // stay out of the client bundle.
  const serviceRows: ServiceRow[] = (
    (serviceItems as unknown as (ServiceRow & { matters?: LinkedMatterShape | null })[] | null) ?? []
  ).map((r) => ({
    ...r,
    progress: serviceProgress(r.status, r.matters ?? null, "client", Boolean(r.matter_id)),
    matterTitle: r.matters?.title ?? null,
  }));
  const transferRollup = transferProgress(serviceRows);

  // Matters on this transfer that no service line is tracking — the only thing
  // the checklist above cannot show. Same derivation as the admin page, so the
  // two portals cannot disagree about what counts as an exception.
  const trackedMatterIds = new Set(
    serviceRows.map((r) => r.matter_id).filter((v): v is string => Boolean(v))
  );
  const unlistedMatters = linked.filter((m) => !trackedMatterIds.has(m.id));

  return (
    // Width: was `max-w-4xl mx-auto`. See the note on the admin page — the
    // client portal never capped this and that is the difference Zewn saw.
    <div className="space-y-6">
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

      {/* Two columns, in the admin page's order and for the same reasons: work
          on the left (parties, services, documents), reference detail on the
          right. §5.13 exists because these two portals drift apart when only one
          is edited — so they are restructured together. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <TransferParties
              transferId={id}
              parties={partyList}
              entities={entityOptions}
              firms={firmOptions}
              canEdit
              designatedMember={designatedMember}
            />
          </Card>

          {/* The umbrella (063), READ-ONLY here. Meeting §110 makes the transfer
              the primary view for attorneys, so the firm sees the plan for the
              transaction — but §122 has the markers set by ConveyClear, because
              they decide what work we do. A firm marking its own clearance
              "already done" would be telling us what to skip. Hence canManage is
              not passed.

              As on the admin page, this is now the ONLY place matters appear.
              The "Other matters on this transaction" card and the "Link a
              matter" control below it are both gone (2026-09-01) — untracked
              matters are listed under the service line they belong to. */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Services in this transfer</p>
                {/* The roll-up sits with the checklist it is derived from, so the
                    number and the lines that produce it are read together. */}
                {transferRollup.total > 0 && (
                  <div className="w-full sm:w-56">
                    <TransferProgressBar progress={transferRollup} />
                  </div>
                )}
              </div>
            </div>
            <TransferServices
              transferId={id}
              rows={serviceRows}
              canMark={firmMayMarkServices}
              matterHrefBase="/partner/matters"
              municipality={transfer.municipality}
              // Read-only for the firm: the adopt control is staff-gated inside
              // the component (canManage), so passing the list here only makes
              // the untracked matters visible, which is what the deleted card
              // did.
              linkableMatters={unlistedMatters.map((m) => ({
                id: m.id,
                title: m.title,
                serviceName: m.services?.name ?? null,
                serviceCode: m.services?.code ?? null,
                status: m.status ?? null,
              }))}
            />
          </Card>

          {/* The firm uploads (attorney firms only, §112) but does not manage:
              staff approve, share and archive. The route enforces both halves —
              this only decides whether to draw the control.
              nameSubject mirrors resolveTransferSubject() exactly, so the name
              previewed in the upload panel is the name the server stores. */}
          <TransferDocuments
            transferId={id}
            docs={transferDocsWithUrls}
            canManage={false}
            canUpload={firmMayUpload}
            sellerName={transfer.seller ? clientDisplayName(transfer.seller) : null}
            buyerName={transfer.buyer ? clientDisplayName(transfer.buyer) : null}
            nameSubject={transfer.property_description || transfer.reference}
            municipality={transfer.municipality}
          />
        </div>

        <div className="min-w-0 space-y-6">
          {/* Same two-tier card as the admin side. `notes` is deliberately NOT
              here: it is ConveyClear's internal working note on the transaction,
              and the admin card is the only place it belongs. */}
          <Card>
            <p className="mb-4 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">Transaction</p>
            <DetailFields
              primary={[
                { label: "Reference", value: transfer.reference },
                { label: "Status", value: TRANSFER_STATUS_LABELS[transfer.status] },
                { label: "Council", value: municipalityLabel(transfer.municipality) },
                // 077 — visible to the firm as well as staff. Zewn: "the sale price
                // can be available to all, its just one number which is purchase
                // price."
                { label: "Purchase price", value: formatRands(transfer.purchase_price) },
                { label: "Property", value: transfer.property_description, wide: true },
              ]}
              extra={[
                { label: "Matters linked", value: String(linked.length) },
                { label: "Opened", value: formatDate(transfer.created_at) },
                { label: "Last updated", value: formatDate(transfer.updated_at) },
              ]}
            />
          </Card>
        </div>
      </div>

      {/* …but the firm DOES post to the feed — it is the shared channel.
          Full width: a thread in a third of the page wraps every line to
          nothing. */}
      <TransferFeed
        transferId={id}
        activities={feed}
        canPost
        viewerSide="firm"
        firmName={transfer.attorney?.name ?? null}
      />
    </div>
  );
}
