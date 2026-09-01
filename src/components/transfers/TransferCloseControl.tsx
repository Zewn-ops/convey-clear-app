"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Ban, Archive, RotateCcw } from "lucide-react";
import type { TransferStatus } from "@/types";

/**
 * Cancel, archive or reopen a transfer (084).
 *
 * Staff-only, and deliberately NOT the status dropdown on the Edit
 * screen. `cancelled` has been reachable from that dropdown all along,
 * which is worse than not having it: no reason is captured, nothing
 * leaves any list, and the person who did it is not recorded. Anyone
 * asking later gets an enum and a shrug.
 *
 * 🔴 The two closes are different events and the copy has to say so,
 * because the difference is invisible once it is done:
 *   · CANCEL  — the transaction died. The firm and the client keep
 *               seeing it, with the reason.
 *   · ARCHIVE — it should never have existed. They stop seeing it.
 *
 * A reason is required to close and not to reopen: closing is the one
 * that takes a transaction out of everyone's working view, and "why is
 * this gone" is the only question anyone asks about it afterwards.
 */
export default function TransferCloseControl({
  transferId,
  status,
  reason,
  matterCount,
}: {
  transferId: string;
  status: TransferStatus;
  /** The reason recorded when it was closed, if it is closed. */
  reason?: string | null;
  /** How many matters ride on this — shown before closing, never a blocker. */
  matterCount: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "cancel" | "archive">(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const closed = status === "cancelled" || status === "archived";

  async function send(action: "cancel" | "archive" | "reopen") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/property-transfers/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: transferId, action, reason: text.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "Could not do that");
      toast.success(
        action === "reopen"
          ? "Transfer reopened."
          : action === "cancel"
            ? "Transfer cancelled."
            : "Transfer archived."
      );
      setMode(null);
      setText("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not do that");
    } finally {
      setBusy(false);
    }
  }

  if (closed) {
    return (
      <div className="rounded-lg bg-raised px-3.5 py-3 ring-1 ring-inset ring-line">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          {status === "cancelled" ? "Cancelled" : "Archived"}
        </p>
        {reason && <p className="mt-1 text-[13px] text-ink-2">{reason}</p>}
        <p className="mt-1 text-xs text-ink-3">
          {status === "cancelled"
            ? "The firm and the client can still see this transaction."
            : "Hidden from the firm and the client. ConveyClear can still see it."}
        </p>
        <button
          type="button"
          onClick={() => send("reopen")}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-action hover:underline disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {busy ? "…" : "Reopen"}
        </button>
      </div>
    );
  }

  if (mode) {
    const isCancel = mode === "cancel";
    return (
      <div className="rounded-lg border border-line bg-raised p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          {isCancel ? "Cancel this transfer" : "Archive this transfer"}
        </p>
        <p className="mt-1 text-xs text-ink-3">
          {isCancel
            ? "The transaction died. It stops being live work; the firm and the client keep seeing it and are told why."
            : "It should never have existed — a typo, a duplicate, a test. The firm and the client stop seeing it entirely."}
        </p>
        {matterCount > 0 && (
          <p className="mt-2 rounded bg-waiting-tint px-2.5 py-2 text-[13px] text-ink-2 ring-1 ring-inset ring-waiting/20">
            {matterCount} matter{matterCount === 1 ? "" : "s"} still attached. They keep running and
            stay reachable from Matters — closing the transfer does not close them.
          </p>
        )}
        <label className="mt-2 block text-xs font-medium text-ink-3">
          Reason
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isCancel ? "Sale fell through — buyer withdrew" : "Duplicate of SH-2026-0417"}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
          />
        </label>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => send(mode)}
            disabled={busy || !text.trim()}
            className="rounded-lg bg-danger-fill px-3 py-1.5 text-sm font-medium text-white hover:bg-danger-fill/90 disabled:opacity-50"
          >
            {busy ? "…" : isCancel ? "Cancel transfer" : "Archive transfer"}
          </button>
          <button
            type="button"
            onClick={() => { setMode(null); setText(""); }}
            disabled={busy}
            className="px-2.5 py-1.5 text-sm text-ink-3 hover:text-ink"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setMode("cancel")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-raised"
      >
        <Ban className="h-3.5 w-3.5" /> Cancel transfer
      </button>
      <button
        type="button"
        onClick={() => setMode("archive")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-raised"
      >
        <Archive className="h-3.5 w-3.5" /> Archive
      </button>
    </div>
  );
}
