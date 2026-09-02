"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check, X, Undo2 } from "lucide-react";

/**
 * Approve or decline one transfer request (055).
 *
 * The reference is prefilled with the FIRM'S, which since 2026-08-11 (§78) is
 * mandatory on the request and is the transfer's real reference. Staff can still
 * edit it — a clash with an existing transfer, an obvious typo — but the default
 * is to accept it, so the field is shown rather than hidden and the normal
 * action is to press the button.
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
  const [mode, setMode] = useState<"idle" | "approve" | "decline" | "return">("idle");
  const [reference, setReference] = useState(suggestedReference ?? "");
  const [reason, setReason] = useState("");

  async function send(action: "approve" | "decline" | "return") {
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
      toast.success(
        action === "approve"
          ? "Transfer created."
          : action === "return"
            ? "Sent back to the firm."
            : "Request declined."
      );
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
          {/*
            The placeholder is the FIRM'S file reference for the whole
            transaction — never the matter naming convention
            (COT_COO_CLIENT_ERF), which is a different thing and taught the
            wrong format here.
          */}
          <input
            className={input}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="SH-2026-0417"
            autoFocus
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-3">
            {suggestedReference
              ? "The firm's own reference. Change it only to resolve a clash."
              : "This request predates mandatory references — give the transfer one."}
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => send("approve")}
            disabled={busy || !reference.trim()}
            className="px-3 py-2 text-sm font-medium bg-ok-fill text-white rounded-lg hover:bg-ok-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* "Approve and open", not "Create transfer": since 083 the draft is
                already there, and this is the step that accepts it. */}
            {busy ? "Opening…" : "Approve and open"}
          </button>
          <button type="button" onClick={() => setMode("idle")} disabled={busy} className="px-3 py-2 text-sm text-ink-3 hover:text-ink-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // 089 — send it back, rather than turn it down. Jukka: "we can temporarily
  // decline their request and give a reason to say that information is not
  // reflecting correctly." The request stays alive and the firm can edit it;
  // declining is for a request that should not have been made at all.
  if (mode === "return") {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-ink-3">
          What needs correcting? (the firm sees this)
          <input
            className={input}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Seller ID number does not match the certified copy"
            autoFocus
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-3">
            They can edit and resend. Nothing is lost, and the transfer stays in draft.
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => send("return")}
            disabled={busy || !reason.trim()}
            className="px-3 py-2 text-sm font-medium bg-waiting-fill text-white rounded-lg hover:bg-waiting-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Sending back…" : "Send back for changes"}
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
      {/* Between approve and decline, because that is where it belongs in
          practice: most of what staff find is a correction, not a refusal. */}
      <button
        type="button"
        onClick={() => setMode("return")}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-2 border border-line rounded-lg hover:bg-raised"
      >
        <Undo2 className="h-4 w-4" /> Send back
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
