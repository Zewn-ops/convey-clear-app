import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import Callout from "@/components/ui/Callout";
import { workdaysSince } from "@/lib/elapsed";
import PartiesCard from "@/components/matters/PartiesCard";
import MatterTransferCard, { type LinkedTransfer } from "@/components/matters/MatterTransferCard";
import MatterFeed, { type MatterActivity } from "@/components/matters/MatterFeed";
import ExpectedDocuments from "@/components/transfers/ExpectedDocuments";
import { getMatterEnquiries } from "@/lib/enquiries";
import PipelineProgress from "@/components/matters/PipelineProgress";
import MatterUploadPanel from "@/components/matters/MatterUploadPanel";
import InPlaceIntake from "@/components/matters/InPlaceIntake";
import InPlaceFica from "@/components/matters/InPlaceFica";
import { buildFicaSubjects } from "@/lib/fica";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrls } from "@/lib/storage";
import { getPipeline } from "@/lib/pipelines";
import { resolveDocClass, type PartyRole } from "@/lib/doc-classes";
import { DOC_CLASSES, DOC_CLASS_LABELS, DOC_CLASS_HINTS } from "@/lib/councils";
import { formatDate, municipalityLabel } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  type Client,
  type TransferDocument,
  type Matter,
  type MatterStatus,
  type MatterDocument,
  type MatterParty,
  type ClientDocument,
} from "@/types";
import { ArrowLeft, FileText } from "lucide-react";

/**
 * The record's own name in the tab.
 *
 * Every detail page fell through to the ROOT metadata, so an ADMIN looking at a
 * property transfer had a tab reading "ConveyClear -- Client Portal" (found
 * 2026-09-02). Staff keep several of these open at once; a tab that names the
 * portal rather than the record cannot be told from its neighbours.
 */
export const metadata = { title: "Matter \u2014 ConveyClear Partner" };

export default async function PartnerMatterDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: matterData } = await supabase
    .from("matters")
    .select("id, title, current_phase, current_stage, status, municipality, service_subtype, service_data, partner_file_ref, service_notes, deadline, transfer_id, property_description, created_at, clients(id, entity_type, full_name, business_name, primary_email, primary_cell), services(code), property_transfers(id, reference, status)")
    .eq("id", params.id)
    .maybeSingle();

  if (!matterData) notFound();
  const matter = matterData as unknown as Matter & { property_transfers?: LinkedTransfer | null };

  // Opening a matter clears its unread notification dot for this user.
  const meId = (await getSessionProfile())?.profile?.id ?? null;
  if (meId) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", meId)
      .eq("matter_id", params.id)
      .is("read_at", null);
  }
  const client = matter.clients as
    | {
        id: string;
        entity_type: string;
        full_name: string | null;
        business_name: string | null;
        primary_email: string | null;
        primary_cell: string | null;
      }
    | null;

  const [{ data: docsData }, { data: actData }, { data: partiesData }] = await Promise.all([
    // .neq: hide documents replaced by a newer upload in the same slot (migration 030).
    supabase.from("documents").select("id, document_type, document_status, file_name, uploaded_at, verified, matter_party_id, storage_bucket, storage_path, drive_file_id, uploaded_by, client_document_id, transfer_document_id").eq("matter_id", params.id).neq("document_status", "superseded"),
    // Comment-type ('post') activities are INTERNAL ONLY — partners (and clients)
    // see only lifecycle events, never staff notes. (Jukka, 2026-06-16.)
    // author_label since 2026-09-02: the rows now render through MatterFeed's
    // Activity tab, which names who did each thing rather than listing bodies.
    supabase.from("matter_activities").select("id, body, activity_type, author_label, created_at").eq("matter_id", params.id).in("activity_type", ["status_change", "document_upload", "phase_transition", "poa_signed"]).order("created_at", { ascending: false }).limit(20),
    supabase.from("matter_parties").select("*").eq("matter_id", params.id).order("role", { ascending: true }),
  ]);
  const docs = (docsData as MatterDocument[] | null) ?? [];
  const parties = (partiesData as MatterParty[] | null) ?? [];
  const signedUrls = docs.length > 0 ? await signedDocUrls(createAdminClient(), docs) : {};

  // FICA vault (migration 025): reusable docs for the matter's client + each
  // party's linked client, so the intake can offer "Reuse".
  const matterClientId = (matter as unknown as { clients?: { id?: string | null } | null }).clients?.id ?? null;
  const vaultClientIds = Array.from(
    new Set([matterClientId, ...parties.map((p) => p.client_id)].filter((x): x is string => Boolean(x)))
  );
  const vaultByClient: Record<string, ClientDocument[]> = {};
  if (vaultClientIds.length > 0) {
    const { data: vaultRows } = await supabase
      .from("client_documents")
      .select("id, client_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, uploaded_by, created_at, status, expiry_date, verified")
      .in("client_id", vaultClientIds)
      // Only CURRENT documents are reusable — not superseded or archived ones (032).
      .eq("status", "current");
    for (const r of (vaultRows as ClientDocument[] | null) ?? []) {
      (vaultByClient[r.client_id] ??= []).push(r);
    }
  }

  // Transfer-level documents (034) — the firm reuses the property's deed search
  // etc. on this matter's shared slots rather than re-fetching them. RLS confines
  // this to transfers whose attorney firm is theirs.
  const partnerTransferId = (matter as unknown as { transfer_id?: string | null }).transfer_id ?? null;
  const { data: transferDocData } = partnerTransferId
    ? await supabase
        .from("transfer_documents")
        .select("id, transfer_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, status, verified, uploaded_by, created_at")
        .eq("transfer_id", partnerTransferId)
        .eq("status", "current")
    : { data: null };
  const transferDocs = (transferDocData as TransferDocument[] | null) ?? [];

  // In-place FICA (033) — the firm can complete the client's details and record
  // consent without ConveyClear sending an onboarding link. Municipal-portal
  // credentials are excluded for partners (isStaff=false): they are the client's
  // own council login and the firm has no business holding them. The API enforces
  // that too — it refuses those fields from a partner, it doesn't just hide them.
  const ficaSubjects = await buildFicaSubjects(supabase, matterClientId, parties);

  // Documents grouped by class, with the SAME resolver the admin page uses.
  // §5.13 — the two matter pages change together, and a deed search must not be
  // filed one way for staff and another for the firm.
  const partyRoleById = new Map<string, string>();
  for (const p of parties) partyRoleById.set(p.id, p.role);
  const docsByClass: Record<string, typeof docs> = {
    input: [], supporting: [], output: [], other: [],
  };
  for (const d of docs) {
    const role = d.matter_party_id ? partyRoleById.get(d.matter_party_id) ?? null : null;
    docsByClass[
      resolveDocClass(matter.municipality, d.document_type ?? "", role as PartyRole)
    ].push(d);
  }

  // The parties, in the shape the upload panel asks "whose is it?" with.
  const uploadParties = parties.map((p) => ({
    id: p.id,
    role: p.role,
    name:
      p.business_name?.trim() ||
      p.full_name?.trim() ||
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
      p.role.replace(/_/g, " "),
  }));

  const activities = (actData as MatterActivity[] | null) ?? [];

  // The shared enquiry thread on this matter (#3). RLS gives the firm its own
  // threads plus every 'shared' one on a matter it can access.
  const enquiryThreads = await getMatterEnquiries(supabase, params.id);

  const serviceCode = (matter as unknown as { services?: { code?: string } | null }).services?.code ?? null;
  const pipeline = getPipeline(serviceCode, matter.municipality, (matter as unknown as { service_subtype?: string | null }).service_subtype);

  // Council/COT decision the partner is allowed to see. Resolved from
  // service_data.stage_outcome against the pipeline; shown only when the chosen
  // outcome is client-visible (e.g. RCF Memo Approved/Delayed/Rejected + reason).
  const sd = ((matter as unknown as { service_data?: Record<string, unknown> | null }).service_data ?? {}) as Record<string, unknown>;
  let decisionLabel: string | null = null;
  if (pipeline && sd.stage_outcome) {
    for (const ph of pipeline.phases) {
      for (const st of ph.stages) {
        const o = st.outcomes?.find((x) => x.key === sd.stage_outcome);
        if (o && o.clientVisible) {
          const r = o.reasons?.find((x) => x.key === sd.stage_reason);
          decisionLabel = `${o.label}${r ? ` — ${r.label}` : ""}`;
        }
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back to the transfer when the matter belongs to one — that is where the
          user came from. Partners may read their own firm's transfers, so this
          link is always reachable for them. (The CLIENT dashboard deliberately
          keeps "All matters": clients have no transfer-level access at all,
          migration 026, because a transfer spans both sides of the deal.) */}
      <Link
        href={partnerTransferId ? `/partner/transfers/${partnerTransferId}` : "/partner/matters"}
        className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2"
      >
        <ArrowLeft className="h-4 w-4" />{" "}
        {partnerTransferId ? matter.property_transfers?.reference ?? "Property transfer" : "Back to matters"}
      </Link>

      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">{matter.title || clientDisplayName(client) || "Matter"}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {/* Spelled out. This chip printed the raw code — "Council COT" — while
                every other surface says "City of Tshwane"; the 2026-06-22 note
                bans abbreviations in matter subtext for exactly this reason. */}
            {matter.municipality && (
              <MetaChip label="Council" value={municipalityLabel(matter.municipality)} />
            )}
            {(() => {
              const open = workdaysSince(matter.created_at);
              return open === null ? null : (
                <MetaChip
                  label="Open"
                  value={`${open} workday${open === 1 ? "" : "s"}`}
                  tone={open > 60 ? "waiting" : "neutral"}
                />
              );
            })()}
            <MetaChip label="Opened" value={formatDate(matter.created_at)} />
            {matter.partner_file_ref && <MetaChip label="Your ref" value={matter.partner_file_ref} />}
          </div>
        </div>
        {/* 🔴 NO STATUS PILL. Zewn, 2026-09-02: "remove the stage and status for
            attorneys here." That was said of the matters LIST, and the cards
            lost it the same day — but the detail page kept it, so opening a
            matter put "New" back on screen. It is the same fact: `matters.status`
            is the workflow state of OUR file, and a firm reading "New" beside
            their own instruction learns nothing about their transaction. The
            phase stepper below says where the work actually is. */}
      </div>

      {/* Two columns, in the transfer page's shape and for its reasons (§5.13 —
          the surfaces change together). Zewn, 2026-09-02: "structure it like the
          prop trf page with a left side and right side."

          Left is WORK, in the order it gets done: the transaction it belongs to,
          where it has got to, the parties, their details, the documents. Right is
          REFERENCE and the conversation — short cards that would otherwise wedge
          themselves between two pieces of work. */}
      {/* 🔴 THE SAME SHAPE AS THE ADMIN MATTER PAGE. Zewn, 2026-09-04: "the
          attorney matter page doesnt look quite right. please make it look more
          like the admin matter page."

          §5.13 is the standing reason: these two surfaces drift whenever only
          one is edited, and they have three times. So the section ORDER is now
          the admin page's, card for card — client details and consent, then the
          parties, then where the work has got to, then one documents box holding
          the three classes with the capture checklist inside Input. The right
          rail carries what is reference rather than work.

          What legitimately differs is only what a firm may SEE and DO: no
          council portal details, no internal card, no approval controls on a
          document, and the client-facing phase names on the pipeline. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {/* Client details + consent. `contact` folds in what used to be a
              separate "Client" card in the right rail — the admin page dropped
              that duplicate on 2026-09-01 ("this is also duplicated data in 2
              sections please fix") and this page still had it: one card naming
              the client, and another opening by naming the same client and
              saying what was missing from their record. */}
          <InPlaceFica
            matterId={params.id}
            subjects={ficaSubjects}
            isStaff={false}
            municipality={matter.municipality}
            serviceCode={serviceCode}
            prcStage={(matter as unknown as { service_subtype?: string | null }).service_subtype ?? null}
            contact={
              client
                ? {
                    name: clientDisplayName(client),
                    email: client.primary_email ?? null,
                    cell: client.primary_cell ?? null,
                  }
                : null
            }
          />

          {/* Parties (COO buyer/seller etc.) — nothing for a single-client matter. */}
          <PartiesCard
            parties={parties}
            matterId={params.id}
            ficaSubjects={ficaSubjects}
            isStaff={false}
            municipality={matter.municipality}
            serviceCode={serviceCode}
            prcStage={(matter as unknown as { service_subtype?: string | null }).service_subtype ?? null}
          />

          {/* Where the work has got to. Client-facing phase names: a firm must
              never be shown our internal vocabulary. */}
          {pipeline && (
            <Card>
              <PipelineProgress
                pipeline={pipeline}
                currentPhase={matter.current_phase}
                currentStage={(matter as unknown as { current_stage?: string | null }).current_stage ?? null}
                audience="client"
              />
            </Card>
          )}

          {decisionLabel && (
            <Callout tone="waiting" label="Council decision">
              <span className="text-[17px] font-semibold text-ink">{decisionLabel}</span>
            </Callout>
          )}

          {typeof sd.rates_account_no === "string" && sd.rates_account_no && (
            <Card>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">
                Rates account number
              </p>
              <p className="mt-1 text-[17px] font-semibold tabular-nums text-ink">{sd.rates_account_no}</p>
            </Card>
          )}

          {/* ── Documents ───────────────────────────────────────────────────
              🔴 WAS SPLIT BY WHO SENT IT — "Your / client uploads" against
              "ConveyClear uploads" — which is not a question anyone asks of a
              file. The admin page moved to input · supporting · output on
              2026-09-01 and this one did not, so the same deed search was filed
              one way for staff and another for the firm. Now both resolve the
              class the same way, from the council registry for this (council,
              service, stage).

              The capture checklist lives INSIDE Input documents rather than in a
              box of its own, for the reason it does on the admin page: what a
              service requires and what has been filed against it are one
              subject, and two boxes listed the same file twice. */}
          <Card padding="none">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-ink">
                <FileText className="h-4 w-4 text-action" /> Documents ({docs.length})
              </h2>
            </div>

            <div className="space-y-5 px-5 py-4">
              {DOC_CLASSES.map((cls) => (
                <div key={cls}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                    {DOC_CLASS_LABELS[cls]} ({docsByClass[cls].length})
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">{DOC_CLASS_HINTS[cls]}</p>

                  {cls === "input" && (
                    <div className="mt-3">
                      <InPlaceIntake
                        bare
                        matterId={matter.id}
                        serviceCode={serviceCode}
                        serviceSubtype={(matter as unknown as { service_subtype?: string | null }).service_subtype ?? null}
                        parties={parties}
                        documents={docs}
                        municipality={matter.municipality}
                        unavailable={Array.isArray(sd.docs_unavailable) ? (sd.docs_unavailable as string[]) : []}
                        canManage
                        vaultByClient={vaultByClient}
                        matterClientId={matterClientId}
                        transferDocs={transferDocs}
                      />
                    </div>
                  )}

                  {docsByClass[cls].length > 0 ? (
                    <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                      {docsByClass[cls].map((d) => (
                        <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                          <FileText className="h-4 w-4 shrink-0 text-ink-3" />
                          <span className="min-w-0 flex-1 truncate text-ink-2">
                            {d.file_name || d.document_type}
                          </span>
                          {d.storage_path && signedUrls[d.storage_path] ? (
                            <a
                              href={signedUrls[d.storage_path]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-xs font-semibold text-action hover:underline"
                            >
                              View
                            </a>
                          ) : d.drive_file_id ? (
                            <a
                              href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-xs font-semibold text-action hover:underline"
                            >
                              View
                            </a>
                          ) : null}
                          {d.verified && <StatusPill tone="ok">Verified</StatusPill>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-3 text-sm text-ink-3">
                      None yet
                    </p>
                  )}
                </div>
              ))}

              {/* Anything the council registry does not name, including every
                  document filed before the classes existed. Its own heading
                  rather than a silent home in "supporting". */}
              {docsByClass.other.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                    Other documents ({docsByClass.other.length})
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    Not named in {municipalityLabel(matter.municipality)}&apos;s requirements for this
                    service, or filed before documents were split into classes.
                  </p>
                  <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                    {docsByClass.other.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                        <FileText className="h-4 w-4 shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1 truncate text-ink-2">
                          {d.file_name || d.document_type}
                        </span>
                        {d.storage_path && signedUrls[d.storage_path] && (
                          <a
                            href={signedUrls[d.storage_path]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-xs font-semibold text-action hover:underline"
                          >
                            View
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 🔴 THE UPLOAD ASKS THREE QUESTIONS NOW. Zewn, 2026-09-04: "add
                  in the doc type and naming for document uploads like we have on
                  the prop trf page." It was a bare button that filed everything
                  as `other`, unnamed and party-less — which is why so much of
                  this matter's history sits under "Other documents". The class
                  is resolved from (council, type, party role), so a type nobody
                  picks and a party nobody names can only ever resolve to the
                  fallback. */}
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Add a document
                </p>
                <MatterUploadPanel
                  matterId={matter.id}
                  parties={uploadParties}
                  municipality={matter.municipality}
                  // What the document is ABOUT. The matter's own title already
                  // carries the property (COT_RCF_<ref>_ERF 3456 LONEHILL), so
                  // it is the honest subject here; the transfer's property
                  // description is not on this row.
                  propertyDescription={
                  (matter as unknown as { property_description?: string | null })
                    .property_description ?? null
                }
                />
                <p className="mt-2 text-xs text-ink-3">
                  ConveyClear reviews what you upload before it reaches the buyer or seller.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {/* The transaction this matter belongs to — reference, as on the admin
              page, where it also leads the right rail. */}
          <MatterTransferCard
            matterId={params.id}
            transfer={matter.property_transfers ?? null}
            basePath="/partner/transfers"
          />

          {/* What this council asks for, for THIS service — the same generated
              list the transfer page carries, narrowed to the one matter. */}
          <ExpectedDocuments
            municipality={matter.municipality}
            serviceCode={serviceCode}
            prcStage={(matter as unknown as { service_subtype?: string | null }).service_subtype ?? null}
          />

          {/* One card, two tabs: the conversation and the lifecycle history.
              The activities are already filtered to lifecycle events by the
              query — a firm never sees a staff note (Jukka, 2026-06-16). */}
          <MatterFeed
            matterId={params.id}
            threads={enquiryThreads}
            activities={activities}
            audience="partner"
          />
        </div>
      </div>
    </div>
  );
}
