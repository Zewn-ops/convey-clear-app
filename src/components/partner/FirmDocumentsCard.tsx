"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import { FileText, Upload, Check } from "lucide-react";
import { FIRM_DOC_TYPES, firmDocLabel } from "@/lib/firm-docs";

export interface FirmDocumentRow {
  id: string;
  document_type: string;
  file_name: string | null;
  created_at: string;
}

/**
 * The firm's own documents (073).
 *
 * Both City of Tshwane and City of Ekurhuleni ask a conveyancing firm for the
 * same short list ONCE, rather than per transaction — which is the whole point:
 * captured here, an attorney never re-supplies the firm's fidelity fund
 * certificate on an application again (§11.3).
 *
 * Every type is listed whether or not it is held, so the card answers "what is
 * still missing" rather than only showing what happens to be there. PRODUCT.md
 * principle 5 — an empty state explains why it is empty and offers the action
 * that fills it.
 */
export default function FirmDocumentsCard({
  documents,
}: {
  documents: FirmDocumentRow[];
}) {
  const router = useRouter();
  const [docType, setDocType] = useState("");
  const [busy, setBusy] = useState(false);

  const held = new Map(documents.map((d) => [d.document_type, d]));

  const upload = async (file: File) => {
    if (!docType) return toast.error("Choose which document this is first.");
    setBusy(true);
    try {
      // Two steps, the client vault's pattern: mint a signed URL, upload
      // straight to storage, then record the row. File bytes never pass
      // through the app server.
      const signRes = await fetch("/api/partner/firm/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_type: docType, file_name: file.name }),
      });
      const sign = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(sign.message ?? "Could not start the upload");

      const put = await fetch(sign.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("The file did not reach storage.");

      const confirmRes = await fetch("/api/partner/firm/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_type: docType,
          storage_path: sign.path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        }),
      });
      const confirm = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok) throw new Error(confirm.message ?? "Could not record the document");

      toast.success(`${firmDocLabel(docType)} uploaded`);
      setDocType("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-action" />
        <h2 className="font-semibold text-ink">Firm documents</h2>
      </div>
      <p className="text-xs text-ink-3 -mt-2">
        What the councils ask for from your firm. Uploaded once here, then used
        on every application — you should not have to attach these again.
      </p>

      <div className="space-y-2">
        {FIRM_DOC_TYPES.map((t) => {
          const doc = held.get(t.code);
          return (
            <div
              key={t.code}
              className="flex items-start justify-between gap-3 rounded-[10px] border border-line bg-raised px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink flex items-center gap-1.5">
                  {doc && <Check className="h-3.5 w-3.5 text-ok" aria-hidden />}
                  {t.label}
                </p>
                <p className="truncate text-xs text-ink-3">
                  {doc
                    ? `${doc.file_name ?? "Uploaded"} · ${new Date(
                        doc.created_at
                      ).toLocaleDateString("en-ZA")}`
                    : t.hint ?? "Not uploaded"}
                </p>
              </div>
              <span className="shrink-0 mono text-[10px] font-bold uppercase tracking-[0.11em] text-ink-3">
                {t.askedBy.join(" · ")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <Select
          label="Document"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          options={[
            { value: "", label: "— Select —" },
            ...FIRM_DOC_TYPES.map((t) => ({ value: t.code, label: t.label })),
          ]}
        />
        <label
          className={`inline-flex items-center justify-center gap-2 rounded border border-line px-3 py-2 text-sm font-medium ${
            docType && !busy
              ? "cursor-pointer text-ink-2 hover:bg-raised"
              : "cursor-not-allowed text-ink-3 opacity-60"
          }`}
        >
          <Upload className="h-4 w-4" />
          {busy ? "Uploading…" : "Choose a file"}
          {/* The input is INSIDE the label and only rendered when a type is
              chosen. A label with no input is a cursor-pointer that does
              nothing — the exact defect f05466b fixed on the transfer tiles. */}
          {docType && !busy && (
            <input
              type="file"
              className="hidden"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          )}
        </label>
      </div>
    </Card>
  );
}
