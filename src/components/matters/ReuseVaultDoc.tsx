"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";

// Reuse a client-vault document on a matter's required slot without re-uploading
// (migration 025). Shown next to the upload control when the slot's client has a
// vault doc of the matching type. One option → a single "Reuse" button; several
// → a picker.
export default function ReuseVaultDoc({
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

  async function attach(clientDocumentId: string) {
    if (!clientDocumentId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/client-documents/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_document_id: clientDocumentId,
          matter_id: matterId,
          matter_party_id: matterPartyId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not reuse the document");
      toast.success(j.deduped ? "Already attached" : "Reused from vault");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reuse");
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) return null;

  if (options.length === 1) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => attach(options[0].id)}
        className="inline-flex items-center gap-1 rounded-lg border border-[#1B2E6B]/30 px-2.5 py-1.5 text-xs font-medium text-[#1B2E6B] hover:bg-[#1B2E6B]/5 disabled:opacity-50"
        title="Reuse this client's existing document"
      >
        <RefreshCw className="h-3.5 w-3.5" /> {busy ? "…" : "Reuse"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.file_name || "Document"}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => attach(sel)}
        className="inline-flex items-center gap-1 rounded-lg border border-[#1B2E6B]/30 px-2.5 py-1.5 text-xs font-medium text-[#1B2E6B] hover:bg-[#1B2E6B]/5 disabled:opacity-50"
      >
        <RefreshCw className="h-3.5 w-3.5" /> {busy ? "…" : "Reuse"}
      </button>
    </div>
  );
}
