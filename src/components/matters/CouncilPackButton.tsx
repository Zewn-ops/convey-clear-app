"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FileStack } from "lucide-react";

// Merge this matter's documents into one council-ready PDF and download it
// (Meeting 2 — council wants a single file in a fixed order). The route streams
// the PDF back; we turn it into a download without leaving the page.
export default function CouncilPackButton({ matterId }: { matterId: string }) {
  const [busy, setBusy] = useState(false);

  async function build() {
    setBusy(true);
    try {
      const res = await fetch(`/api/matters/${matterId}/council-pack`, { method: "POST" });
      if (!res.ok) {
        // Errors come back as JSON; a success is a PDF blob.
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "Could not build the council pack");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "council_pack.pdf";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Council pack downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the council pack");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={build}
      disabled={busy}
      title="Merge this matter's documents into one PDF, in council order"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line/30 px-3 py-1.5 text-sm font-medium text-action hover:bg-action-fill/5 disabled:opacity-50"
    >
      <FileStack className="h-4 w-4" /> {busy ? "Building…" : "Council pack (PDF)"}
    </button>
  );
}
