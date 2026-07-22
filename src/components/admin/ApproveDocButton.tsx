"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

// Approve one pending upload. No inline confirm step, unlike removal: approving
// is reversible in practice (the document can still be removed afterwards) and
// the queue is worked in bulk, so a confirm on every row would be friction with
// no safety gained.
export default function ApproveDocButton({
  id,
  kind,
}: {
  id: string;
  kind: "matter" | "transfer";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      const base = kind === "matter" ? "documents" : "transfer-documents";
      const res = await fetch(`/api/${base}/${id}/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not approve");
      toast.success(json.already_approved ? "Already approved" : "Approved — now visible");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={approve}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      <Check className="h-3.5 w-3.5" />
      {busy ? "Approving…" : "Approve"}
    </button>
  );
}
