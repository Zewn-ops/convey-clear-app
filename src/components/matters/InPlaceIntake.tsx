import Card from "@/components/ui/Card";
import SubmitButton from "@/components/ui/SubmitButton";
import StorageUpload from "@/components/matters/StorageUpload";
import DocRemoveButton from "@/components/matters/DocRemoveButton";
import ReuseVaultDoc from "@/components/matters/ReuseVaultDoc";
import ReuseTransferDoc from "@/components/matters/ReuseTransferDoc";
import { cooSharedDocs, cooPartyDocs, partyRoleOrder, type CooEntity, type CooDocRule } from "@/lib/coo-docs";
import { prcStageDocs, prcStageLabel, docLabel } from "@/lib/prc-docs";
import { toggleDocUnavailable } from "@/lib/actions/intake";
import {
  composeFullName,
  type MatterParty,
  type MatterDocument,
  type ClientDocument,
  type TransferDocument,
} from "@/types";
import { CheckCircle2, Circle, Ban, FileText, Link2, ClipboardList } from "lucide-react";

// In-place intake (foundation): capture a matter's required documents directly
// on the matter detail, service-aware, per party — the primary method (the
// /onboard link stays as a secondary path). Reads the same doc matrix as the
// onboard forms (coo-docs / prc-docs config) so the two never drift. Server
// component: renders the client StorageUpload per required slot.

const ROLE_LABELS: Record<string, string> = {
  seller: "Seller (current owner)",
  buyer: "Buyer (new owner)",
  owner: "Owner",
  applicant: "Applicant / seller",
  other: "Party",
};

function partyLabel(p: MatterParty): string {
  return p.entity_type === "natural_person"
    ? composeFullName(p.first_name, p.last_name) || p.full_name || "Party"
    : p.business_name || "Party";
}

function toCooEntity(e: MatterParty["entity_type"]): CooEntity {
  return e === "trust" ? "trust" : e === "business" ? "business" : "natural_person";
}

interface Group {
  key: string;
  title: string;
  subtitle?: string;
  partyId: string | null;
  slots: CooDocRule[];
  vaultDocs: ClientDocument[]; // this group's client's reusable vault docs
  /** A side of the transaction with no party row captured yet (COO). */
  missingParty?: boolean;
  /** A PRC matter with no stage recorded — the list below is a guess (§5.8). */
  stageMissing?: boolean;
}

export default function InPlaceIntake({
  matterId,
  serviceCode,
  serviceSubtype = null,
  parties,
  documents,
  municipality,
  unavailable,
  canManage,
  vaultByClient = {},
  matterClientId = null,
  transferDocs = [],
}: {
  matterId: string;
  serviceCode: string | null;
  /**
   * For a PRC matter, which stage it is: RCA opens the rates clearance
   * account, RCF gets the figures from it, RCC gets the certificate
   * (`matters.service_subtype`, 021).
   *
   * The stage decides what has to be collected, so a PRC matter without one
   * has no honest checklist to show — see the prompt below rather than a list
   * that quietly assumes RCF.
   */
  serviceSubtype?: string | null;
  parties: MatterParty[];
  documents: MatterDocument[];
  municipality: string | null;
  unavailable: string[];
  canManage: boolean;
  vaultByClient?: Record<string, ClientDocument[]>;
  matterClientId?: string | null;
  /** Current documents held at the property-transfer level (migration 034). */
  transferDocs?: TransferDocument[];
}) {
  const code = (serviceCode ?? "").toUpperCase();
  const sorted = [...parties].sort((a, b) => partyRoleOrder(a.role) - partyRoleOrder(b.role));
  const vaultFor = (clientId: string | null | undefined) => (clientId ? vaultByClient[clientId] ?? [] : []);
  const groups: Group[] = [];

  if (code === "COO") {
    groups.push({
      key: "shared",
      title: "Matter documents",
      subtitle: "Collected once for the transfer",
      partyId: null,
      slots: cooSharedDocs(),
      vaultDocs: vaultFor(matterClientId),
    });
    for (const p of sorted) {
      groups.push({
        key: p.id,
        title: partyLabel(p),
        subtitle: ROLE_LABELS[p.role] ?? p.role,
        partyId: p.id,
        slots: cooPartyDocs(p.role, toCooEntity(p.entity_type), municipality),
        vaultDocs: vaultFor(p.client_id),
      });
    }
    // A COO always has two sides, whether or not a party row exists yet. Older
    // matters arrived via /onboard or a partner referral, which create the rows —
    // so this loop alone looked fine. A staff-created matter had none, and the
    // page rendered "Matter documents" and nothing else, with nowhere to file
    // either side's FICA. Missing sides are rendered as placeholders so the
    // structure of the transaction is visible before anyone is captured.
    for (const role of ["seller", "buyer"] as const) {
      if (sorted.some((p) => p.role === role)) continue;
      groups.push({
        key: `missing-${role}`,
        title: role === "seller" ? "Seller" : "Buyer",
        subtitle: ROLE_LABELS[role] ?? role,
        // No party row means no (matter, party, type) key to file against, so the
        // slots stay empty and the section prompts for capture instead.
        partyId: null,
        slots: [],
        vaultDocs: [],
        missingParty: true,
      });
    }
  } else if (code === "PRC") {
    const seller = sorted[0] ?? null;
    const stage = (serviceSubtype ?? "").toUpperCase() || null;
    groups.push({
      key: seller?.id ?? "seller",
      title: seller ? partyLabel(seller) : "Seller",
      // The stage leads the subtitle because it is what decides the list
      // below it. §5.8 — an RCA, an RCF and an RCC were all being shown the
      // RCF's documents, at every council.
      subtitle: [
        stage ? prcStageLabel(stage) : "Stage not chosen",
        seller ? ROLE_LABELS[seller.role] ?? seller.role : "Seller / applicant",
      ].join(" · "),
      partyId: seller?.id ?? null,
      slots: prcStageDocs(stage, seller?.entity_type ?? "natural_person", municipality),
      vaultDocs: vaultFor(seller?.client_id ?? matterClientId),
      // Rendered as a prompt rather than silently falling back: the fallback
      // IS the RCF list, and showing it unlabelled is how a rates clearance
      // application came to be collected as though it were a figures request.
      stageMissing: !stage,
    });
  } else if (transferDocs.length === 0) {
    // The slot matrix covers COO + PRC (RCF) only; other services fall back to the
    // generic uploader elsewhere on the page. But a matter of ANY service can be
    // linked to a property transfer, and its documents must still be reachable —
    // so we only bail out when there is nothing at all to show.
    return null;
  }

  const docFor = (partyId: string | null, docType: string): MatterDocument | null =>
    documents.find((d) => d.document_type === docType && (d.matter_party_id ?? null) === partyId) ?? null;

  const keyFor = (partyId: string | null, docType: string) => `${partyId ?? "shared"}:${docType}`;

  // Progress across REQUIRED (non-optional) slots only.
  let required = 0;
  let done = 0;
  for (const g of groups) {
    for (const s of g.slots) {
      if (s.optional) continue;
      required++;
      if (docFor(g.partyId, s.docType)) done++;
    }
  }
  const complete = required > 0 && done === required;

  return (
    <Card accent="service" className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-ink flex items-center gap-2"><ClipboardList className="h-4 w-4 text-sky-700" /> Capture documents</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Upload each required document straight onto the matter — no need to send a link first.
          </p>
        </div>
        {required > 0 && (
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              complete ? "bg-green-50 text-green-700" : "bg-raised text-ink-2"
            }`}
          >
            {done}/{required} required
          </span>
        )}
      </div>

      {/* Everything held at the property-transfer level, reusable on this matter.
          This panel exists because matching transfer docs to slots is NOT enough:
          the RCF matrix has no deed_search slot at all, so a transfer's deed search
          would be stranded with no way to attach it. Here every transfer document
          is reachable regardless of what the service's slot matrix happens to
          contain — attached at matter level (no party). */}
      {transferDocs.length > 0 && (
        <div className="rounded-lg bg-action-fill/[0.03] p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-action" />
            <h3 className="text-xs font-semibold text-ink">From this property transfer</h3>
          </div>
          <p className="mb-2.5 text-xs text-ink-3">
            Held once for the property and reusable on every matter in the transfer — no need to fetch them again.
          </p>
          <ul className="space-y-1.5">
            {transferDocs.map((t) => {
              const attached = documents.some((d) => d.transfer_document_id === t.id);
              return (
                <li key={t.id} className="flex items-center gap-2.5">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{docLabel(t.document_type)}</p>
                    <p className="truncate text-[11px] text-ink-3">{t.file_name || "—"}</p>
                  </div>
                  {attached ? (
                    <span className="shrink-0 text-xs font-medium text-green-600">On this matter</span>
                  ) : (
                    <ReuseTransferDoc
                      matterId={matterId}
                      matterPartyId={null}
                      options={[{ id: t.id, file_name: t.file_name }]}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="overflow-hidden rounded-lg shadow-sm dark:ring-1 dark:ring-line">
          <div className="border-b border-line bg-raised px-4 py-2">
            <p className="text-sm font-medium text-ink">{g.title}</p>
            {g.subtitle && <p className="text-xs text-ink-3">{g.subtitle}</p>}
          </div>
          {g.missingParty && (
            <p className="px-4 py-3 text-sm text-ink-3">
              No {g.title.toLowerCase()} captured on this matter yet. Add their
              details in <span className="font-medium text-ink-2">Parties</span> above
              (or send the client the onboarding link) and this side&apos;s document
              slots appear here.
            </p>
          )}
          {/* §5.8 — a rates clearance without a stage. Said plainly, because
              the list below is the RCF's and an RCA needs different things
              entirely. The alternative, which is what shipped until now, is a
              checklist that looks authoritative and quietly assumes. */}
          {g.stageMissing && (
            <p className="border-b border-line bg-required-tint px-4 py-3 text-sm text-ink-2">
              This rates clearance has no stage recorded, so the documents below
              are the <span className="font-medium">figures</span> list by
              default. Set it to an application, figures or a certificate on the
              matter, and the council&apos;s own requirements replace this.
            </p>
          )}
          <ul className="divide-y divide-line">
            {g.slots.map((s) => {
              const doc = docFor(g.partyId, s.docType);
              const key = keyFor(g.partyId, s.docType);
              const isUnavailable = !doc && unavailable.includes(key);
              const reuseOpts = g.vaultDocs
                .filter((v) => v.document_type === s.docType)
                .map((v) => ({ id: v.id, file_name: v.file_name }));
              // Match on document TYPE alone. The type already encodes
              // property-vs-person — a deed search is never a party's document, and
              // a certified ID is never a transfer's. Gating this on "shared slots
              // only" was over-thinking it, and it broke PRC/RCF outright: that
              // service has NO shared group, so every slot is party-scoped and the
              // button could never appear. It also hid the electrical COC, which
              // sits on the seller's slot but describes the property.
              const transferOpts = transferDocs
                .filter((t) => t.document_type === s.docType)
                .map((t) => ({ id: t.id, file_name: t.file_name }));
              return (
                <li key={s.docType} className="flex items-center gap-3 px-4 py-2.5">
                  {doc ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  ) : isUnavailable ? (
                    <Ban className="h-4 w-4 shrink-0 text-ink-3" />
                  ) : (
                    <Circle className={`h-4 w-4 shrink-0 ${s.optional ? "text-ink-3" : "text-ink-3"}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      {docLabel(s.docType)}
                      {s.optional && <span className="ml-1.5 text-xs text-ink-3">(optional)</span>}
                    </p>
                    {doc && (
                      <p className="flex items-center gap-1 truncate text-xs text-ink-3">
                        <FileText className="h-3 w-3 shrink-0" /> {doc.file_name || "Uploaded"}
                      </p>
                    )}
                    {isUnavailable && <p className="text-xs text-ink-3">Marked not available</p>}
                  </div>
                  <div className="shrink-0">
                    {doc ? (
                      // A filled slot used to render this label ALONE, which made the
                      // slot a dead end: migration 030 deliberately made a second
                      // upload supersede the first ("rejecting it would strand the
                      // user with a wrong file"), but with no control on screen that
                      // path was unreachable and a wrong document was permanent.
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-green-600">Uploaded</span>
                        {canManage && (
                          <>
                            <StorageUpload
                              matterId={matterId}
                              documentType={s.docType}
                              matterPartyId={g.partyId ?? undefined}
                              label="Replace"
                            />
                            <DocRemoveButton documentId={doc.id} fileName={doc.file_name} />
                          </>
                        )}
                      </div>
                    ) : isUnavailable ? (
                      canManage && (
                        <form action={toggleDocUnavailable}>
                          <input type="hidden" name="matter_id" value={matterId} />
                          <input type="hidden" name="doc_key" value={key} />
                          <input type="hidden" name="make" value="0" />
                          <SubmitButton pendingLabel="…" className="text-xs text-action hover:underline">
                            Undo
                          </SubmitButton>
                        </form>
                      )
                    ) : (
                      <div className="flex items-center gap-2">
                        {transferOpts.length > 0 && (
                          <ReuseTransferDoc matterId={matterId} matterPartyId={g.partyId} options={transferOpts} />
                        )}
                        {reuseOpts.length > 0 && (
                          <ReuseVaultDoc matterId={matterId} matterPartyId={g.partyId} options={reuseOpts} />
                        )}
                        <StorageUpload
                          matterId={matterId}
                          documentType={s.docType}
                          matterPartyId={g.partyId ?? undefined}
                          label="Upload"
                        />
                        {s.optional && canManage && (
                          <form action={toggleDocUnavailable}>
                            <input type="hidden" name="matter_id" value={matterId} />
                            <input type="hidden" name="doc_key" value={key} />
                            <input type="hidden" name="make" value="1" />
                            <SubmitButton pendingLabel="…" className="text-xs text-ink-3 hover:text-ink-2 hover:underline">
                              Not available
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Card>
  );
}
