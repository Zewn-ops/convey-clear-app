"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { UploadCloud, FileText, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import { docLabel } from "@/lib/prc-docs";
import { formatDate } from "@/lib/utils";
import type { ClientDocument } from "@/types";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

// Reusable FICA doc types (Certified ID, COR14.3, PoA, ...). Uploaded once
// against the client, reused on any matter without re-uploading.
const VAULT_DOC_TYPES = [
  "id_certified",
  "cor_14_3",
  "letter_of_authority",
  "poa",
  "cipc_docs",
  "tax_clearance",
  "proof_of_address",
];

// The client-level FICA vault (migration 025). Staff upload a client's reusable
// documents here; every matter for the client can then reuse them in place.
export default function ClientVault({
  clientId,
  docs,
}: {
  clientId: string;
  docs: (ClientDocument & { url?: string })[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState(VAULT_DOC_TYPES[0]);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    if (!ALLOWED.includes(file.type)) return toast.error("Only PDF, JPG, PNG, or WebP files");
    if (file.size > MAX_SIZE) return toast.error("File must be under 10 MB");
    setBusy(true);
    try {
      const r = await fetch("/api/client-documents/signed-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, file_name: file.name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not start the upload");

      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, file);
      if (upErr) throw new Error(upErr.message);

      const c = await fetch("/api/client-documents/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          storage_path: j.path,
          document_type: docType,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }),
      });
      const cj = await c.json();
      if (!c.ok) throw new Error(cj.message ?? "Could not record the document");

      toast.success("Added to the vault");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-4 w-4 text-[#1B2E6B]" />
        <h2 className="font-semibold text-gray-900">FICA vault</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Reusable documents stored against this client — upload once, reuse on any matter without re-uploading.
      </p>

      {docs.length > 0 ? (
        <ul className="divide-y divide-gray-100 mb-4">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{docLabel(d.document_type)}</p>
                <p className="truncate text-xs text-gray-400">{d.file_name || "—"} · {formatDate(d.created_at)}</p>
              </div>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#1B2E6B] hover:underline shrink-0">
                  View
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400 mb-4">No documents in the vault yet.</p>
      )}

      <div className="flex items-end gap-2 border-t border-gray-100 pt-4">
        <label className="flex-1 text-xs font-medium text-gray-500">
          Document type
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
          >
            {VAULT_DOC_TYPES.map((t) => (
              <option key={t} value={t}>{docLabel(t)}</option>
            ))}
          </select>
        </label>
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B2E6B] px-3 py-2 text-sm font-medium text-white hover:bg-[#1B2E6B]/90 disabled:opacity-50"
        >
          <UploadCloud className="h-4 w-4" /> {busy ? "Uploading…" : "Add to vault"}
        </button>
      </div>
    </Card>
  );
}
