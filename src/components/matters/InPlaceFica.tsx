"use client";

import { useState } from "react";
import Link from "next/link";
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
import { councilPartyFieldKeys } from "@/lib/councils";

interface Director {
  full_name: string;
  surname: string;
  cell: string;
  work_number: string;
  email: string;
  designation: string;
  /** 079 — the one who represents the company. At most one per client. */
  is_representative?: boolean;
}

/**
 * §5.14 — Zewn, 2026-08-31: "for business entities, we need to make provisions
 * for up to 3 directors with the ability to select one of them as the
 * representative."
 *
 * Three SLOTS, not a hard limit. CIPC does not cap directors at three, so 079
 * deliberately puts no CHECK in the database — a form should offer what a form
 * should offer, and refusing a legitimate fourth director is a different thing
 * from not making room for one on screen.
 */
const SUGGESTED_DIRECTORS = 3;

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
  /**
   * 'seller' | 'buyer' | … — 080/§5.12. The council asks for the extra eTshwane
   * fields of the BUYER, not of both sides, so raising them to required without
   * the role would demand a marital status of the seller too.
   */
  partyRole?: string | null;
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
  municipality = null,
  serviceCode = null,
  prcStage = null,
  contact = null,
}: {
  matterId: string;
  subjects: FicaSubject[];
  isStaff: boolean;
  /** 080/§5.12 — which council, which service, which rates-clearance stage. */
  municipality?: string | null;
  serviceCode?: string | null;
  prcStage?: string | null;
  /**
   * The matter's client, shown as a contact strip above the capture list.
   *
   * Zewn, 2026-09-01: "this is also duplicated data in 2 sections please fix" —
   * a "Client" card carrying name / email / cell sat immediately above this one,
   * which opens by naming the same person and listing what is still missing from
   * their record. Two cards, one subject. The contact details moved in here
   * because this is the card that DOES something with them; the other was a
   * read-only restatement.
   */
  contact?: { name: string; email?: string | null; cell?: string | null; profileHref?: string | null } | null;
}) {
  // Party-based subjects now live INSIDE their own party card (PartiesCard), so
  // capturing a buyer's details is one continuous move from reading their name
  // rather than a scroll to a second card that repeats the same list of people.
  // What is left here is the matter's OWN client — the single-client services,
  // which have no party card to live in.
  const own = subjects.filter((s) => s.partyId === null);
  // On a COO the subjects are party-based and live in the party cards, so there
  // is nothing to capture here — but the contact strip is still this card's to
  // show, now that it absorbed the Client card. Only render nothing when there
  // is neither.
  if (own.length === 0 && !contact) return null;

  return (
    <Card accent="client">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-action" />
          <h2 className="font-semibold text-ink">{own.length ? "Client details & consent" : "Client"}</h2>
        </div>
        {contact?.profileHref && (
          <Link href={contact.profileHref} className="text-xs text-action hover:underline">
            View profile
          </Link>
        )}
      </div>
      {own.length > 0 && (
        <p className="mb-3 text-xs text-ink-3">
          The details and consent the onboarding link used to collect. Capture them here to complete the matter without
          sending one.
        </p>
      )}

      {contact && (
        <dl className="mb-3 grid grid-cols-1 gap-3 border-b border-line pb-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-3">Name</dt>
            <dd className="mt-0.5 font-medium text-ink">{contact.name}</dd>
          </div>
          {contact.email && (
            <div className="min-w-0">
              <dt className="text-xs text-ink-3">Email</dt>
              <dd className="mt-0.5 truncate text-ink">{contact.email}</dd>
            </div>
          )}
          {contact.cell && (
            <div>
              <dt className="text-xs text-ink-3">Cell</dt>
              <dd className="mt-0.5 text-ink">{contact.cell}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="divide-y divide-line">
        {own.map((s) => (
          <SubjectSection key={s.partyId ?? "matter-client"} matterId={matterId} subject={s} isStaff={isStaff} />
        ))}
      </div>
    </Card>
  );
}

export function SubjectSection({
  matterId,
  subject,
  isStaff,
  municipality = null,
  serviceCode = null,
  prcStage = null,
}: {
  matterId: string;
  subject: FicaSubject;
  isStaff: boolean;
  municipality?: string | null;
  serviceCode?: string | null;
  prcStage?: string | null;
}) {
  const { client, consents, directors: initialDirectors, label } = subject;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const entity = client?.entity_type ?? "natural_person";
  // §5.12 — the council may raise some of the optional extras to required for
  // THIS party, here. `councilPartyFieldKeys` returns nothing for a council
  // with no spec, or a party the sheet does not ask about, so the form is
  // unchanged everywhere except where a council actually demands more.
  const councilRequired = councilPartyFieldKeys(
    municipality,
    serviceCode,
    prcStage,
    subject.partyRole
  );
  const fields = visibleFicaFields(entity, isStaff, councilRequired);
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

    // The record is made from what the PARTY already holds, in place. This used
    // to be a dead end — "create one with Contact on the party above, then come
    // back" — which sent staff out of the capture they were in the middle of, to
    // do by hand something the party row already had every field for.
    const createRecord = async () => {
      setSaving(true);
      try {
        const r = await fetch("/api/fica/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matter_id: matterId, party_id: subject.partyId }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message ?? "Could not create the client record");
        toast.success("Client record created");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create the client record");
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="flex items-start gap-2 py-3 text-xs">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <div className="text-ink-2">
          <p>
            <b className="text-ink">{label}</b> has no client record yet, so their details
            {needsDirectors ? ", directors" : ""} and consent can&apos;t be captured — and their FICA
            documents can&apos;t be reused across matters.
          </p>
          {subject.partyId ? (
            <button
              type="button"
              onClick={createRecord}
              disabled={saving}
              className="mt-2 inline-flex items-center gap-1.5 rounded bg-action-fill px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create client record"}
            </button>
          ) : (
            <p className="mt-1">Add a client to this matter first.</p>
          )}
        </div>
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
          <h3 className="truncate text-sm font-semibold text-ink">{label}</h3>
          <p className="text-[11px] uppercase tracking-wide text-ink-3">
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
              ? "px-2 py-1 text-action hover:underline"
              : "bg-action-fill px-3 py-1.5 text-white hover:opacity-90")
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
        <p className="mt-2 text-xs text-ink-3">
          Missing: {details.missing.map((f) => f.label).join(", ")}.
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-5 border-t border-line pt-4">
          {/* ------------------------------------------------------------ details */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label
                key={f.key}
                className={f.type === "textarea" ? "sm:col-span-2 text-xs font-medium text-ink-3" : "text-xs font-medium text-ink-3"}
              >
                <span className="flex items-center gap-1">
                  {f.label}
                  {f.required && <span className="text-action">*</span>}
                  {f.sensitive && <ShieldAlert className="h-3 w-3 text-amber-500" aria-label="Staff only" />}
                </span>
                {f.type === "textarea" ? (
                  <textarea
                    rows={2}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.hint}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
                  />
                ) : f.type === "select" ? (
                  // 080 — ID type and marital status are closed lists on the
                  // council's own form. A free-text value would pass capture
                  // here and fail at submission to the portal, which is the
                  // worst place to find out.
                  <select
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
                  >
                    <option value="">— Not captured —</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.key === "municipal_password" ? "password" : (f.type ?? "text")}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.hint}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
                  />
                )}
              </label>
            ))}
          </div>

          {/* ---------------------------------------------------------- directors */}
          {isEntity && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  {entity === "trust" ? "Trustees" : "Directors"}
                  {directors.length > SUGGESTED_DIRECTORS && (
                    <span className="ml-1.5 font-normal normal-case tracking-normal text-ink-3">
                      ({directors.length})
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDirectors((d) => [
                      ...d,
                      { full_name: "", surname: "", cell: "", work_number: "", email: "", designation: "" },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              {directors.length === 0 && <p className="text-xs text-ink-3">None captured.</p>}

              {/* 079 — which one represents the company. Said here rather than
                  left implicit, because the portal has always asked for the
                  "Representative's Certified ID" without recording who that
                  is, and the answer changes whose documents are wanted. */}
              {entity === "business" && directors.length > 0 && (
                <p className="mb-2 text-xs text-ink-3">
                  Mark the one who represents the company. Their certified ID and
                  proof of residence are the ones asked for.
                </p>
              )}
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
                          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-action"
                        />
                      ))}
                    </div>
                    {entity === "business" && (
                      // A radio, not a checkbox: 079's partial unique index
                      // allows one representative per client, and a control
                      // that lets you tick two would be offering something the
                      // database refuses. Clicking the marked one clears it,
                      // because "no representative chosen yet" is a real state.
                      <label
                        className="mt-1 flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-3"
                        title="The director who represents the company"
                      >
                        <input
                          type="radio"
                          name="representative"
                          checked={Boolean(d.is_representative)}
                          onChange={() =>
                            setDirectors((ds) =>
                              ds.map((x, j) => ({ ...x, is_representative: j === i }))
                            )
                          }
                          onClick={() => {
                            if (d.is_representative) {
                              setDirectors((ds) =>
                                ds.map((x) => ({ ...x, is_representative: false }))
                              );
                            }
                          }}
                          className="accent-[var(--cc-action)]"
                        />
                        Rep
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => setDirectors((ds) => ds.filter((_, j) => j !== i))}
                      className="mt-1 shrink-0 text-ink-3 hover:text-red-600"
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
          <div className="rounded-lg bg-raised shadow-sm dark:ring-1 dark:ring-line/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Consent</p>

            {portalConsent ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The client gave consent themselves through the portal. That is the strongest record there is —
                nothing to do here, and it should not be overwritten.
              </p>
            ) : (
              <>
                <p className="mt-1.5 text-xs text-ink-3">
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
                    <label className="block text-xs font-medium text-ink-3">
                      How was consent obtained? <span className="text-action">*</span>
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value as CaptureMethod)}
                        className="mt-1 w-full rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
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
                    <label className="block text-xs font-medium text-ink-3">
                      Reference / note
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. signed FICA pack dated 12 July, on file"
                        className="mt-1 w-full rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
                      />
                    </label>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-ink-3 hover:text-ink">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:bg-action-fill/90 disabled:opacity-50"
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
    <span className={`inline-flex items-center gap-1 font-medium ${ok ? "text-green-600" : "text-ink-3"}`}>
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
    <label className="flex items-start gap-2 text-xs text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 rounded border-line text-action focus:ring-action"
      />
      <span>
        {label}
        {required && <span className="ml-0.5 text-action">*</span>}
      </span>
    </label>
  );
}
