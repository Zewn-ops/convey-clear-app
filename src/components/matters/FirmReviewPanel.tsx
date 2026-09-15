"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

/**
 * ConveyClear answering a matter a firm proposed (098).
 *
 * Marlene: the firm submits, "ConveyClear can then go in and approve/reject the
 * matter based on what was provided". Both halves of that sentence matter — the
 * decision is made while LOOKING at what was provided, so this panel sits on the
 * matter page itself, above the work, rather than in a separate approvals queue
 * where the documents and the background note are a click away.
 *
 * Rendered only while the answer is outstanding. Once given it collapses to a
 * line of record, because a decision you can silently re-make is not a decision.
 */
export default function FirmReviewPanel({
  matterId,
  state,
  note,
  submittedBy,
}: {
  matterId: string;
  state: string | null;
  note: string | null;
  submittedBy: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  if (!state) return null;

  async function decide(decision: "approved" | "rejected") {
    if (decision === "rejected" && !reason.trim()) {
      // Enforced on the server too. Here so the person finds out before they
      // have committed to the click, not after.
      setRejecting(true);
      toast.error("Say why, so the firm knows what to fix.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/matters/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId, decision, note: reason }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(json.message ?? "Could not record that");
      return;
    }
    toast.success(decision === "approved" ? "Taken on" : "Sent back to the firm");
    router.refresh();
  }

  if (state === "approved") {
    return (
      <p className="text-xs text-ink-3">
        Submitted by {submittedBy ?? "the firm"} and accepted by ConveyClear.
      </p>
    );
  }

  if (state === "rejected") {
    return (
      <Card accent="firm">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-danger">
          Not taken on
        </p>
        <p className="mt-2 text-sm text-ink-2">{note}</p>
        <p className="mt-2 text-xs text-ink-3">
          The firm has been told. Reopening this is a conversation, not a button — ask them to send
          it again with what was missing.
        </p>
      </Card>
    );
  }

  return (
    <Card accent="firm">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-required">
        Awaiting your decision
      </p>
      <p className="mt-2 text-sm text-ink-2">
        {submittedBy ?? "The firm"} opened this matter. It is not on anyone&apos;s list and no work
        has started until you take it on.
      </p>

      <div className="mt-4">
        <label className="block text-[13px] font-medium text-ink-2" htmlFor="firm-review-reason">
          Reason {rejecting ? "(required to send back)" : "(only needed if you send it back)"}
        </label>
        <textarea
          id="firm-review-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What is missing, or why this cannot be taken on."
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
        />
      </div>

      <div className="mt-3 flex gap-2">
        <Button onClick={() => decide("approved")} disabled={busy}>
          {busy ? "Saving…" : "Take it on"}
        </Button>
        <Button variant="outline" onClick={() => decide("rejected")} disabled={busy}>
          Send back
        </Button>
      </div>
    </Card>
  );
}
