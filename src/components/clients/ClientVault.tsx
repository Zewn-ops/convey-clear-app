"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import {
  UploadCloud,
  FileText,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Archive,
  Trash2,
  Plus,
} from "lucide-react";
import Card from "@/components/ui/Card";
import { docLabel } from "@/lib/prc-docs";
import { formatDate } from "@/lib/utils";
import {
  summariseVault,
  expiryState,
  daysUntil,
  suggestedExpiry,
  allVaultDocTypes,
} from "@/lib/client-fica";
import type { ClientDocument } from "@/types";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

type VaultDoc = ClientDocument & { url?: string };

// The client-level FICA vault (migration 025, extended by 032).
//
// v1 was a flat list plus one dropdown — you could add a document and nothing
// else. It could not tell you what a client was MISSING, that a proof of address
// had gone stale, or let you fix a wrong file. This shows the vault as a
// checklist against what the client's entity type actually requires, and gives
// each document the lifecycle it has in practice: verify, expire, replace, retire.
export default function ClientVault({
  clientId,
  entityType,
  docs,
  canDelete = false,
}: {
  clientId: string;
  entityType: string | null;
  docs: VaultDoc[];
  /** Hard delete is admin-only; staff archive instead. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [dragSlot, setDragSlot] = useState<string | null>(null);

  const summary = summariseVault(entityType, docs);
  const archived = docs.filter((d) => d.status === "archived");

  // ---------------------------------------------------------------- upload ---
  async function upload(file: File, docType: string, replacesId?: string) {
    if (!ALLOWED.includes(file.type)) return toast.error("Only PDF, JPG, PNG or WebP files");
    if (file.size > MAX_SIZE) return toast.error("File must be under 10 MB");

    const key = replacesId ?? docType;
    setBusy(key);
    try {
      const r = await fetch("/api/client-documents/signed-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, file_name: file.name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not start the upload");

      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, file);
      if (upErr) throw new Error(upErr.message);

      const c = await fetch("/api/client-documents/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          storage_path: j.path,
          document_type: docType,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          // Types with a known shelf life get a date filled in for you; it stays
          // editable, because the real expiry is on the document, not the clock.
          expiry_date: suggestedExpiry(docType, entityType),
          replaces_id: replacesId ?? null,
        }),
      });
      const cj = await c.json();
      if (!c.ok) throw new Error(cj.message ?? "Could not record the document");

      toast.success(replacesId ? "Replaced — the previous version is kept" : "Added to the vault");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function uploadMany(files: FileList | File[], docType: string) {
    for (const f of Array.from(files)) await upload(f, docType);
  }

  // ---------------------------------------------------------------- update ---
  async function patch(id: string, body: Record<string, unknown>, okMsg: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/client-documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not update the document");
      toast.success(okMsg);
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
      const r = await fetch(`/api/client-documents/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) {
        // 409 = in use on a matter. The API explains why; offer the safe path.
        throw new Error(j.message ?? "Could not delete the document");
      }
      toast.success("Deleted");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed", { duration: 6000 });
    } finally {
      setBusy(null);
    }
  }

  // ------------------------------------------------------------------ view ---
  // The heavy blue border + padlock are deliberate (Jukka, meeting 1 — he asked
  // twice). This card is the one place on the page holding a person's identity
  // documents, and it should not look like the cards around it: the border says
  // "this is the vault" before anyone reads the heading.
  // ! modifiers: Card already carries `border border-gray-200`, and cn() is a
  // string join, not a tailwind-merge — without !important the grey wins the
  // stylesheet-order fight and the vault renders with the default border.
  // (Confirmed live 2026-07-16: padlock showed, border didn't.)
  return (
    <Card className="!border-2 !border-[#1B2E6B]">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#1B2E6B]/10">
            <Lock className="h-3.5 w-3.5 text-[#1B2E6B]" />
          </span>
          <h2 className="font-semibold text-gray-900">FICA vault</h2>
        </div>
        <VaultProgress held={summary.requiredHeld} total={summary.requiredTotal} complete={summary.complete} />
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Documents stored against the client, not a matter — uploaded once, reused on every matter without re-uploading.
      </p>

      {summary.attention.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {summary.attention.length} document{summary.attention.length === 1 ? "" : "s"} need attention —{" "}
            {summary.attention.map((d) => docLabel(d.document_type)).join(", ")}. Replace{" "}
            {summary.attention.length === 1 ? "it" : "them"} to keep the client&apos;s file current.
          </span>
        </div>
      )}

      {/* Expected documents for this entity type — including the ones missing. */}
      <ul className="space-y-2">
        {summary.slots.map((slot) => {
          const t = slot.rule.docType;
          const empty = slot.docs.length === 0;
          return (
            <li
              key={t}
              onDragOver={(e) => {
                e.preventDefault();
                setDragSlot(t);
              }}
              onDragLeave={() => setDragSlot((s) => (s === t ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragSlot(null);
                if (e.dataTransfer.files?.length) uploadMany(e.dataTransfer.files, t);
              }}
              className={`rounded-lg border p-3 transition-colors ${
                dragSlot === t
                  ? "border-[#1B2E6B] bg-[#1B2E6B]/5"
                  : empty && !slot.rule.optional
                    ? "border-dashed border-gray-300 bg-gray-50/60"
                    : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {docLabel(t)}
                    {slot.rule.optional && <span className="ml-1.5 text-xs font-normal text-gray-400">optional</span>}
                  </p>
                  {empty && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {slot.rule.hint ?? "Not on file"} — drop a file here or browse.
                    </p>
                  )}
                </div>
                <FilePick
                  label={empty ? "Upload" : "Add another"}
                  icon={empty ? "upload" : "plus"}
                  busy={busy === t}
                  onPick={(files) => uploadMany(files, t)}
                />
              </div>

              {slot.docs.length > 0 && (
                <ul className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                  {slot.docs.map((d) => (
                    <DocRow
                      key={d.id}
                      doc={d}
                      busy={busy === d.id}
                      canDelete={canDelete}
                      onVerify={(v) => patch(d.id, { verified: v }, v ? "Marked verified" : "Verification removed")}
                      onExpiry={(v) => patch(d.id, { expiry_date: v || null }, "Expiry updated")}
                      onArchive={() => patch(d.id, { status: "archived" }, "Archived — it stays available to matters that used it")}
                      onDelete={() => remove(d.id)}
                      onReplace={(f) => upload(f, d.document_type, d.id)}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Anything on file that isn't expected for this entity type. */}
      {summary.extras.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Other documents</p>
          <ul className="space-y-1.5">
            {summary.extras.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                showType
                busy={busy === d.id}
                canDelete={canDelete}
                onVerify={(v) => patch(d.id, { verified: v }, v ? "Marked verified" : "Verification removed")}
                onExpiry={(v) => patch(d.id, { expiry_date: v || null }, "Expiry updated")}
                onArchive={() => patch(d.id, { status: "archived" }, "Archived")}
                onDelete={() => remove(d.id)}
                onReplace={(f) => upload(f, d.document_type, d.id)}
              />
            ))}
          </ul>
        </div>
      )}

      <AddOther busy={busy === "__other"} onUpload={(f, t) => upload(f, t)} />

      {archived.length > 0 && (
        <details className="mt-3 border-t border-gray-100 pt-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600">
            Archived ({archived.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {archived.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-1 text-sm">
                <Archive className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                <span className="min-w-0 flex-1 truncate text-gray-400">
                  {docLabel(d.document_type)} · {d.file_name || "—"}
                </span>
                <button
                  type="button"
                  disabled={busy === d.id}
                  onClick={() => patch(d.id, { status: "current" }, "Restored to the vault")}
                  className="shrink-0 text-xs font-medium text-[#1B2E6B] hover:underline disabled:opacity-50"
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

/* ------------------------------------------------------------------ pieces -- */

function VaultProgress({ held, total, complete }: { held: number; total: number; complete: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${complete ? "bg-green-500" : "bg-[#1B2E6B]"}`}
          style={{ width: `${total === 0 ? 100 : (held / total) * 100}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${complete ? "text-green-600" : "text-gray-500"}`}>
        {complete ? "Complete" : `${held}/${total} required`}
      </span>
    </div>
  );
}

function ExpiryBadge({ expiry }: { expiry: string | null | undefined }) {
  const state = expiryState(expiry);
  if (state === "none" || !expiry) return null;

  if (state === "expired") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" /> Expired
      </span>
    );
  }
  if (state === "expiring") {
    const d = daysUntil(expiry);
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
        <Clock className="h-3 w-3" /> {d === 0 ? "Expires today" : `${d}d left`}
      </span>
    );
  }
  return null;
}

function DocRow({
  doc,
  busy,
  canDelete,
  showType,
  onVerify,
  onExpiry,
  onArchive,
  onDelete,
  onReplace,
}: {
  doc: VaultDoc;
  busy: boolean;
  canDelete: boolean;
  showType?: boolean;
  onVerify: (v: boolean) => void;
  onExpiry: (v: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onReplace: (f: File) => void;
}) {
  const verified = Boolean(doc.verified);
  const expired = expiryState(doc.expiry_date) === "expired";

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1 ${busy ? "opacity-50" : ""}`}>
      <FileText className={`h-4 w-4 shrink-0 ${expired ? "text-red-400" : "text-gray-400"}`} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm text-gray-800">
          {showType && <span className="font-medium">{docLabel(doc.document_type)} ·</span>}
          <span className="truncate">{doc.file_name || "—"}</span>
          {verified && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" aria-label="Verified" />}
          <ExpiryBadge expiry={doc.expiry_date} />
        </p>
        <p className="text-xs text-gray-400">
          Added {formatDate(doc.created_at)}
          {doc.supersedes_id ? " · replaced an earlier version" : ""}
        </p>
      </div>

      {/* Expiry is editable in place — chasing a stale FICA doc is the whole point. */}
      <label className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400">
        Expires
        <input
          type="date"
          defaultValue={doc.expiry_date ?? ""}
          disabled={busy}
          onChange={(e) => onExpiry(e.target.value)}
          className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1B2E6B]"
        />
      </label>

      <div className="flex shrink-0 items-center gap-2.5 text-xs">
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#1B2E6B] hover:underline"
          >
            View
          </a>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => onVerify(!verified)}
          className={`font-medium hover:underline disabled:opacity-50 ${verified ? "text-gray-400" : "text-green-700"}`}
        >
          {verified ? "Unverify" : "Verify"}
        </button>

        <FilePick label="Replace" icon="rotate" small busy={busy} onPick={(files) => files[0] && onReplace(files[0])} />

        <button
          type="button"
          disabled={busy}
          onClick={onArchive}
          className="font-medium text-gray-400 hover:text-gray-600 hover:underline disabled:opacity-50"
        >
          Archive
        </button>

        {canDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            title="Delete permanently (only possible if no matter uses it)"
            className="text-gray-300 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function FilePick({
  label,
  icon,
  busy,
  small,
  onPick,
}: {
  label: string;
  icon: "upload" | "plus" | "rotate";
  busy: boolean;
  small?: boolean;
  onPick: (files: FileList) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const Icon = icon === "upload" ? UploadCloud : icon === "plus" ? Plus : RotateCcw;

  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple={icon !== "rotate"}
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          if (e.target.files?.length) onPick(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className={
          small
            ? "inline-flex items-center gap-1 font-medium text-gray-400 hover:text-gray-700 hover:underline disabled:opacity-50"
            : "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1B2E6B] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#1B2E6B]/90 disabled:opacity-50"
        }
      >
        <Icon className="h-3.5 w-3.5" />
        {busy ? "Uploading…" : label}
      </button>
    </>
  );
}

/** Upload a document type that isn't expected for this entity (or a one-off). */
function AddOther({ busy, onUpload }: { busy: boolean; onUpload: (f: File, t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("other");
  const ref = useRef<HTMLInputElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-700"
      >
        <Plus className="h-3.5 w-3.5" /> Add another kind of document
      </button>
    );
  }

  return (
    <div className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3">
      <label className="flex-1 text-xs font-medium text-gray-500">
        Document type
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
        >
          {allVaultDocTypes().map((t) => (
            <option key={t} value={t}>
              {docLabel(t)}
            </option>
          ))}
        </select>
      </label>
      <input
        ref={ref}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f, type);
          e.target.value = "";
          setOpen(false);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B2E6B] px-3 py-2 text-sm font-medium text-white hover:bg-[#1B2E6B]/90 disabled:opacity-50"
      >
        <UploadCloud className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-1 text-xs text-gray-400 hover:text-gray-600">
        Cancel
      </button>
    </div>
  );
}
