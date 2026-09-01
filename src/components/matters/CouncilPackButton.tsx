"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FileStack, Check } from "lucide-react";
import { DOC_CLASSES, DOC_CLASS_LABELS } from "@/lib/councils";

/**
 * Merge this matter's documents into one council-ready PDF and download it
 * (Meeting 2 — the council wants a single file in a fixed order).
 *
 * PICKS ITS CLASSES SINCE 2026-09-01. Zewn to Jukka: "what I'm going to do for
 * the council pack is I'm going to say you can select whether you want input,
 * supporting, output, and other. And you can select multiple as well — like if
 * you need all the input documents and all the supporting documents, you can
 * tick those two and it'll pack those."
 *
 * It used to build everything on one click, which is right for a submission and
 * wrong for the other half of what it is used for — Jukka: "we still work with
 * documents manually … for filing purposes it's already correctly named."
 *
 * Input and supporting are ticked by default because that IS a submission: what
 * the council needs in order to act, plus the identity behind it. Output is what
 * ConveyClear produced and is not usually sent back to them.
 */
const DEFAULT_CLASSES = ["input", "supporting"];

/** The four groups the matter page shows, in the same order. */
const PACK_CLASSES: { key: string; label: string }[] = [
  ...DOC_CLASSES.map((c) => ({ key: c as string, label: DOC_CLASS_LABELS[c] })),
  { key: "other", label: "Other documents" },
];

export default function CouncilPackButton({ matterId }: { matterId: string }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<string[]>(DEFAULT_CLASSES);

  const toggle = (key: string) =>
    setClasses((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));

  async function build() {
    setBusy(true);
    try {
      const res = await fetch(`/api/matters/${matterId}/council-pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classes }),
      });
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
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the council pack");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Merge this matter's documents into one PDF, in council order"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line/30 px-3 py-1.5 text-sm font-medium text-action hover:bg-action-fill/5"
      >
        <FileStack className="h-4 w-4" /> Council pack (PDF)
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-line bg-raised p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Council pack</p>
      <p className="mt-0.5 text-xs text-ink-3">
        Which documents go in? One merged PDF, in council order.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PACK_CLASSES.map((c) => {
          const on = classes.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              aria-pressed={on}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset " +
                (on
                  ? "bg-action-tint text-action ring-action/30"
                  : "bg-surface text-ink-3 ring-line hover:text-ink-2")
              }
            >
              {on && <Check className="h-3 w-3" />}
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={build}
          disabled={busy || classes.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-action-fill px-3 py-1.5 text-sm font-medium text-white hover:bg-action-fill/90 disabled:opacity-50"
        >
          <FileStack className="h-4 w-4" /> {busy ? "Building…" : "Build pack"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2.5 py-1.5 text-sm text-ink-3 hover:text-ink"
        >
          Cancel
        </button>
        {classes.length === 0 && <span className="text-xs text-ink-3">Pick at least one.</span>}
      </div>
    </div>
  );
}
