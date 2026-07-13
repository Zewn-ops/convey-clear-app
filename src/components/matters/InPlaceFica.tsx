"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ClipboardCheck, CheckCircle2, AlertTriangle, Plus, X, ShieldAlert } from "lucide-react";
import Card from "@/components/ui/Card";
import {
  visibleFicaFields,
  detailsStatus,
  consentStatus,
  CAPTURE_METHODS,
  REQUIRED_CONSENTS,
  type ConsentEvent,
  type CaptureMethod,
} from "@/lib/fica";
import type { Client } from "@/types";

interface Director {
  full_name: string;
  surname: string;
  cell: string;
  work_number: string;
  email: string;
  designation: string;
}

// In-place FICA capture — the client details and consent that, until now, only the
// /onboard link could collect. With this, staff or the attorney firm can complete
// a matter end to end without sending a link; /onboard becomes the self-serve
// option rather than the only path that actually finishes a matter.
export default function InPlaceFica({
  matterId,
  client,
  consents,
  directors: initialDirectors,
  isStaff,
}: {
  matterId: string;
  client: Client | null;
  consents: ConsentEvent[];
  directors: Director[];
  isStaff: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const entity = client?.entity_type ?? "natural_person";
  const fields = visibleFicaFields(entity, isStaff);
  const details = detailsStatus(client, entity);
  const consent = consentStatus(consents);
  const isEntity = entity === "business" || entity === "trust";

  const [form, setForm] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of fields) {
      const v = client ? (client as unknown as Record<string, unknown>)[f.key] : null;
      seed[f.key] = v == null ? "" : String(v);
    }
    return seed;
  });

  const [directors, setDirectors] = useState<Director[]>(initialDirectors);
  const [popia, setPopia] = useState(Boolean(consent.latest.popia?.granted));
  const [terms, setTerms] = useState(Boolean(consent.latest.terms?.granted));
  const [marketing, setMarketing] = useState(Boolean(consent.latest.marketing?.granted));
  const [method, setMethod] = useState<CaptureMethod | "">("");
  const [note, setNote] = useState("");

  // Consent already given by the client through the portal is the stronger record.
  // Don't let staff overwrite it with a weaker, staff-attested one.
  const portalConsent = REQUIRED_CONSENTS.every((t) => consent.clientGiven(t));
  const consentChanged =
    popia !== Boolean(consent.latest.popia?.granted) ||
    terms !== Boolean(consent.latest.terms?.granted) ||
    marketing !== Boolean(consent.latest.marketing?.granted);

  if (!client) return null;

  async function save() {
    if (consentChanged && (popia || terms || marketing) && !method) {
      return toast.error("Record how the client gave consent — it can't be ticked on their behalf.");
    }

    setSaving(true);
    try {
      const r = await fetch("/api/fica/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matter_id: matterId,
          details: form,
          directors: isEntity ? directors : undefined,
          consents: consentChanged
            ? { popia, terms, marketing, capture_method: method || undefined, note: note || undefined }
            : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not save");
      toast.success("FICA details saved");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-[#1B2E6B]" />
          <h2 className="font-semibold text-gray-900">Client details &amp; consent</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-xs font-medium text-[#1B2E6B] hover:underline"
        >
          {open ? "Close" : details.complete && consent.complete ? "Review" : "Complete now"}
        </button>
      </div>

      {/* Status line — the two thirds of FICA the document checklist never covered. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <StatusChip
          ok={details.complete}
          label={details.complete ? "Details complete" : `Details ${details.held}/${details.total}`}
        />
        <StatusChip
          ok={consent.complete}
          label={consent.complete ? (portalConsent ? "Consent — given by client" : "Consent — on file") : "Consent outstanding"}
        />
      </div>

      {!details.complete && !open && (
        <p className="mt-2 text-xs text-gray-500">
          Missing: {details.missing.map((f) => f.label).join(", ")}.
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-5 border-t border-gray-100 pt-4">
          {/* ------------------------------------------------------------ details */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label
                key={f.key}
                className={f.type === "textarea" ? "sm:col-span-2 text-xs font-medium text-gray-500" : "text-xs font-medium text-gray-500"}
              >
                <span className="flex items-center gap-1">
                  {f.label}
                  {f.required && <span className="text-[#E8521A]">*</span>}
                  {f.sensitive && <ShieldAlert className="h-3 w-3 text-amber-500" aria-label="Staff only" />}
                </span>
                {f.type === "textarea" ? (
                  <textarea
                    rows={2}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.hint}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
                  />
                ) : (
                  <input
                    type={f.key === "municipal_password" ? "password" : (f.type ?? "text")}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.hint}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
                  />
                )}
              </label>
            ))}
          </div>

          {/* ---------------------------------------------------------- directors */}
          {isEntity && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {entity === "trust" ? "Trustees" : "Directors"}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDirectors((d) => [
                      ...d,
                      { full_name: "", surname: "", cell: "", work_number: "", email: "", designation: "" },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1B2E6B] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              {directors.length === 0 && <p className="text-xs text-gray-400">None captured.</p>}
              <div className="space-y-2">
                {directors.map((d, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
                      {(
                        [
                          ["full_name", "First name(s)"],
                          ["surname", "Surname"],
                          ["email", "Email"],
                          ["cell", "Cell"],
                          ["work_number", "Work number"],
                          ["designation", "Designation"],
                        ] as const
                      ).map(([k, ph]) => (
                        <input
                          key={k}
                          placeholder={ph}
                          value={d[k]}
                          onChange={(e) =>
                            setDirectors((ds) => ds.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
                          }
                          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1B2E6B]"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDirectors((ds) => ds.filter((_, j) => j !== i))}
                      className="mt-1 shrink-0 text-gray-300 hover:text-red-600"
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ consent */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Consent</p>

            {portalConsent ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The client gave consent themselves through the portal. That is the strongest record there is —
                nothing to do here, and it should not be overwritten.
              </p>
            ) : (
              <>
                <p className="mt-1.5 text-xs text-gray-500">
                  You are <b>recording</b> consent the client has already given, not giving it for them. Say how it was
                  obtained — it is stored against your name.
                </p>

                <div className="mt-2 space-y-1.5">
                  <Tick checked={popia} onChange={setPopia} label="POPIA — consent to process personal information" required />
                  <Tick checked={terms} onChange={setTerms} label="Terms of service accepted" required />
                  <Tick checked={marketing} onChange={setMarketing} label="Marketing communications (optional)" />
                </div>

                {(popia || terms || marketing) && (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-medium text-gray-500">
                      How was consent obtained? <span className="text-[#E8521A]">*</span>
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value as CaptureMethod)}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
                      >
                        <option value="">Select…</option>
                        {CAPTURE_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {method === "verbal" && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Verbal consent is the weakest record you can hold. Follow it up with something written.
                      </p>
                    )}
                    <label className="block text-xs font-medium text-gray-500">
                      Reference / note
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. signed FICA pack dated 12 July, on file"
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
                      />
                    </label>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-gray-500 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-lg bg-[#1B2E6B] px-4 py-2 text-sm font-medium text-white hover:bg-[#1B2E6B]/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${ok ? "text-green-600" : "text-gray-500"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      {label}
    </span>
  );
}

function Tick({
  checked,
  onChange,
  label,
  required,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-[#1B2E6B] focus:ring-[#1B2E6B]"
      />
      <span>
        {label}
        {required && <span className="ml-0.5 text-[#E8521A]">*</span>}
      </span>
    </label>
  );
}
