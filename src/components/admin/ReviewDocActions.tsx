"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

// The per-row controls in the Document Approvals queue (044): View the file,
// Approve it, or Disapprove it with a required reason. Approving is one click
// (reversible in practice — the doc can still be removed after). Disapproving
// asks for a reason inline before it fires, because the reason is what the
// uploader is notified with and cannot be recovered otherwise.
export default function ReviewDocActions({
  id,
  kind,
  viewUrl,
}: {
  id: string;
  kind: "matter" | "transfer";
  viewUrl?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approve" | "disapprove">(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const base = kind === "matter" ? "documents" : "transfer-documents";

  async function approve() {
    setBusy("approve");
    try {
      const res = await fetch(`/api/${base}/${id}/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not approve");
      toast.success(json.already_approved ? "Already approved" : "Approved — now visible");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function disapprove() {
    const trimmed = reason.trim();
    if (!trimmed) return toast.error("Please type a reason first");
    setBusy("disapprove");
    try {
      const res = await fetch(`/api/${base}/${id}/disapprove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not disapprove");
      toast.success(json.already_disapproved ? "Already disapproved" : "Disapproved — uploader notified");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (rejecting) {
    return (
      <div className="flex flex-col items-end gap-2">
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason (shown to the uploader)…"
          disabled={busy !== null}
          className="w-64 rounded-md border border-line px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRejecting(false);
              setReason("");
            }}
            disabled={busy !== null}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-3 hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={disapprove}
            disabled={busy !== null || !reason.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            {busy === "disapprove" ? "Disapproving…" : "Confirm disapproval"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {viewUrl && (
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#1B2E6B] hover:underline"
        >
          View
        </a>
      )}
      <button
        type="button"
        onClick={() => setRejecting(true)}
        disabled={busy !== null}
        className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Disapprove
      </button>
      <button
        type="button"
        onClick={approve}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        {busy === "approve" ? "Approving…" : "Approve"}
      </button>
    </div>
  );
}
