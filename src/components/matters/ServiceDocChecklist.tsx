"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check, Link2, UploadCloud } from "lucide-react";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import {
  serviceDocSlots,
  matchTransferDocs,
  OTHER_SLOT,
  type TransferDocRef,
} from "@/lib/service-doc-slots";

/**
 * The service's own document checklist, with somewhere to put each one.
 *
 * Jukka, 2026-09-15: "it's like a checklist, that's all it is … if they have the
 * ability to upload it right there and go through the checklist right there. One,
 * two, three, four, five. Okay, five is not uploaded yet."
 *
 * 🔴 EVERY DOCUMENT BELONGS TO THE PROPERTY TRANSFER. Zewn, 2026-09-17: "all the
 * documents get saved to the prop trf and then you reference them in matters.
 * Same goes for documents that get 'uploaded' to a matter. The container is
 * still within the prop trf and just displays in the matter."
 *
 * So an upload here goes to the TRANSFER — transfer bucket, transfer_documents
 * row — and the matter gets a reference. That is not a new mechanism: migration
 * 034 built it so a deed search fetched once for the property serves the PRC,
 * the COO and the refund matter without being uploaded three times, and
 * /api/transfer-documents/attach already points a documents row at the SAME
 * storage object rather than copying it.
 *
 * The value of one container is that "already uploaded" can be answered at all.
 * Two containers is how the same deed search ended up on FRPS_0001 three times.
 */
export default function ServiceDocChecklist({
  municipality,
  serviceCode,
  prcStage,
  transferId,
  transferDocs,
  matterId,
  attachedTypes = [],
}: {
  municipality: string | null;
  serviceCode: string;
  prcStage?: string | null;
  transferId: string;
  /** Everything already on the transaction — used ONLY to answer "is this slot
   *  filled?", never listed. */
  transferDocs: TransferDocRef[];
  /** When the matter exists, a linked document can be attached to it directly.
   *  Absent on the creation page: the matter does not exist yet, so uploads land
   *  on the transaction and the matter picks them up when it is created. */
  matterId?: string;
  /** Document types already referenced by this matter. */
  attachedTypes?: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<Record<string, string>>({});

  const slots = useMemo(
    () => serviceDocSlots(municipality, serviceCode, prcStage),
    [municipality, serviceCode, prcStage]
  );
  const onTransfer = useMemo(() => matchTransferDocs(slots, transferDocs), [slots, transferDocs]);
  const attached = useMemo(() => new Set(attachedTypes), [attachedTypes]);

  const real = slots.filter((s) => s.type !== OTHER_SLOT.type);
  // Count the REQUIRED ones, and say so. Counting every slot made this read
  // "0 of 5" while the approval screen read "0 of 3" for the same service — two
  // denominators for one question, on two screens a firm sees in the same hour.
  // Optional documents are collected when available and never block, so they are
  // still listed and still uploadable; they are simply not part of "are we
  // there yet".
  const required = real.filter((s) => !s.optional);
  const filled = required.filter(
    (s) => attached.has(s.type) || onTransfer.has(s.type) || justDone[s.type]
  ).length;

  async function upload(file: File, type: string) {
    setBusy(type);
    try {
      // 1 — a signed URL into the TRANSFER's bucket, never the matter's.
      const su = await fetch("/api/transfer-documents/signed-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: transferId, file_name: file.name }),
      });
      const s = await su.json();
      if (!su.ok) throw new Error(s.message ?? "Could not start the upload");

      // uploadToSignedUrl, not a raw PUT — this is the sequence every other
      // upload panel in the project uses, and a second mechanism for the same
      // job is how two vocabularies for one thing start (066).
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(s.bucket).uploadToSignedUrl(s.path, s.token, file);
      if (upErr) throw new Error(upErr.message);

      // 2 — record it on the transaction.
      const cf = await fetch("/api/transfer-documents/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_id: transferId,
          storage_path: s.path,
          document_type: type,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          // No display_name: the server builds the canonical name from the
          // transfer's own subject, and a name invented here is exactly the
          // preview-promises-what-the-server-will-not-save bug from 09-04.
        }),
      });
      const c = await cf.json();
      if (!cf.ok) throw new Error(c.message ?? "Could not record the document");

      // 3 — and point the matter at it, when there is a matter to point.
      // ⚠️ transfer_document_id, NOT id. /api/transfer-documents/confirm
      // answers { ok, transfer_document_id, replaced } — reading c.id here gave
      // undefined, the attach was skipped without erroring, and the document
      // would have landed on the transaction and never reached the matter.
      const newId = c.transfer_document_id as string | undefined;
      if (matterId && newId) {
        const at = await fetch("/api/transfer-documents/attach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transfer_document_id: newId, matter_id: matterId }),
        });
        if (!at.ok) {
          const aj = await at.json().catch(() => ({}));
          throw new Error(aj.message ?? "Uploaded to the transaction, but could not link it here");
        }
      }
      setJustDone((p) => ({ ...p, [type]: file.name }));
      toast.success(matterId ? "Uploaded and linked" : "Uploaded to the transaction");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function link(type: string, transferDocId: string) {
    if (!matterId) return;
    setBusy(type);
    const res = await fetch("/api/transfer-documents/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_document_id: transferDocId, matter_id: matterId }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message ?? "Could not link that document");
      return;
    }
    toast.success("Linked from the transaction");
    router.refresh();
  }

  return (
    <Card accent="service">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-ink">What this service needs</h2>
        {required.length > 0 && (
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums " +
              (filled === required.length ? "bg-ok-tint text-ok" : "bg-raised text-ink-2")
            }
          >
            {filled} of {required.length} required
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-ink-3">
        Documents live on the transaction, so anything here is reusable on every matter under it —
        upload once, never fetch it twice.
      </p>

      {real.length === 0 && (
        // 12 of 33 council/service combinations had no list at all on
        // 2026-09-17. Say so plainly rather than rendering an empty card that
        // reads as a loading failure.
        <p className="mb-4 rounded-lg bg-waiting-tint px-3.5 py-3 text-[13px] text-ink-2">
          We have not recorded a document list for this service at this council yet. Send whatever you
          have and we will come back to you if something is missing.
        </p>
      )}

      <ul className="space-y-2">
        {slots.map((slot) => {
          const hits = onTransfer.get(slot.type) ?? [];
          const isAttached = attached.has(slot.type);
          const done = isAttached || Boolean(justDone[slot.type]);
          const linkable = !isAttached && hits.length > 0 && Boolean(matterId);
          const isOther = slot.type === OTHER_SLOT.type;

          return (
            <li
              key={slot.type}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3.5 py-2.5"
            >
              <span
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                  (done || hits.length ? "bg-ok text-white" : "bg-line text-ink-3")
                }
                aria-hidden
              >
                {done || hits.length ? <Check className="h-3 w-3" strokeWidth={3} /> : ""}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{slot.label}</span>
                <span className="block text-[11px] text-ink-3">
                  {isOther
                    ? "Anything else you think we should have"
                    : [
                        slot.optional ? "Optional" : "Required",
                        slot.postRegistration ? "after registration" : null,
                        justDone[slot.type] ?? (hits.length ? "already on the transaction" : null),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
              </span>

              {linkable && (
                <button
                  type="button"
                  onClick={() => link(slot.type, hits[0].id)}
                  disabled={busy === slot.type}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-action-fill px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  <Link2 className="h-3 w-3" /> Link from transfer
                </button>
              )}

              {!done && (
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-action hover:text-action">
                  <UploadCloud className="h-3 w-3" />
                  {busy === slot.type ? "Uploading…" : hits.length ? "Upload another" : "Upload"}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    disabled={busy === slot.type}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) upload(f, slot.type);
                    }}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
