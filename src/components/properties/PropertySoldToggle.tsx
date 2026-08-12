"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Archive, RotateCcw } from "lucide-react";

/**
 * Mark a property sold, or put it back (060 / meeting 2026-08-11 §92).
 *
 * Registering a transfer already does this on its own. This is the manual half:
 * a sale done off-portal, or undoing a transfer registered in error.
 *
 * ⚠️ No window.confirm. It blocks the browser-automation harness outright (dry
 * run 2026-08-11), and neither direction here is destructive — the property and
 * all of its history survive either way, which is the entire point of the
 * decision. An inline two-step is enough to stop a misclick.
 */
export default function PropertySoldToggle({
  propertyId,
  label,
  active,
}: {
  propertyId: string;
  label: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [arming, setArming] = useState(false);

  async function apply(next: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/properties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // `label` rides along because PATCH requires it — it is the one field
        // the route refuses to leave empty.
        body: JSON.stringify({ id: propertyId, label, active: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not update the property.");
        return;
      }
      toast.success(next ? "Property is active again." : "Property marked sold.");
      setArming(false);
      router.refresh();
    } catch {
      toast.error("Could not update the property.");
    } finally {
      setBusy(false);
    }
  }

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => apply(true)}
        disabled={busy}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink-2 border border-line rounded-lg hover:bg-raised disabled:opacity-50 shrink-0"
      >
        <RotateCcw className="h-4 w-4" />
        {busy ? "Working…" : "Mark active again"}
      </button>
    );
  }

  if (!arming) {
    return (
      <button
        type="button"
        onClick={() => setArming(true)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink-2 border border-line rounded-lg hover:bg-raised shrink-0"
      >
        <Archive className="h-4 w-4" /> Mark sold
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-ink-3">Keeps its history. Sold?</span>
      <button
        type="button"
        onClick={() => apply(false)}
        disabled={busy}
        className="px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50"
      >
        {busy ? "Working…" : "Yes, mark sold"}
      </button>
      <button
        type="button"
        onClick={() => setArming(false)}
        disabled={busy}
        className="px-3 py-2 text-sm font-medium text-ink-2 border border-line rounded-lg hover:bg-raised disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
