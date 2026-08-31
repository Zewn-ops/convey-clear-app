import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import LinkMatterControl from "@/components/transfers/LinkMatterControl";
import UnlinkMatterButton from "@/components/transfers/UnlinkMatterButton";
import TransferParties, { type PartyRow as TPartyRow, type PartyOption, type FirmContact } from "@/components/transfers/TransferParties";
import {
  TRANSFER_PARTY_SELECT,
  mapTransferParties,
  type RawTransferParty,
} from "@/lib/transfer-parties";
import DetailFields from "@/components/ui/DetailFields";
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
import TransferPropertyCard, { type LinkedProperty, type PropertyOption } from "@/components/transfers/TransferPropertyCard";
import TransferFeed, { type TransferActivity } from "@/components/transfers/TransferFeed";
import TransferServices, { type ServiceRow } from "@/components/transfers/TransferServices";
import TransferProgressBar from "@/components/transfers/TransferProgressBar";
import {
  serviceProgress,
  transferProgress,
  LINKED_MATTER_SELECT,
  type LinkedMatterShape,
} from "@/lib/transfer-service-progress";
import RequestHandover, { type HandoverRequest } from "@/components/transfers/RequestHandover";
import CreateMatterForm from "@/components/admin/CreateMatterForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrls } from "@/lib/storage";
import { ArrowLeft, Pencil, Plus, Scale } from "lucide-react";

export const dynamic = "force-dynamic";

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s];
}
function matterStatusVariant(s: string): "info" | "success" | "danger" | "warning" | "gray" {
  return ({ new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[
    s as MatterStatus
  ] ?? "gray";
}

type FirmRef = { name: string | null } | null;
type ClientRef = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
} | null;

// PostgREST needs the FK constraint name to disambiguate: property_transfers has
// TWO foreign keys into firms (attorney + estate agent) and TWO into
// clients (seller + buyer).
type TransferDetail = PropertyTransfer & {
  attorney?: FirmRef;
  estate_agent?: FirmRef;
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
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-ink mt-0.5">
        {href ? (
          <Link href={href} className="text-action hover:underline">{value}</Link>
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
      "*, attorney:firms!property_transfers_business_partner_id_fkey(name), estate_agent:firms!property_transfers_estate_agent_partner_id_fkey(name), seller:clients!property_transfers_seller_client_id_fkey(id, full_name, first_name, last_name, business_name), buyer:clients!property_transfers_buyer_client_id_fkey(id, full_name, first_name, last_name, business_name)"
    )
    .eq("id", id)
    .maybeSingle();

  const transfer = transferData as TransferDetail | null;
  if (!transfer) notFound();

  // Matters under this transfer + the pool of matters free to attach + what the
  // "create a matter in here" form needs (services, clients).
  const [
    { data: linkedData },
    { data: freeData },
    { data: servicesData },
    { data: clientsData },
    { data: serviceItems },
    { data: originRequest },
  ] = await Promise.all([
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
    // The umbrella checklist (063). Both levels in one read — the tree is small
    // and bounded, so the component splits it rather than paying two queries.
    supabase
      .from("transfer_services")
      .select("id, parent_id, service_code, label, status, third_party, notes, matter_id, position, "
        + "prc_subtype, rates_scope, "
        + LINKED_MATTER_SELECT)
      .eq("transfer_id", id)
      .order("position", { ascending: true }),
    // The request this transfer was created from, if any. Approving sets
    // transfer_id, so the attorney's typed seller/buyer details survive — they
    // were simply never shown anywhere after approval (065).
    supabase
      .from("transfer_requests")
      // The requester relation is named explicitly: transfer_requests has TWO
      // FKs to users (requested_by and reviewed_by), so an unqualified
      // users(...) is ambiguous and PostgREST refuses it.
      .select(
        "id, suggested_reference, property_description, seller_name, seller_email, seller_cell, buyer_name, buyer_email, buyer_cell, notes, created_at, details_dismissed_at, firms(name), requester:users!transfer_requests_requested_by_fkey(full_name, email, phone)"
      )
      .eq("transfer_id", id)
      .maybeSingle(),
  ]);

  const linked = (linkedData as LinkedMatter[] | null) ?? [];
  const candidates = ((freeData as { id: string; title: string | null; municipality: string | null }[] | null) ?? []).map(
    (m) => ({ id: m.id, label: m.title || `Untitled matter (${municipalityLabel(m.municipality)})` })
  );

  // Parties live in transfer_parties (050). The four legacy FK columns on
  // property_transfers are still populated and still read below, so this card
  // and the legacy seller/buyer picker agree until those reads are retired.
  const { data: partyRows } = await supabase
    .from("transfer_parties")
    .select(TRANSFER_PARTY_SELECT)
    .eq("transfer_id", id)
    .order("role", { ascending: true });

  // Staff surface: parties link out to their client record and the card carries
  // ID numbers.
  const partyList: TPartyRow[] = mapTransferParties(
    partyRows as RawTransferParty[] | null,
    { linkClients: true }
  );

  const [{ data: entityOpts }, { data: firmOpts }, { data: firmPeople }] = await Promise.all([
    supabase.from("clients").select("id, full_name, business_name, entity_type")
      .order("created_at", { ascending: false }).limit(300),
    supabase.from("firms").select("id, name, partner_type").eq("active", true)
      .order("name", { ascending: true }).limit(200),
    // The firms' own people, for "who at the firm is handling this" (059).
    // Attorney firms have portal users; estate agencies do not, which is why
    // the picker falls back to a typed name rather than assuming a list.
    supabase.from("users").select("id, full_name, email, business_partner_id")
      .not("business_partner_id", "is", null).eq("active", true)
      .order("full_name", { ascending: true }).limit(500),
  ]);
  const entityOptions: PartyOption[] = ((entityOpts as { id: string; full_name: string | null; business_name: string | null; entity_type: string }[] | null) ?? []).map((c) => ({
    id: c.id,
    name: c.business_name?.trim() || c.full_name?.trim() || "Unnamed",
    kind: c.entity_type.replace("_", " "),
  }));
  const firmOptions: PartyOption[] = ((firmOpts as { id: string; name: string; partner_type: string | null }[] | null) ?? []).map((f) => ({
    id: f.id, name: f.name, kind: (f.partner_type ?? "firm").replace("_", " "),
  }));
  const firmContacts: FirmContact[] = ((firmPeople as { id: string; full_name: string | null; email: string; business_partner_id: string }[] | null) ?? []).map((u) => ({
    id: u.id,
    firmId: u.business_partner_id,
    name: u.full_name?.trim() || u.email,
  }));

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

  // FICA-vault documents belonging to the parties ON this transfer, for the
  // staff-only pull (054). Meeting 2 parked the automatic vault→transfer feed;
  // this is the deliberate manual replacement, and it is offered here only —
  // this page is staff-gated at the top, and the route re-checks the role.
  //
  // Scoped to THIS transfer's parties rather than every client in the system:
  // the picker is for "attach the seller's certified ID", not for browsing
  // vaults. Superseded documents are excluded so a stale ID cannot be attached.
  const partyClientIds = Array.from(
    new Set(
      ((partyRows as RawTransferParty[] | null) ?? [])
        .map((p) => p.client_id)
        .filter((cid): cid is string => !!cid)
    )
  );
  const alreadyPulled = new Set(
    transferDocs.map((d) => (d as TransferDocument & { client_document_id?: string | null }).client_document_id).filter(Boolean)
  );
  const { data: vaultRows } = partyClientIds.length
    ? await supabase
        .from("client_documents")
        .select("id, client_id, document_type, file_name, status, clients(full_name, business_name)")
        .in("client_id", partyClientIds)
        .eq("status", "current")
        .order("created_at", { ascending: false })
    : { data: [] };
  const vaultOptions = (
    (vaultRows as
      | {
          id: string;
          client_id: string;
          document_type: string | null;
          file_name: string | null;
          clients?: { full_name: string | null; business_name: string | null } | null;
        }[]
      | null) ?? []
  )
    .filter((v) => !alreadyPulled.has(v.id))
    .map((v) => ({
      id: v.id,
      fileName: v.file_name,
      documentType: v.document_type,
      ownerName:
        v.clients?.business_name?.trim() || v.clients?.full_name?.trim() || "Unnamed client",
      // Group by the role they play in THIS transaction, not just their name:
      // "Thabo Molefe · seller" is the thing staff are looking for when they are
      // deciding whether a document belongs on the transfer.
      ownerRole:
        partyList.find((pt) => pt.clientId === v.client_id)?.role ?? null,
    }));

  // The property this transfer is about (056). Fetched separately from the
  // transfer row so the picker can be offered even when nothing is linked.
  const { data: linkedPropertyRow } = transfer.property_id
    ? await supabase
        .from("properties")
        .select("id, label, erf_number, rates_account_no, address")
        .eq("id", transfer.property_id)
        .maybeSingle()
    : { data: null };
  const linkedProperty = (linkedPropertyRow as LinkedProperty | null) ?? null;

  const { data: propertyOptionRows } = linkedProperty
    ? { data: [] }
    : await supabase
        .from("properties")
        .select("id, label, erf_number, suburb")
        .order("created_at", { ascending: false })
        .limit(200);
  const propertyOptions: PropertyOption[] = (
    (propertyOptionRows as { id: string; label: string; erf_number: string | null; suburb: string | null }[] | null) ?? []
  ).map((p) => ({
    id: p.id,
    label: p.label,
    detail: [p.erf_number ? `Erf ${p.erf_number}` : null, p.suburb].filter(Boolean).join(" · ") || null,
  }));

  // The transaction's own feed (035).
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
    progress: serviceProgress(r.status, r.matters ?? null, "staff", Boolean(r.matter_id)),
    matterTitle: r.matters?.title ?? null,
  }));
  const transferRollup = transferProgress(serviceRows);

  // Matters on this transfer that no service line is tracking. See the note on
  // the card below for why these have to be shown somewhere.
  const trackedMatterIds = new Set(
    serviceRows.map((r) => r.matter_id).filter((v): v is string => Boolean(v))
  );
  const unlistedMatters = linked.filter((m) => !trackedMatterIds.has(m.id));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/admin/property-transfers" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4">
          <ArrowLeft className="h-4 w-4" /> All property transfers
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-action">{transfer.reference}</h1>
            <p className="text-sm text-ink-3 mt-1">
              {transfer.property_description || "No property description"}
              {transfer.municipality ? ` · ${municipalityLabel(transfer.municipality)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge label={TRANSFER_STATUS_LABELS[transfer.status]} variant={statusVariant(transfer.status)} />
            <Link
              href={`/admin/property-transfers/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-raised"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </div>
        </div>
      </div>

      {/* Parties to the transaction — transfer_parties (050) */}
      <Card>
        <TransferParties
          transferId={id}
          parties={partyList}
          entities={entityOptions}
          firms={firmOptions}
          firmContacts={firmContacts}
          canEdit
          clientHrefBase="/admin/clients"
          showIdNumbers
        />
        {!transfer.business_partner_id && (
          <div className="mt-4 rounded-lg bg-waiting-tint px-3.5 py-3 ring-1 ring-inset ring-waiting/20">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-waiting">
              No attorney firm set
            </p>
            <p className="mt-1 text-[13px] text-ink-2">
              No partner can see this transfer until a firm is set on the Edit screen. Adding a
              conveyancing attorney here records the role; it does not grant the firm access.
            </p>
          </div>
        )}
      </Card>

      {/* Facts. Showed three fields and stopped — the reference, the property and
          the attorney firm all lived only in the page header or behind Edit. */}
      <Card accent="service">
        <DetailFields
          primary={[
            { label: "Status", value: TRANSFER_STATUS_LABELS[transfer.status] },
            { label: "Council", value: municipalityLabel(transfer.municipality) },
            { label: "Attorney firm", value: transfer.attorney?.name ?? null, required: true },
            { label: "Reference", value: transfer.reference },
            { label: "Property", value: transfer.property_description, wide: true },
          ]}
          extra={[
            { label: "Estate agency", value: transfer.estate_agent?.name ?? null },
            { label: "Matters linked", value: String(linked.length) },
            { label: "Opened", value: formatDate(transfer.created_at) },
            { label: "Last updated", value: formatDate(transfer.updated_at) },
            { label: "Notes", value: transfer.notes, wide: true },
          ]}
        />
      </Card>

      {/* The attorney's original request (065) — "a new container just below
          parties that gives us that info ... and we have the option to dismiss it
          once we have used those details to capture the parties". */}
      {originRequest && <RequestHandover request={originRequest as unknown as HandoverRequest} />}

      {/* The umbrella (063). Sits ABOVE the matters table on purpose: this is
          the plan for the transaction — which of the six services this property
          needs — and the table below is the work that has actually been opened
          against it. Plan first, then progress. */}
      <Card accent="service" padding="none">
        <div className="px-5 py-4 border-b border-line">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Services in this transfer</p>
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
          canManage
          municipality={transfer.municipality}
        />
      </Card>

      {/* ── Matters NOT represented on the checklist ───────────────────────
          Zewn, 2026-08-28: "i think we can remove the matters in this transfer
          block now, its been replaced by the services tab no?"

          Mostly yes. As a PROGRESS display it is fully replaced — phase, stage
          and status are all said better by the service lines' circles and bars,
          so those columns are gone.

          🔴 BUT IT CANNOT SIMPLY BE DELETED, because a service line tracks at
          most ONE matter. api/admin/matters puts it plainly: "a transfer can
          legitimately carry two matters of the same service (a rates clearance
          re-run after a failed one), and the first is the one the checklist is
          tracking". The second matter sets matters.transfer_id and attaches to
          no line — delete this block and it is still on the transfer while
          being invisible on it.

          So the block now shows ONLY what the checklist cannot: matters with no
          service line pointing at them. On an ordinary transfer that is none,
          and the whole card disappears — which is the clean page he was after,
          without losing the exception.

          ▶ REVISIT (noted in RESUME_HERE §3.5): the real fix is to let a
          service line hold more than one matter, or to let one be linked to a
          line from the line itself. Both are bigger than this, and both would
          let this card go entirely. */}
      {unlistedMatters.length > 0 && (
        <Card accent="service" padding="none">
          <div className="border-b border-line px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Other matters on this transaction · {unlistedMatters.length}
            </p>
            <p className="mt-1 text-xs text-ink-3">
              Attached to the transfer but not tracked by a service above — a repeat of a
              service already listed, or one linked by hand.
            </p>
          </div>
          <ul className="divide-y divide-line">
            {unlistedMatters.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/matters/${m.id}`}
                    className="font-medium text-ink hover:text-action hover:underline"
                  >
                    {m.title || "Untitled"}
                  </Link>
                  {m.services?.name && <p className="mt-0.5 text-xs text-ink-3">{m.services.name}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.status && (
                    <Badge label={MATTER_STATUS_LABELS[m.status]} variant={matterStatusVariant(m.status)} />
                  )}
                  <UnlinkMatterButton matterId={m.id} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Creating and linking stay, but as ACTIONS rather than as a table.
          Jukka, meeting 1: "we want to move away from linking matters and
          instead create matters within the property transfer immediately" — so
          creating is first. Linking an existing matter stays because a PRC
          opened months before anyone knew it belonged to this transaction still
          has to be attachable, and no service line offers that today.

          Native <details>: this is a server component, and a disclosure needs
          no JavaScript to be one. */}
      <Card padding="none">
        <div className="space-y-4 px-5 py-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-action hover:underline">
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

          <div className="border-t border-line pt-4">
            <LinkMatterControl transferId={id} candidates={candidates} />
          </div>
        </div>
      </Card>

      {/* What this transfer is about (056). Always rendered, linked or not —
          a card that only appears when populated cannot say it is empty. */}
      <TransferPropertyCard transferId={id} linked={linkedProperty} options={propertyOptions} />

      {/* Documents about the property itself — reused by every matter above
          instead of being fetched once per matter (migration 034). */}
      {/* nameSubject mirrors resolveTransferSubject() exactly, so the name
          previewed in the upload panel is the name the server stores. */}
      <TransferDocuments
        transferId={id}
        docs={transferDocsWithUrls}
        canManage
        canDelete={isAdminRole(session.profile?.role)}
        vaultOptions={vaultOptions}
        sellerName={transfer.seller ? clientDisplayName(transfer.seller) : null}
        buyerName={transfer.buyer ? clientDisplayName(transfer.buyer) : null}
        nameSubject={transfer.property_description || transfer.reference}
        municipality={transfer.municipality}
      />

      {/* The transaction's history + conversation, shared with the owning firm. */}
      <TransferFeed
        transferId={id}
        activities={feed}
        canPost
        viewerSide="conveyclear"
        firmName={transfer.attorney?.name ?? null}
      />
    </div>
  );
}
