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

// One FICA "subject" on a matter. A single-client matter has one (the matter's own
// client). A COO matter has one PER PARTY — buyer and seller are separate entities
// with separate details, consent and directors.
export interface FicaSubject {
  /** The party this subject came from, or null for the matter's own client. */
  partyId: string | null;
  label: string;
  /** null when the party has no clients record yet — nothing to capture against. */
  client: Client | null;
  consents: ConsentEvent[];
  directors: Director[];
  /** Entity type from the PARTY, so we can name what's missing before a client exists. */
  partyEntity?: string | null;
}

// In-place FICA capture — the client details and consent that, until now, only the
// /onboard link could collect.
//
// ⚠️ This renders PER SUBJECT, not per matter. The first cut keyed off the matter's
// own client, which is wrong for the service that matters most: a COO matter is
// party-centric — the buyer and the seller are the entities, and the matter itself
// often has no client row at all (16 of 28 in production). The intake sitting right
// below this is already party-aware; this now matches it.
export default function InPlaceFica({
  matterId,
  subjects,
  isStaff,
}: {
  matterId: string;
  subjects: FicaSubject[];
  isStaff: boolean;
}) {
  if (subjects.length === 0) return null;

  return (
    <Card accent="client">
      <div className="mb-1 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-[#1B2E6B]" />
        <h2 className="font-semibold text-gray-900">Client details &amp; consent</h2>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        The details and consent the onboarding link used to collect. Capture them here to complete the matter without
        sending one.
      </p>

      <div className="divide-y divide-gray-100">
        {subjects.map((s) => (
          <SubjectSection key={s.partyId ?? "matter-client"} matterId={matterId} subject={s} isStaff={isStaff} />
        ))}
      </div>
    </Card>
  );
}

function SubjectSection({
  matterId,
  subject,
  isStaff,
}: {
  matterId: string;
  subject: FicaSubject;
  isStaff: boolean;
}) {
  const { client, consents, directors: initialDirectors, label } = subject;
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

  // No clients record for this party yet — so there is nothing to hang details,
  // consent, directors or reusable documents on. Say so plainly and point at the
  // one button that fixes it, rather than rendering nothing and looking broken.
  // (In production, 0 of 28 parties were linked to a client — this was invisible.)
  if (!client) {
    const e = subject.partyEntity ?? "natural_person";
    const needsDirectors = e === "business" || e === "trust";
    return (
      <div className="flex items-start gap-2 py-3 text-xs">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-gray-600">
          <b className="text-gray-900">{label}</b> has no client record yet, so their details
          {needsDirectors ? ", directors" : ""} and consent can&apos;t be captured — and their FICA documents can&apos;t
          be reused across matters. Create one with <b>Contact</b> on the party above, then come back.
        </p>
      </div>
    );
  }

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
          // Target THIS subject's client — on a COO matter the buyer and the seller
          // are different clients, and the matter itself may have none.
          client_id: client!.id,
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
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900">{label}</h3>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            {entity === "business" ? "Business" : entity === "trust" ? "Trust" : "Individual"}
          </p>
        </div>
        {/* Capturing client details + consent is the action on this card, so it
            reads as a button. As a plain text link it was routinely missed, and
            an uncaptured party blocks the council pack. Once both are done the
            work is finished, so it steps back down to a quiet Review link. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={
            "shrink-0 rounded-lg text-xs font-medium transition-colors " +
            (open || (details.complete && consent.complete)
              ? "px-2 py-1 text-[#1B2E6B] hover:underline"
              : "bg-[#E8521A] px-3 py-1.5 text-white hover:bg-[#c94415]")
          }
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
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
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
              {directors.length === 0 && <p className="text-xs text-gray-500">None captured.</p>}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Consent</p>

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
    </div>
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
