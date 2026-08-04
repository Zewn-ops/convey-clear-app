"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Trash2, Check, X } from "lucide-react";

// Remove a document from a matter. Same inline-confirm shape as DocRenameButton
// rather than window.confirm — a browser modal in the middle of an intake list is
// jarring, and this keeps the confirmation next to the row it applies to.
//
// The route decides what "remove" actually means: a document borrowed from the
// client vault or a transfer is only detached from this matter, while a file the
// matter owns is deleted properly once nothing else points at it.
export default function DocRemoveButton({
  documentId,
  fileName,
}: {
  documentId: string;
  fileName?: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not remove the document");
      toast.success(json.detached_only ? "Removed from this matter" : "Document removed");
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="shrink-0 text-gray-500 hover:text-red-600"
        title={fileName ? `Remove ${fileName}` : "Remove document"}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="text-xs text-gray-500">Remove?</span>
      <button
        onClick={remove}
        disabled={busy}
        className="text-red-600 hover:text-red-700 disabled:opacity-50"
        title="Confirm removal"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="text-gray-500 hover:text-gray-600 disabled:opacity-50"
        title="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
