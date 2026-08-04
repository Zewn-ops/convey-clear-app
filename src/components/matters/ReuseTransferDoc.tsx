"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Link2 } from "lucide-react";

// Reuse a TRANSFER-level document on one of the transfer's matters (migration
// 034). This is what the transfer hub was for: the deed search is obtained once
// for the property, then serves the PRC, the COO and the refund matter — instead
// of being uploaded three times and going stale in two of them.
//
// Sibling of ReuseVaultDoc (which reuses a CLIENT's FICA doc). Shown on the
// SHARED slots of the intake — the ones that belong to the matter, not a party.
export default function ReuseTransferDoc({
  matterId,
  matterPartyId,
  options,
}: {
  matterId: string;
  matterPartyId: string | null;
  options: { id: string; file_name: string | null }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(options[0]?.id ?? "");

  async function attach(transferDocumentId: string) {
    if (!transferDocumentId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/transfer-documents/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_document_id: transferDocumentId,
          matter_id: matterId,
          matter_party_id: matterPartyId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not reuse the document");
      toast.success(j.deduped ? "Already attached" : "Reused from the transfer");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reuse");
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) return null;

  const btn =
    "inline-flex items-center gap-1 rounded-lg border border-line/40 px-2.5 py-1.5 text-xs font-medium text-action hover:bg-action-fill/5 disabled:opacity-50";

  if (options.length === 1) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => attach(options[0].id)}
        className={btn}
        title="Use the document already held for this property transfer"
      >
        <Link2 className="h-3.5 w-3.5" /> {busy ? "…" : "From transfer"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="rounded-lg border border-line px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#E8521A]"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.file_name || "Document"}
          </option>
        ))}
      </select>
      <button type="button" disabled={busy} onClick={() => attach(sel)} className={btn}>
        <Link2 className="h-3.5 w-3.5" /> {busy ? "…" : "From transfer"}
      </button>
    </div>
  );
}
