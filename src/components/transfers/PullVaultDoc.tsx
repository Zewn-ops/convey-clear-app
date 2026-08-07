"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FolderInput, Eye } from "lucide-react";

export interface VaultOption {
  id: string;
  fileName: string | null;
  documentType: string | null;
  ownerName: string;
}

/**
 * Move a document out of a party's FICA vault and onto this transfer.
 *
 * 🔴 STAFF-ONLY CONTROL. Meeting 2 (2026-08-06) parked the automatic
 * vault→transfer feed because it would have put one party's identity documents
 * in front of the other side. This is the deliberate manual replacement: a
 * ConveyClear member decides, one document at a time. Attorneys and clients
 * never see this control, and the route refuses them regardless.
 *
 * The warning below is not decoration. Staff are about to widen who can see a
 * client's FICA document, and the honest thing is to say exactly how far that
 * goes BEFORE the click rather than after.
 */
export default function PullVaultDoc({
  transferId,
  options,
}: {
  transferId: string;
  options: VaultOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState("");

  if (options.length === 0) return null;

  async function pull() {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await fetch("/api/transfer-documents/from-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: transferId, client_document_id: sel }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not add that document.");
        return;
      }
      toast.success(j.deduped ? "Already on this transfer." : "Vault document added.");
      setSel("");
      router.refresh();
    } catch {
      toast.error("Could not add that document.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-raised p-3 space-y-2">
      <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
        <FolderInput className="h-3.5 w-3.5 text-action" />
        Add from a party&rsquo;s FICA vault
      </p>
      <p className="text-xs text-ink-3 flex items-start gap-1.5">
        <Eye className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Anything added here becomes visible to <strong className="text-ink-2">the attorney firm
          working this transfer</strong>, as well as ConveyClear. It is not shown to the other party.
          Only ConveyClear staff can do this.
        </span>
      </p>
      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs font-medium text-ink-3">
          Document
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            disabled={busy}
            className="bg-surface text-ink mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] disabled:bg-raised disabled:text-ink-3"
          >
            <option value="">— Select a vault document —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.ownerName} · {o.fileName || o.documentType || "Document"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={pull}
          disabled={busy || !sel}
          className="px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}
