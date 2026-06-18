"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";

// B1 — inline rename of a document's display name (staff only).
export default function DocRenameButton({ documentId, current }: { documentId: string; current: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === current) return setEditing(false);
    setSaving(true);
    try {
      const res = await fetch("/api/documents/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId, name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not rename");
      toast.success("Renamed");
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button onClick={() => { setName(current); setEditing(true); }} className="text-gray-400 hover:text-[#1B2E6B] shrink-0" title="Rename">
        <Pencil className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 shrink-0">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        className="w-44 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B2E6B]"
      />
      <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-800" title="Save"><Check className="h-3.5 w-3.5" /></button>
      <button onClick={() => setEditing(false)} disabled={saving} className="text-gray-400 hover:text-gray-600" title="Cancel"><X className="h-3.5 w-3.5" /></button>
    </span>
  );
}
