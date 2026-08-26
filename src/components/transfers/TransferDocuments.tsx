"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { UploadCloud, FileText, FilePlus2, CheckCircle2, RotateCcw, Trash2, Files, Pencil, Check, X, FolderInput } from "lucide-react";
import Card from "@/components/ui/Card";
import { docLabel } from "@/lib/prc-docs";
import { formatDate } from "@/lib/utils";
import type { TransferDocument } from "@/types";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

// The documents that belong to the PROPERTY, not to one matter: the deed search,
// the transfer confirmation letter, the clearance figures. Uploaded once here and
// reused by every matter in the transfer ("From transfer" on the intake), instead
// of being fetched again for the PRC, the COO and the refund.
/** The five documents a transfer is expected to gather, in order. */
const NAMED_DOC_TYPES = [
  "deed_search",
  "transfer_letter",
  "clearance_figures",
  "proof_of_payment_figures",
  "coc_electrical",
];
/**
 * What the bar at the bottom may upload.
 *
 * Zewn, 2026-08-26: "since we have the big buttons for the 5 main docs, the bar
 * underneath should just be for additional/supporting documents."
 *
 * The five named documents deliberately do NOT appear here any more. Each has
 * its own tile above, and offering the same five again in a dropdown made the
 * tiles look optional while inviting the commonest mistake there is — uploading
 * the clearance figures as "other" and wondering why the counter still says 4 of
 * 5. One route in per document.
 *
 * `seller_document` / `buyer_document` are for uploading a party's paperwork
 * straight onto the transfer when it is not coming from their FICA vault.
 * `other` is kept as the catch-all AND because rows already carry it.
 */
const SUPPORTING_DOC_TYPES = ["seller_document", "buyer_document", "other"];

type Doc = TransferDocument & { url?: string; usedOn?: number };

export interface VaultDocOption {
  id: string;
  fileName: string | null;
  documentType: string | null;
  ownerName: string;
  ownerRole?: string | null;
}

export default function TransferDocuments({
  transferId,
  docs,
  canManage,
  canUpload,
  canDelete = false,
  vaultOptions = [],
}: {
  transferId: string;
  docs: Doc[];
  /**
   * The parties' FICA vault documents, staff-only. Rendered INSIDE this card
   * rather than as a separate one below it — Zewn, 2026-08-26: "make sure there
   * is an easy way for us to link the fica vault docs from buyer/seller when on
   * the prop trf page. needs to be seamless". A picker sitting in its own card
   * under the documents is a different job you have to go and find; grouped
   * under the documents it belongs to, it is one click where you already are.
   */
  vaultOptions?: VaultDocOption[];
  /**
   * Staff. Approving, sharing, disapproving and archiving — everything that
   * decides what a document MEANS or who sees it.
   */
  canManage: boolean;
  /**
   * May add a document. Split from `canManage` on 2026-08-11 (§112): the
   * attorney firm uploads the deed search, then ConveyClear decides who sees it.
   * Defaults to `canManage` so every existing caller behaves exactly as before.
   */
  canUpload?: boolean;
  canDelete?: boolean;
}) {
  const mayUpload = canUpload ?? canManage;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [type, setType] = useState(SUPPORTING_DOC_TYPES[0]);
  const [vaultBusy, setVaultBusy] = useState<string | null>(null);

  async function pullFromVault(clientDocumentId: string) {
    setVaultBusy(clientDocumentId);
    try {
      const r = await fetch("/api/transfer-documents/from-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: transferId, client_document_id: clientDocumentId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not add that document.");
        return;
      }
      toast.success(j.deduped ? "Already on this transfer." : "Added from the vault.");
      router.refresh();
    } catch {
      toast.error("Could not add that document.");
    } finally {
      setVaultBusy(null);
    }
  }
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = docs.filter((d) => (d.status ?? "current") === "current");

  // Count DISTINCT named types present, not rows — two deed searches are still
  // one of the five. Disapproved documents do not count: the file is held and
  // has to be replaced, so counting it would report the transfer as further
  // along than it is.
  const presentNamed = new Set(
    current.filter((d) => d.disapproved_at == null).map((d) => d.document_type)
  );
  const missingNamed = NAMED_DOC_TYPES.filter((t) => !presentNamed.has(t));
  const namedUploaded = NAMED_DOC_TYPES.length - missingNamed.length;
  const archived = docs.filter((d) => d.status === "archived");

  async function upload(file: File, docType: string, replacesId?: string) {
    if (!ALLOWED.includes(file.type)) return toast.error("Only PDF, JPG, PNG or WebP files");
    if (file.size > MAX_SIZE) return toast.error("File must be under 10 MB");

    setBusy(replacesId ?? "__new");
    try {
      const r = await fetch("/api/transfer-documents/signed-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: transferId, file_name: file.name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not start the upload");

      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, file);
      if (upErr) throw new Error(upErr.message);

      const c = await fetch("/api/transfer-documents/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_id: transferId,
          storage_path: j.path,
          document_type: docType,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          replaces_id: replacesId ?? null,
        }),
      });
      const cj = await c.json();
      if (!c.ok) throw new Error(cj.message ?? "Could not record the document");

      toast.success(replacesId ? "Replaced — the previous version is kept" : "Added to the transfer");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>, msg: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/transfer-documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not update");
      toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/transfer-documents/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not delete");
      toast.success("Deleted");
      router.refresh();
    } catch (e) {
      // A doc in use on a matter can only be archived — the API says so plainly.
      toast.error(e instanceof Error ? e.message : "Delete failed", { duration: 6000 });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card accent="service">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Files className="h-4 w-4 text-action" />
        <h2 className="font-semibold text-ink">Transfer documents</h2>
        {/* Progress across the five NAMED transfer documents. "other" is excluded
            deliberately — it is an open-ended catch-all, so counting it would make
            the denominator meaningless and the transfer could never read complete. */}
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs font-semibold " +
            (namedUploaded === NAMED_DOC_TYPES.length
              ? "bg-green-100 text-green-800"
              : "bg-raised text-ink-2")
          }
          title={
            missingNamed.length
              ? `Still needed: ${missingNamed.map(docLabel).join(", ")}`
              : "All five transfer documents uploaded"
          }
        >
          {namedUploaded} of {NAMED_DOC_TYPES.length} uploaded
        </span>
      </div>
      <p className="mb-4 text-xs text-ink-3">
        Documents about the <b>property</b>, not any one matter — the deed search, transfer letter and clearance
        figures. Upload once here, then reuse on every matter in this transfer instead of fetching them again.
      </p>

      {/* The five named documents as five slots, always all five.
          A list only shows what HAS been uploaded, so "0 of 5" was a number with
          nothing behind it — you could not see which five, or which one was
          missing, without opening the dropdown and reading it. Five tiles make
          the set itself the interface: the gap is the message. The count stays
          on the heading — repeating 1/5 … 5/5 on every tile numbered the tiles
          rather than the progress, which is not the thing being counted. */}
      <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {NAMED_DOC_TYPES.map((t) => {
          const held = presentNamed.has(t);
          const doc = current.find((d) => d.document_type === t && d.disapproved_at == null);
          const pending = canManage && held && doc?.approved_at == null;
          return (
            <li key={t}>
              <label
                className={
                  "relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl p-3 text-center shadow-chip transition-shadow hover:shadow-lg " +
                  (held ? "bg-ok-tint" : "bg-surface")
                }
                title={held ? `${docLabel(t)} — uploaded` : `Upload the ${docLabel(t)}`}
              >
                {held && (
                  <CheckCircle2
                    className="absolute right-2 top-2 h-4 w-4 text-ok"
                    aria-label="Uploaded"
                  />
                )}
                {held ? (
                  <FileText className="h-9 w-9 text-ok" />
                ) : (
                  <FilePlus2 className="h-9 w-9 text-ink-3" />
                )}
                <span className="text-[12px] font-medium leading-tight text-ink">{docLabel(t)}</span>
                <span className="text-[10.5px] uppercase tracking-[0.07em] text-ink-3">
                  {pending ? "Awaiting approval" : held ? "Uploaded" : "Not uploaded"}
                </span>
                {canManage && (
                  <input
                    type="file"
                    className="sr-only"
                    accept={ALLOWED.join(",")}
                    disabled={busy != null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // Reset first: picking the same file twice in a row fires no
                      // change event otherwise, so a failed upload cannot be retried.
                      e.target.value = "";
                      if (f) upload(f, t);
                    }}
                  />
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {current.length > 0 ? (
        <ul className="mb-4 divide-y divide-line">
          {current.map((d) => {
            // Approval gate (042/043/044), staff-facing only. Pending = held for
            // an admin; disapproved = rejected with a reason. Both stay hidden
            // from the partner firm; grey a pending row so staff see it is not out.
            const isDisapproved = d.disapproved_at != null;
            const isPending = canManage && d.approved_at == null && !isDisapproved;
            return (
            <li key={d.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${busy === d.id ? "opacity-50" : isPending ? "opacity-60" : ""}`}>
              <FileText className="h-4 w-4 shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                  {docLabel(d.document_type)}
                  {d.verified && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" aria-label="Verified" />}
                  {/* canManage = staff/admin only, so the partner firm never sees
                      the internal review state. */}
                  {isPending && (
                    <span
                      className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
                      title="Not released. Hidden from the partner firm until an admin approves it in Document Approvals."
                    >
                      Awaiting approval
                    </span>
                  )}
                  {canManage && isDisapproved && (
                    <span
                      className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700"
                      title={d.disapproval_reason ? `Not approved: ${d.disapproval_reason}` : "Not approved by an admin."}
                    >
                      Not approved
                    </span>
                  )}
                  {/* Shared state is shown to EVERYONE who can see the row, not
                      just staff: a partner firm reading this list should know
                      the buyer and seller can see the document too. */}
                  {d.visibility === "parties" && (
                    <span
                      className="shrink-0 rounded bg-action-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-action"
                      title="Visible to the buyer and seller on this transfer."
                    >
                      Shared with parties
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-3">
                  {d.file_name || "—"} · {formatDate(d.created_at)}
                  {typeof d.usedOn === "number" && d.usedOn > 0 && (
                    <> · used on {d.usedOn} matter{d.usedOn === 1 ? "" : "s"}</>
                  )}
                  {d.supersedes_id ? " · replaced an earlier version" : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2.5 text-xs">
                {d.url && (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium text-action hover:underline">
                    View
                  </a>
                )}
                {canManage && (
                  <>
                    {/* Rename — matter documents have had this since B1; transfer
                        documents did not, which is what Jukka hit. The rename also
                        follows the file down onto every matter that reused it. */}
                    <RenameDoc
                      current={d.file_name || ""}
                      busy={busy === d.id}
                      onSave={(name) => patch(d.id, { file_name: name }, "Renamed")}
                    />
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => patch(d.id, { verified: !d.verified }, d.verified ? "Verification removed" : "Marked verified")}
                      className={`font-medium hover:underline disabled:opacity-50 ${d.verified ? "text-ink-3" : "text-green-700"}`}
                    >
                      {d.verified ? "Unverify" : "Verify"}
                    </button>
                    {/* Meeting 2 §40/§100. Default is internal, so sharing is
                        always a deliberate act — the confirm exists because
                        un-sharing does not un-see. */}
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => {
                        if (
                          d.visibility !== "parties" &&
                          !window.confirm(
                            `Share "${d.file_name || docLabel(d.document_type)}" with the buyer and seller on this transfer?\n\nThey will both be able to open it. Un-sharing later removes access, but not what they have already seen.`
                          )
                        ) {
                          return;
                        }
                        patch(
                          d.id,
                          { visibility: d.visibility === "parties" ? "internal" : "parties" },
                          d.visibility === "parties" ? "Hidden from the parties" : "Shared with the parties"
                        );
                      }}
                      className={`font-medium hover:underline disabled:opacity-50 ${d.visibility === "parties" ? "text-ink-3" : "text-action"}`}
                    >
                      {d.visibility === "parties" ? "Unshare" : "Share"}
                    </button>
                    <ReplacePick busy={busy === d.id} onPick={(f) => upload(f, d.document_type, d.id)} />
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => patch(d.id, { status: "archived" }, "Archived — matters that used it keep the file")}
                      className="font-medium text-ink-3 hover:text-ink-2 hover:underline disabled:opacity-50"
                    >
                      Archive
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        disabled={busy === d.id}
                        onClick={() => remove(d.id)}
                        title="Delete permanently (only if no matter uses it)"
                        className="text-ink-3 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-ink-3">No transfer documents yet.</p>
      )}

      {/* Pull from a party's FICA vault. Staff only — Meeting 2 (2026-08-06)
          parked the automatic vault→transfer feed because it would put one
          party's identity documents in front of the other side. This is the
          deliberate manual replacement: one document, one decision. */}
      {canManage && vaultOptions.length > 0 && (
        <div className="mb-4 rounded-lg border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
            From a party&rsquo;s FICA vault
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Adds a copy to this transfer. It becomes visible to whoever the transfer is shared with, so
            add only what this transaction needs.
          </p>
          <div className="mt-3 space-y-3">
            {Object.entries(
              vaultOptions.reduce<Record<string, VaultDocOption[]>>((acc, o) => {
                const key = o.ownerRole ? `${o.ownerName} · ${o.ownerRole}` : o.ownerName;
                (acc[key] ??= []).push(o);
                return acc;
              }, {})
            ).map(([owner, items]) => (
              <div key={owner}>
                <p className="text-xs font-medium text-ink-2">{owner}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {items.map((o) => (
                    <button
                      key={o.id}
                      disabled={vaultBusy === o.id}
                      onClick={() => pullFromVault(o.id)}
                      title={o.fileName ?? undefined}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-action hover:text-action disabled:opacity-50"
                    >
                      <FolderInput className="h-3 w-3 shrink-0" />
                      <span className="truncate">{docLabel(o.documentType ?? "other")}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mayUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f, type);
          }}
          className={`flex items-end gap-2 rounded-lg border border-dashed p-3 transition-colors ${
            dragging ? "border-line bg-action-fill/5" : "border-line"
          }`}
        >
          <label className="flex-1 text-xs font-medium text-ink-3">
            Document type
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8521A]"
            >
              {SUPPORTING_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {docLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f, type);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy === "__new"}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-action-fill px-3 py-2 text-sm font-medium text-white hover:bg-action-fill/90 disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" /> {busy === "__new" ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}

      {/* §112 — the firm uploads, ConveyClear decides who sees it. Said here
          because the alternative is an attorney assuming the buyer already has
          the deed search and waiting on a share that nobody knows to make. */}
      {mayUpload && !canManage && (
        <p className="mt-2 text-xs text-ink-3">
          ConveyClear reviews what you upload and releases it to the buyer and seller. Documents are
          not visible to them until then.
        </p>
      )}

      {archived.length > 0 && canManage && (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-3 hover:text-ink-2">
            Archived ({archived.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {archived.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink-3">
                  {docLabel(d.document_type)} · {d.file_name || "—"}
                </span>
                <button
                  type="button"
                  disabled={busy === d.id}
                  onClick={() => patch(d.id, { status: "current" }, "Restored")}
                  className="shrink-0 text-xs font-medium text-action hover:underline disabled:opacity-50"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

// Inline rename, same interaction as the matter-side DocRenameButton (B1) so the
// two document lists behave identically.
function RenameDoc({
  current,
  busy,
  onSave,
}: {
  current: string;
  busy: boolean;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(current);

  if (!editing) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setName(current);
          setEditing(true);
        }}
        title="Rename"
        className="text-ink-3 hover:text-action disabled:opacity-50"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    );
  }

  const commit = () => {
    const trimmed = name.trim();
    setEditing(false);
    if (!trimmed || trimmed === current) return;
    onSave(trimmed);
  };

  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={busy}
        className="w-44 rounded border border-line bg-surface text-ink px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-action"
      />
      <button type="button" onClick={commit} disabled={busy} title="Save" className="text-green-600 hover:text-green-800">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={busy}
        title="Cancel"
        className="text-ink-3 hover:text-ink-2"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function ReplacePick({ busy, onPick }: { busy: boolean; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1 font-medium text-ink-3 hover:text-ink-2 hover:underline disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Replace
      </button>
    </>
  );
}
