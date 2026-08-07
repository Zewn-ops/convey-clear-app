"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check, X } from "lucide-react";

// Close off a signup request (057). Two outcomes only: the login was created
// (actioned), or it should not be (dismissed). Neither creates the login — that
// happens in Users & Access, because provisioning is already a built,
// role-aware flow and duplicating it here would give it a second front door.
export default function SignupRequestActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function send(status: "actioned" | "dismissed") {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/signup-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, status }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not update that.");
        return;
      }
      toast.success(status === "actioned" ? "Marked as handled." : "Dismissed.");
      router.refresh();
    } catch {
      toast.error("Could not update that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2 shrink-0">
      <button
        type="button"
        onClick={() => send("actioned")}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" /> Login created
      </button>
      <button
        type="button"
        onClick={() => send("dismissed")}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-lg hover:bg-raised disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> Dismiss
      </button>
    </div>
  );
}
