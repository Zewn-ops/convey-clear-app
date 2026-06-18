"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { UploadCloud } from "lucide-react";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

// Direct-to-Storage upload: mints a signed upload URL, uploads the file straight
// to Supabase Storage from the browser (bypassing Vercel's 4.5 MB body limit),
// then records the documents row. Used by staff/partner on a matter.
export default function StorageUpload({
  matterId,
  documentType = "other",
  matterPartyId,
  label = "Upload document",
}: {
  matterId: string;
  documentType?: string;
  matterPartyId?: string;
  label?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    if (!ALLOWED.includes(file.type)) return toast.error("Only PDF, JPG, PNG, or WebP files");
    if (file.size > MAX_SIZE) return toast.error("File must be under 10 MB");
    setBusy(true);
    try {
      const r = await fetch("/api/documents/signed-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matter_id: matterId, file_name: file.name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not start the upload");

      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, file);
      if (upErr) throw new Error(upErr.message);

      const c = await fetch("/api/documents/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matter_id: matterId,
          storage_path: j.path,
          document_type: documentType,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          matter_party_id: matterPartyId,
        }),
      });
      const cj = await c.json();
      if (!c.ok) throw new Error(cj.message ?? "Could not record the document");

      toast.success("Document uploaded");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <UploadCloud className="h-4 w-4" /> {busy ? "Uploading…" : label}
      </button>
    </>
  );
}
