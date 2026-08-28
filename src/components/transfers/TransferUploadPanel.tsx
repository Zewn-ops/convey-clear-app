"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, X, Pencil, RotateCcw } from "lucide-react";
import {
  SUPPORTING_DOC_GROUPS,
  SUPPORTING_DOC_TYPES,
  partyRoleLabel,
  guessFromFileName,
} from "@/lib/transfer-doc-types";
import { buildDocumentName } from "@/lib/doc-naming";
import { docLabel } from "@/lib/prc-docs";

/**
 * Adding a supporting document to a property transfer.
 *
 * Zewn, 2026-08-28: *"improve the prop trf upload section to be fuller and more
 * visual and easy to use. maybe a section for the upload, a section for the name
 * of the upload and a section to select buyer related, seller related or
 * independant. then obviously the auto renaming."*
 *
 * 🔴 THE BUG THIS EXISTS TO FIX — the old row uploaded the file the INSTANT it
 * was chosen, using whatever the two dropdowns happened to be showing. So you
 * had to describe a document before you had picked it, which is backwards from
 * how anyone works, and getting it wrong meant a buyer's ID stored as a seller's
 * proof of address. Nothing here uploads until "Add document" is pressed.
 *
 * THE NAME IS SHOWN, NOT ASKED FOR. He asked for a name field AND auto-naming;
 * as an input those fight each other. So the generated name renders live and a
 * pencil turns it into an override — the naming discipline holds by default, and
 * anyone with a reason to deviate still can. It is built with the same
 * buildDocumentName() the server uses, so the preview cannot drift from what
 * actually gets stored.
 *
 * PARTY IS SEGMENTED, NOT A DROPDOWN. Three options: showing all three costs one
 * click instead of two, and a select for three things is a select for no reason.
 * Type stays a dropdown — twelve options in four groups is too many for buttons.
 */

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

const ROLES: { value: string; short: string }[] = [
  { value: "seller", short: "Seller" },
  { value: "buyer", short: "Buyer" },
  // Empty is a real answer, not a prompt: the offer to purchase and the
  // municipal account belong to the transaction rather than to either side.
  { value: "", short: "Neither" },
];

function prettySize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TransferUploadPanel({
  onUpload,
  busy,
  partyNames,
  nameSubject,
}: {
  /** Uploads and records. Resolves when done; rejects on failure. */
  onUpload: (file: File, type: string, role: string, displayName: string | null) => Promise<void>;
  busy: boolean;
  partyNames?: { seller?: string | null; buyer?: string | null };
  /** What the document is ABOUT — the property, or the firm's reference. */
  nameSubject?: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState(SUPPORTING_DOC_TYPES[0]);
  const [role, setRole] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** null = follow the generated name. A string = the user took it over. */
  const [nameOverride, setNameOverride] = useState<string | null>(null);

  const generated = file
    ? buildDocumentName({
        documentType: type,
        qualifier: role === "seller" ? "Seller" : role === "buyer" ? "Buyer" : null,
        subject: nameSubject ?? null,
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
    // A guess, offered before anything is saved — see guessFromFileName. It only
    // ever moves controls the uploader is looking at and can change.
    const g = guessFromFileName(f.name);
    if (g.type) setType(g.type);
    if (g.role) setRole(g.role);
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
    await onUpload(file, type, role, nameOverride);
    reset();
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
        // ── Step 1: the file. Nothing else is asked until there is one, because
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
          {/* The chosen file, with a way out. */}
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

          {/* ── Step 2: the two questions. Independent — a certified ID can be
              either party's, and an offer to purchase is neither — so folding
              them together would either lose an answer or triple the options. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              What is it?
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink focus:outline-none focus:ring-2 focus:ring-action disabled:opacity-50"
              >
                {SUPPORTING_DOC_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.types.map((t) => (
                      <option key={t} value={t}>
                        {docLabel(t)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Whose is it?
              <div className="mt-1.5 flex rounded-lg border border-line bg-surface p-0.5">
                {ROLES.map((r) => (
                  <button
                    key={r.value || "none"}
                    type="button"
                    onClick={() => setRole(r.value)}
                    disabled={busy}
                    title={partyRoleLabel(r.value || null, partyNames)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium normal-case tracking-normal transition-colors disabled:opacity-50 ${
                      role === r.value
                        ? "bg-action-fill text-white"
                        : "text-ink-2 hover:bg-raised"
                    }`}
                  >
                    {r.short}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Step 3: the name it will be stored under. */}
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
              // Not an input. It updates as the two answers above change, which
              // is also the clearest demonstration that those answers matter.
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
