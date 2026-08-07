"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check, X } from "lucide-react";

/**
 * Approve or decline one transfer request (055).
 *
 * Approving asks for the reference rather than accepting the firm's suggestion
 * silently — references follow ConveyClear's naming convention
 * ({MUNI}_{SERVICE}_{CLIENT}_{PROPERTY}), and the firm's own file reference is
 * a hint, not the answer.
 *
 * Declining REQUIRES a reason, enforced on the server too. A request that just
 * disappears teaches firms to phone instead, which is what this flow replaces.
 */
export default function TransferRequestReview({
  requestId,
  suggestedReference,
}: {
  requestId: string;
  suggestedReference: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "approve" | "decline">("idle");
  const [reference, setReference] = useState(suggestedReference ?? "");
  const [reason, setReason] = useState("");

  async function send(action: "approve" | "decline") {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/transfer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, action, reference, decline_reason: reason }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not complete that.");
        return;
      }
      toast.success(action === "approve" ? "Transfer created." : "Request declined.");
      router.refresh();
    } catch {
      toast.error("Could not complete that.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "bg-surface text-ink mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]";

  if (mode === "approve") {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-ink-3">
          Transfer reference
          <input
            className={input}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="COT_COO_JP HOLDINGS_ERF 123 VALHALLA"
            autoFocus
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => send("approve")}
            disabled={busy || !reference.trim()}
            className="px-3 py-2 text-sm font-medium bg-ok-fill text-white rounded-lg hover:bg-ok-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Creating…" : "Create transfer"}
          </button>
          <button type="button" onClick={() => setMode("idle")} disabled={busy} className="px-3 py-2 text-sm text-ink-3 hover:text-ink-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "decline") {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-ink-3">
          Reason (the firm sees this)
          <input
            className={input}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Duplicate of an existing transfer"
            autoFocus
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => send("decline")}
            disabled={busy || !reason.trim()}
            className="px-3 py-2 text-sm font-medium bg-danger-fill text-white rounded-lg hover:bg-danger-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Declining…" : "Decline"}
          </button>
          <button type="button" onClick={() => setMode("idle")} disabled={busy} className="px-3 py-2 text-sm text-ink-3 hover:text-ink-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setMode("approve")}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90"
      >
        <Check className="h-4 w-4" /> Approve
      </button>
      <button
        type="button"
        onClick={() => setMode("decline")}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-2 border border-line rounded-lg hover:bg-raised"
      >
        <X className="h-4 w-4" /> Decline
      </button>
    </div>
  );
}
