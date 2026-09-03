"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { UploadCloud, FileText, X, Pencil, RotateCcw } from "lucide-react";
import SearchSelect from "@/components/ui/SearchSelect";
import { SUPPORTING_DOC_GROUPS, guessFromFileName } from "@/lib/transfer-doc-types";
import { buildDocumentName } from "@/lib/doc-naming";
import { docLabel } from "@/lib/prc-docs";
import { resolveDocClass } from "@/lib/doc-classes";
import { DOC_CLASS_LABELS } from "@/lib/councils";

/**
 * Adding a document to a MATTER, with the same three questions the property
 * transfer asks.
 *
 * Zewn, 2026-09-04: "add in the doc type and naming for document uploads like we
 * have on the prop trf page."
 *
 * 🔴 WHAT WAS THERE BEFORE. `StorageUpload` was a bare button: pick a file and it
 * went up as `document_type: "other"`, unnamed by the uploader and unattached to
 * any party. So every hand-uploaded matter document landed in the same undated
 * bucket — which is exactly why the admin page has an "Other documents" group
 * explaining that its contents were "filed before documents were split into
 * classes". They were not all historic. Some were made that morning, by this
 * button.
 *
 * The class a document files under is resolved from (council, type, party role)
 * — so a type that is never asked and a party that is never named means the
 * class can never be anything but the fallback. Asking the two questions is what
 * makes the three classes work on a matter at all.
 *
 * SHARED WITH THE TRANSFER PANEL BY DESIGN. Same doc-type vocabulary
 * (`SUPPORTING_DOC_GROUPS`), same filename guessing, same live name preview
 * built with the same `buildDocumentName` the server uses, same "files under"
 * line. Two panels that ask the same questions differently is how the transfer
 * and the matter ended up filing one deed search two ways (the 066 mistake, and
 * the reason the admin page's document card was rebuilt on 2026-09-01).
 *
 * WHAT DIFFERS, and only this: a transfer has a seller and a buyer as fixed
 * roles, while a matter has `matter_parties` rows — so "whose is it" is a list
 * of the actual parties on this matter, and the answer is a `matter_party_id`
 * rather than a role string.
 */

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

export interface UploadParty {
  id: string;
  role: string;
  name: string;
}

function prettySize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MatterUploadPanel({
  matterId,
  parties = [],
  municipality = null,
  nameSubject = null,
}: {
  matterId: string;
  /** The matter's parties, for "whose is it". Empty on a single-client matter. */
  parties?: UploadParty[];
  /** Decides which of input / supporting / output this document files under. */
  municipality?: string | null;
  /** What the document is ABOUT — the matter's property or its title. */
  nameSubject?: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState(SUPPORTING_DOC_GROUPS[0]?.types[0] ?? "other");
  const [partyId, setPartyId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** null = follow the generated name. A string = the user took it over. */
  const [nameOverride, setNameOverride] = useState<string | null>(null);

  const party = parties.find((p) => p.id === partyId) ?? null;

  const generated = file
    ? buildDocumentName({
        documentType: type,
        // The party's ROLE, not their name: "Certified ID — Seller — ERF 1234"
        // reads as a document, where the name would repeat what the party column
        // already says. Matches the transfer panel exactly.
        qualifier: party ? party.role.replace(/_/g, " ") : null,
        subject: nameSubject,
        originalFileName: file.name,
      })
    : "";

  function accept(f: File) {
    if (!ALLOWED.includes(f.type)) {
      setError("Only PDF, JPG, PNG or WebP files.");
      return;
    }
    if (f.size > MAX_SIZE) {
      setError("That file is over 10 MB.");
      return;
    }
    setError(null);
    setFile(f);
    // A guess, offered before anything is saved, in a control the uploader is
    // looking at and can change. One click to correct, two saved when right.
    const g = guessFromFileName(f.name);
    if (g.type) setType(g.type);
    if (g.role) {
      const match = parties.find((p) => p.role === g.role);
      if (match) setPartyId(match.id);
    }
    setNameOverride(null);
  }

  function reset() {
    setFile(null);
    setNameOverride(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!file) return;
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
      const { error: upErr } = await supabase.storage
        .from(j.bucket)
        .uploadToSignedUrl(j.path, j.token, file);
      if (upErr) throw new Error(upErr.message);

      const c = await fetch("/api/documents/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matter_id: matterId,
          storage_path: j.path,
          document_type: type,
          file_name: file.name,
          // Only when the uploader took the name over. Left out otherwise, so
          // the server's canonical naming stays the default rather than being
          // replaced by a preview that could drift from it.
          display_name: nameOverride ?? undefined,
          mime_type: file.type,
          size_bytes: file.size,
          matter_party_id: partyId || undefined,
        }),
      });
      const cj = await c.json();
      if (!c.ok) throw new Error(cj.message ?? "Could not record the document");

      toast.success("Document added.");
      reset();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-raised/40">
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) accept(f);
        }}
      />

      {!file ? (
        // Step 1: the file. Nothing else is asked until there is one, because
        // every other question is about a document that does not exist yet.
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) accept(f);
          }}
          className={`flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
            dragging ? "border-action bg-action-tint" : "border-line hover:border-line-strong hover:bg-raised"
          }`}
        >
          <UploadCloud className={`h-6 w-6 ${dragging ? "text-action" : "text-ink-3"}`} aria-hidden />
          <span className="text-sm font-semibold text-ink">
            {dragging ? "Drop it here" : "Drop a file, or browse"}
          </span>
          <span className="text-xs text-ink-3">PDF, JPG, PNG or WebP · up to 10 MB</span>
          {error && <span className="mt-1 text-xs font-medium text-danger">{error}</span>}
        </button>
      ) : (
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
            <FileText className="h-4 w-4 shrink-0 text-action" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-ink" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-ink-3">{prettySize(file.size)}</span>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-raised disabled:opacity-50"
              aria-label="Choose a different file"
              title="Choose a different file"
            >
              <X className="h-3.5 w-3.5 text-ink-3" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              What is it?
              <div className="mt-1.5 font-normal normal-case tracking-normal">
                <SearchSelect
                  value={type}
                  onChange={setType}
                  disabled={busy}
                  emptyLabel={null}
                  placeholder="Search documents…"
                  options={SUPPORTING_DOC_GROUPS.flatMap((g) =>
                    g.types.map((t) => ({ value: t, label: docLabel(t), hint: g.label }))
                  )}
                />
              </div>
            </div>

            {/* Only where there is a choice. A single-client matter has no
                parties, and a select with one option is a select for no
                reason — the document is simply the matter's. */}
            {parties.length > 0 && (
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Whose is it?
                <div className="mt-1.5 font-normal normal-case tracking-normal">
                  <SearchSelect
                    value={partyId}
                    onChange={setPartyId}
                    disabled={busy}
                    emptyLabel="Not party-specific"
                    placeholder="Search parties…"
                    options={parties.map((p) => ({
                      value: p.id,
                      label: p.name,
                      hint: p.role.replace(/_/g, " "),
                    }))}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Will be saved as
              </span>
              {nameOverride === null ? (
                <button
                  type="button"
                  onClick={() => setNameOverride(generated)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" /> Rename
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setNameOverride(null)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" /> Use the standard name
                </button>
              )}
            </div>

            {nameOverride === null ? (
              <p className="mt-1.5 break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink-2">
                {generated}
              </p>
            ) : (
              <input
                value={nameOverride}
                onChange={(e) => setNameOverride(e.target.value)}
                disabled={busy}
                autoFocus
                className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-action disabled:opacity-50"
              />
            )}
          </div>

          <p className="text-xs text-ink-3">
            Files under{" "}
            <span className="font-medium text-ink-2">
              {
                DOC_CLASS_LABELS[
                  resolveDocClass(
                    municipality,
                    type,
                    party?.role === "seller" || party?.role === "buyer" ? party.role : null
                  )
                ]
              }
            </span>
            .
          </p>

          {error && <p className="text-xs font-medium text-danger">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-3 hover:bg-raised disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-action-fill px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" /> {busy ? "Uploading…" : "Add document"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
