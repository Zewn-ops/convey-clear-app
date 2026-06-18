"use client";

import { useState, useRef, useCallback } from "react";
import Button from "@/components/ui/Button";
import { cn, formatBytes } from "@/lib/utils";
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  Lock,
  AlertCircle,
  ShieldCheck,
  Plus,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import type { TokenData } from "./page";
import { PERSON_INDUSTRIES, PERSON_DESIGNATIONS } from "@/lib/conveyclear-lists";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Document metadata — labels/hints per doc-type code (from services.config
// required_documents). Unknown codes fall back to the raw code.
// ---------------------------------------------------------------------------
export const DOC_META: Record<string, { label: string; hint: string }> = {
  id: { label: "South African ID Document", hint: "Green ID book, Smart ID card, or Passport" },
  id_certified: { label: "Certified ID Document", hint: "Certified copy — not older than 3 months" },
  id_directors: { label: "Directors' ID Documents", hint: "ID for all directors — one PDF if multiple" },
  id_certified_director: { label: "Director's Certified ID", hint: "Certified copy of the authorised director's ID" },
  id_certified_representative: { label: "Representative's Certified ID", hint: "Certified copy of the authorised representative's ID" },
  por: { label: "Proof of Residence", hint: "Utility bill or bank statement — not older than 3 months" },
  proof_of_address: { label: "Proof of Address", hint: "Utility bill or bank statement — not older than 3 months" },
  tc: { label: "Tax Clearance Certificate", hint: "Valid SARS tax clearance certificate" },
  tax_clearance: { label: "Tax Clearance Certificate", hint: "Valid SARS tax clearance certificate" },
  poa: { label: "Power of Attorney", hint: "Signed and dated power of attorney" },
  poa_signed: { label: "Signed Power of Attorney", hint: "Download, sign, and re-upload" },
  board_resolution: { label: "Board Resolution", hint: "Signed resolution authorising this application (from MOI)" },
  company_reg: { label: "Company Registration (CIPC)", hint: "CIPC registration certificate (COR14.3 or similar)" },
  cipc_docs: { label: "CIPC Documents", hint: "Company registration documents" },
  cor14_3: { label: "COR14.3 Certificate", hint: "CIPC registration certificate" },
  letter_of_authority: { label: "Letter of Authority", hint: "Master's letter of authority (trusts)" },
  cor_14_3: { label: "COR 14.3 Certificate", hint: "Company registration certificate (business entities)" },
  memo_screenshot: { label: "Screenshot of Memo Requested", hint: "COT — proof the clearance memo was requested" },
  cqi_screenshot: { label: "Screenshot of Clearance Query Issue (CQI)", hint: "The lodged clearance query" },
  water_meter_reading: { label: "Water Meter Reading", hint: "Optional — current water meter reading" },
  electricity_meter_reading: { label: "Electricity Meter Reading", hint: "Optional — current electricity meter reading" },
  council_account_statement: { label: "Council Existing Account Statement", hint: "Current municipal account statement" },
  transfer_letter: { label: "Transfer Confirmation Letter", hint: "From the conveyancing attorney" },
  deed_search: { label: "Deed Search", hint: "Recent deed search for the property" },
  clearance_figures: { label: "Clearance Figures", hint: "Municipal rates clearance figures" },
  id_certified_trustee: { label: "Trustee's Certified ID", hint: "Certified copy of the authorised trustee's ID" },
  proof_of_application: { label: "Proof of Application", hint: "Proof a rates clearance application was lodged (if applicable)" },
  proof_of_payment_figures: { label: "Proof of Payment (Figures)", hint: "Receipt for the rates clearance figures payment (if applicable)" },
  proof_of_payment_clearance: { label: "Proof of Payment (Clearance)", hint: "COJ — payment proof for clearance figures" },
  electrical_coc: { label: "Electrical CoC", hint: "COE — electrical certificate of compliance" },
  rates_account: { label: "Municipal Rates Account", hint: "Most recent council rates account statement" },
  building_plans: { label: "Existing Building Plans", hint: "Approved building plans (if you have them)" },
  municipal_account_latest: { label: "Latest Municipal Account", hint: "Full current municipal account statement" },
  dispute_evidence: { label: "Dispute Evidence", hint: "Correspondence, photos, meter readings supporting the dispute" },
  // Change-of-ownership doc types (see migration 014 + COO_Research.md)
  deed_of_sale: { label: "Deed of Sale / Offer to Purchase", hint: "Signed sale agreement / proof of ownership transfer" },
  coc_electrical: { label: "Electrical Certificate of Compliance", hint: "Valid electrical COC for the property/unit" },
  certificate_of_occupation: { label: "Certificate of Occupation", hint: "For new connections only" },
  registration_letter: { label: "Registration Letter", hint: "Attorney letter confirming transfer registration" },
  rates_clearance_figures: { label: "Rates Clearance Figures", hint: "Municipal s118 clearance figures statement" },
  rates_clearance_certificate: { label: "Rates Clearance Certificate", hint: "Issued s118 clearance certificate" },
  consumer_agreement: { label: "Consumer Agreement", hint: "Completed municipal account-application form" },
  service_application: { label: "Municipal Service Application", hint: "Completed municipal service application form" },
};

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

export type DocSlotState = { file: File | null; notAvailable: boolean; reason: string };
type FormState = Record<string, DocSlotState>;

interface OnboardFormProps {
  token: string;
  data: TokenData;
  /** kept for compatibility; submission now goes through /api/onboard/submit */
  submitUrl?: string;
}

type Director = {
  full_name: string;
  surname: string;
  cell: string;
  work_number: string;
  email: string;
  designation: string;
};

const STAGES = ["Details", "Documents", "Consent", "Review"] as const;
type Stage = number; // 0..3

// ---------------------------------------------------------------------------
// Reusable upload slot (unchanged behaviour from the original form)
// ---------------------------------------------------------------------------
export function DocSlot({
  docType,
  allowNotAvailable,
  state,
  onChange,
  templateUrl,
}: {
  docType: string;
  allowNotAvailable: boolean;
  state: DocSlotState;
  onChange: (next: Partial<DocSlotState>) => void;
  templateUrl?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = DOC_META[docType] ?? { label: docType, hint: "" };

  const handleFile = useCallback(
    (f: File) => {
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast.error("Only PDF, JPG, PNG, or WebP files are allowed");
        return;
      }
      if (f.size > MAX_SIZE) {
        toast.error("File must be under 10 MB");
        return;
      }
      onChange({ file: f, notAvailable: false });
    },
    [onChange]
  );

  const isComplete = state.file !== null || (state.notAvailable && state.reason.trim().length > 0);

  return (
    <div className={cn("rounded-xl border bg-white shadow-sm transition-all", isComplete ? "border-green-200" : "border-gray-200")}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isComplete ? (
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
              )}
              <span className="text-sm font-medium text-gray-900">{meta.label}</span>
            </div>
            {meta.hint && <p className="mt-0.5 ml-6 text-xs text-gray-400">{meta.hint}</p>}
            {templateUrl && (
              <a href={templateUrl} target="_blank" rel="noopener noreferrer" className="mt-1 ml-6 inline-flex items-center gap-1 text-xs text-[#1B2E6B] hover:underline">
                Download template →
              </a>
            )}
          </div>
          {allowNotAvailable && !state.file && (
            <button
              type="button"
              onClick={() => onChange({ notAvailable: !state.notAvailable, file: null })}
              className={cn(
                "shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors",
                state.notAvailable ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              )}
            >
              {state.notAvailable ? "Upload instead" : "Not available"}
            </button>
          )}
        </div>

        {state.notAvailable ? (
          <div className="ml-6 space-y-2">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Please briefly explain why this document is not currently available.
            </p>
            <textarea
              value={state.reason}
              onChange={(e) => onChange({ reason: e.target.value })}
              placeholder="e.g. Tax clearance expired — renewal submitted to SARS"
              rows={2}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] focus:border-transparent",
                state.reason.trim() ? "border-gray-300" : "border-amber-300"
              )}
            />
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "ml-6 relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors cursor-pointer py-5 px-4 text-center",
              state.file ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-[#E8521A] hover:bg-orange-50"
            )}
          >
            <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {state.file ? (
              <>
                <FileText className="h-6 w-6 text-green-600" />
                <div>
                  <p className="text-xs font-medium text-green-800">{state.file.name}</p>
                  <p className="text-xs text-green-600">{formatBytes(state.file.size)}</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); onChange({ file: null }); if (fileRef.current) fileRef.current.value = ""; }}
                  className="absolute top-2 right-2 rounded-full bg-white p-0.5 shadow text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-600">Click or drag file here</p>
                  <p className="text-xs text-gray-400">PDF, JPG, PNG — max 10 MB</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small field primitives
// ---------------------------------------------------------------------------
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">
        {label} {required && <span className="text-[#E8521A]">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] focus:border-transparent";

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------
export default function OnboardForm({ token, data }: OnboardFormProps) {
  const isBusiness = data.entity_type === "business";

  const requiredDocs = (data.service_config.required_documents[data.entity_type] ?? []).filter(
    (d) => d !== "popia_consent"
  );
  const allowNotAvailable = data.service_config.documents_allow_not_available ?? false;

  // ---- details state (prefilled from the existing client record) ----
  // Client stores one full_name; split last word as surname for the two fields.
  const splitName = (full: string | null | undefined) => {
    const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
    return { first: parts[0] ?? "", last: "" };
  };
  const nm = isBusiness ? { first: "", last: "" } : splitName(data.client_name);
  const [details, setDetails] = useState({
    full_name: nm.first,
    surname: nm.last,
    business_name: isBusiness ? (data.client_name ?? "") : "",
    registration_no: data.registration_no ?? "",
    cell: data.primary_cell ?? "",
    email: data.primary_email ?? "",
    id_number: data.id_number ?? "",
    home_address: data.physical_address ?? "",
    industry: "",
    designation: "",
    municipal_username: "",
    municipal_password: "",
  });
  const setField = (k: keyof typeof details, v: string) => setDetails((p) => ({ ...p, [k]: v }));

  const [directors, setDirectors] = useState<Director[]>([]);
  const addDirector = () =>
    setDirectors((p) => [...p, { full_name: "", surname: "", cell: "", work_number: "", email: "", designation: "" }]);
  const updateDirector = (i: number, k: keyof Director, v: string) =>
    setDirectors((p) => p.map((d, idx) => (idx === i ? { ...d, [k]: v } : d)));
  const removeDirector = (i: number) => setDirectors((p) => p.filter((_, idx) => idx !== i));

  // ---- documents state ----
  const [docStates, setDocStates] = useState<FormState>(() =>
    Object.fromEntries(requiredDocs.map((d) => [d, { file: null, notAvailable: false, reason: "" }]))
  );
  const updateDoc = useCallback((docType: string, next: Partial<DocSlotState>) => {
    setDocStates((prev) => ({ ...prev, [docType]: { ...prev[docType], ...next } }));
  }, []);

  // ---- consents ----
  const [popia, setPopia] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // ---- flow ----
  const [stage, setStage] = useState<Stage>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const docsComplete = requiredDocs.filter((d) => {
    const s = docStates[d];
    return s.file !== null || (s.notAvailable && s.reason.trim().length > 0);
  }).length;

  const detailsValid = isBusiness
    ? details.business_name.trim() && details.registration_no.trim() && details.full_name.trim() && details.cell.trim() && details.email.trim() && details.id_number.trim()
    : details.full_name.trim() && details.surname.trim() && details.cell.trim() && details.email.trim() && details.id_number.trim();

  const stageValid: Record<number, boolean> = {
    0: Boolean(detailsValid),
    1: docsComplete === requiredDocs.length,
    2: popia && terms,
    3: confirmed,
  };

  const handleSubmit = async () => {
    if (!stageValid[2] || !confirmed) {
      toast.error("Please complete all required fields and consents.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const fica = {
      entity_type: data.entity_type,
      details,
      directors,
      consents: { popia, terms, marketing },
    };

    try {
      const supabase = createBrowserSupabase();
      const uploaded: {
        storage_path: string;
        document_type: string;
        file_name: string;
        mime_type: string;
        size_bytes: number;
      }[] = [];
      const notAvailable: { document_type: string; reason: string }[] = [];

      // Upload each file DIRECTLY to Supabase Storage via a token-authed signed
      // URL (bypasses Vercel's 4.5 MB body limit — no more routing through n8n).
      for (const [docType, s] of Object.entries(docStates)) {
        if (s.file) {
          const r = await fetch("/api/onboard/signed-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, file_name: s.file.name }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.message ?? "Could not start the upload");
          const { error: upErr } = await supabase.storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, s.file);
          if (upErr) throw new Error(upErr.message);
          uploaded.push({
            storage_path: j.path,
            document_type: docType,
            file_name: s.file.name,
            mime_type: s.file.type,
            size_bytes: s.file.size,
          });
        } else if (s.notAvailable && s.reason.trim()) {
          notAvailable.push({ document_type: docType, reason: s.reason.trim() });
        }
      }

      // Record documents + FICA fields + mark the link used.
      const res = await fetch("/api/onboard/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          matter_id: data.matter_id,
          entity_type: data.entity_type,
          fica,
          documents: uploaded,
          not_available: notAvailable,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? `Server error (${res.status})`);

      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- success screen ----
  if (submitted) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center">
          <img src="/conveyclear-logo.png" alt="ConveyClear" className="h-10 w-auto" />
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-5 h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Onboarding Submitted</h1>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              Thank you, <strong>{data.client_name}</strong>. Your details and FICA documents for your{" "}
              <strong>{data.service_name}</strong> application have been securely received. Our team will be in touch shortly.
            </p>
          </div>
        </div>
        <footer className="py-4 text-center border-t border-gray-100">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5 text-[#1B2E6B]" />
            <span>POPIA Compliant · South Africa</span>
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 shadow-sm px-6 py-3 sticky top-0 z-10 flex items-center">
        <img src="/conveyclear-logo.png" alt="ConveyClear" className="h-10 w-auto" />
      </header>

      <div className="flex-1 w-full max-w-xl mx-auto px-4 py-8 space-y-5">
        {/* Stage indicator */}
        <div className="flex items-center justify-between">
          {STAGES.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold",
                i < stage ? "bg-green-500 text-white" : i === stage ? "bg-[#1B2E6B] text-white" : "bg-gray-200 text-gray-500")}>
                {i < stage ? "✓" : i + 1}
              </div>
              <span className={cn("text-xs hidden sm:block", i === stage ? "text-gray-900 font-medium" : "text-gray-400")}>{label}</span>
            </div>
          ))}
        </div>

        {/* Welcome (stage 0 only) */}
        {stage === 0 && (
          <div className="rounded-xl bg-[#1B2E6B] text-white p-6">
            <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-1">{data.service_name}</p>
            <h1 className="text-xl font-semibold mb-2">Welcome, {data.client_name}</h1>
            <p className="text-blue-100 text-sm leading-relaxed">
              Let&apos;s get your application set up. We&apos;ll capture your details, collect your FICA documents,
              and record your consents. Your information is handled per POPIA.
            </p>
          </div>
        )}

        {/* STAGE 0 — DETAILS */}
        {stage === 0 && (
          <div className="space-y-3">
            {isBusiness ? (
              <>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-700">Business / Trust</h2>
                  <Field label="Business / Trust name (as per CIPC)" required>
                    <input className={inputCls} value={details.business_name} onChange={(e) => setField("business_name", e.target.value)} />
                  </Field>
                  <Field label="Registration / IT number" required>
                    <input className={inputCls} value={details.registration_no} onChange={(e) => setField("registration_no", e.target.value)} />
                  </Field>
                  <Field label="Industry">
                    <select className={inputCls} value={details.industry} onChange={(e) => setField("industry", e.target.value)}>
                      <option value="">Select…</option>
                      {PERSON_INDUSTRIES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </Field>
                  <Field label="Company address">
                    <input className={inputCls} value={details.home_address} onChange={(e) => setField("home_address", e.target.value)} placeholder="Street, suburb, city" />
                  </Field>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-700">Authorised representative / trustee</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name(s)" required><input className={inputCls} value={details.full_name} onChange={(e) => setField("full_name", e.target.value)} /></Field>
                    <Field label="Surname"><input className={inputCls} value={details.surname} onChange={(e) => setField("surname", e.target.value)} /></Field>
                    <Field label="Cell" required><input className={inputCls} value={details.cell} onChange={(e) => setField("cell", e.target.value)} /></Field>
                    <Field label="Email" required><input className={inputCls} type="email" value={details.email} onChange={(e) => setField("email", e.target.value)} /></Field>
                  </div>
                  <Field label="ID number" required><input className={inputCls} value={details.id_number} onChange={(e) => setField("id_number", e.target.value)} /></Field>
                </div>

                {/* Directors / linked persons */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">Directors / linked persons</h2>
                    <button type="button" onClick={addDirector} className="inline-flex items-center gap-1 text-xs text-[#E8521A] font-medium hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  {directors.length === 0 && <p className="text-xs text-gray-400">Optional — add additional directors or contacts.</p>}
                  {directors.map((d, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2 relative">
                      <button type="button" onClick={() => removeDirector(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inputCls} placeholder="First name(s)" value={d.full_name} onChange={(e) => updateDirector(i, "full_name", e.target.value)} />
                        <input className={inputCls} placeholder="Surname" value={d.surname} onChange={(e) => updateDirector(i, "surname", e.target.value)} />
                        <input className={inputCls} placeholder="Cell" value={d.cell} onChange={(e) => updateDirector(i, "cell", e.target.value)} />
                        <input className={inputCls} placeholder="Work number" value={d.work_number} onChange={(e) => updateDirector(i, "work_number", e.target.value)} />
                        <input className={inputCls} placeholder="Email" value={d.email} onChange={(e) => updateDirector(i, "email", e.target.value)} />
                        <select className={inputCls} value={d.designation} onChange={(e) => updateDirector(i, "designation", e.target.value)}>
                          <option value="">Designation…</option>
                          {PERSON_DESIGNATIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">Your details</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name(s)" required><input className={inputCls} value={details.full_name} onChange={(e) => setField("full_name", e.target.value)} /></Field>
                  <Field label="Surname" required><input className={inputCls} value={details.surname} onChange={(e) => setField("surname", e.target.value)} /></Field>
                  <Field label="Cell" required><input className={inputCls} value={details.cell} onChange={(e) => setField("cell", e.target.value)} /></Field>
                  <Field label="Email" required><input className={inputCls} type="email" value={details.email} onChange={(e) => setField("email", e.target.value)} /></Field>
                </div>
                <Field label="ID number" required><input className={inputCls} value={details.id_number} onChange={(e) => setField("id_number", e.target.value)} /></Field>
                <Field label="Home address"><input className={inputCls} value={details.home_address} onChange={(e) => setField("home_address", e.target.value)} placeholder="Street, suburb, city" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Industry">
                    <select className={inputCls} value={details.industry} onChange={(e) => setField("industry", e.target.value)}>
                      <option value="">Select…</option>
                      {PERSON_INDUSTRIES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </Field>
                  <Field label="Role / designation">
                    <select className={inputCls} value={details.designation} onChange={(e) => setField("designation", e.target.value)}>
                      <option value="">Select…</option>
                      {PERSON_DESIGNATIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {/* Optional municipal login */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Municipal profile login <span className="font-normal text-gray-400">(optional)</span></h2>
              <p className="text-xs text-gray-400">If provided, this lets us pull your municipal account statements for you.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Username"><input className={inputCls} value={details.municipal_username} onChange={(e) => setField("municipal_username", e.target.value)} /></Field>
                <Field label="Password"><input className={inputCls} type="password" value={details.municipal_password} onChange={(e) => setField("municipal_password", e.target.value)} /></Field>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 1 — DOCUMENTS */}
        {stage === 1 && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">Documents completed</span>
                <span className="text-xs font-semibold text-[#1B2E6B]">{docsComplete} / {requiredDocs.length}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#E8521A] rounded-full transition-all duration-500"
                  style={{ width: `${requiredDocs.length > 0 ? (docsComplete / requiredDocs.length) * 100 : 100}%` }} />
              </div>
            </div>
            {requiredDocs.map((docType) => (
              <DocSlot key={docType} docType={docType} allowNotAvailable={allowNotAvailable} state={docStates[docType]}
                onChange={(next) => updateDoc(docType, next)}
                templateUrl={docType === "poa" || docType === "poa_signed" ? `/api/generate-poa?token=${token}` : undefined} />
            ))}
            {requiredDocs.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No documents required at this stage.</p>}
          </div>
        )}

        {/* STAGE 2 — CONSENT */}
        {stage === 2 && (
          <div className="space-y-3">
            <ConsentBox checked={popia} onChange={setPopia} title="POPIA Consent" required
              body="I consent to ConveyClear collecting and processing my personal information in accordance with the Protection of Personal Information Act (POPIA) for the purpose of this application." />
            <ConsentBox checked={terms} onChange={setTerms} title="Terms & Conditions" required
              body="I have read and accept ConveyClear's Terms and Conditions of service." />
            <ConsentBox checked={marketing} onChange={setMarketing} title="Marketing emails" optional
              body="I would like to receive occasional updates and offers from ConveyClear. You can opt out at any time." />
          </div>
        )}

        {/* STAGE 3 — REVIEW */}
        {stage === 3 && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2 text-sm">
              <h2 className="font-semibold text-gray-700 mb-2">Review your details</h2>
              <Row k="Entity type" v={isBusiness ? "Business / Trust" : "Natural person"} />
              {isBusiness ? (
                <>
                  <Row k="Business" v={details.business_name} />
                  <Row k="Reg / IT no." v={details.registration_no} />
                  <Row k="Representative" v={`${details.full_name} ${details.surname}`.trim()} />
                  <Row k="Directors added" v={String(directors.length)} />
                </>
              ) : (
                <>
                  <Row k="Name" v={`${details.full_name} ${details.surname}`.trim()} />
                  <Row k="ID number" v={details.id_number} />
                  <Row k="Industry" v={details.industry || "—"} />
                </>
              )}
              <Row k="Cell" v={details.cell} />
              <Row k="Email" v={details.email} />
              <Row k="Documents" v={`${docsComplete} / ${requiredDocs.length} provided`} />
              <Row k="Consents" v={`POPIA ✓  Terms ✓${marketing ? "  Marketing ✓" : ""}`} />
            </div>
            <label className="flex items-start gap-3 cursor-pointer bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1B2E6B]" />
              <span className="text-sm text-gray-700">I confirm the information above is correct and complete.</span>
            </label>
            {submitError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex items-center gap-3 pt-2">
          {stage > 0 && (
            <Button variant="ghost" size="lg" className="flex-1" onClick={() => setStage((s) => (s - 1) as Stage)} disabled={submitting}>
              Back
            </Button>
          )}
          {stage < 3 ? (
            <Button variant="secondary" size="lg" className="flex-1" disabled={!stageValid[stage]} onClick={() => setStage((s) => (s + 1) as Stage)}>
              Continue
            </Button>
          ) : (
            <Button variant="secondary" size="lg" className="flex-1" disabled={!confirmed} loading={submitting} onClick={handleSubmit}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          )}
        </div>
        {!stageValid[stage] && stage < 3 && (
          <p className="text-center text-xs text-gray-400">
            {stage === 0 ? "Please complete the required fields." : stage === 1 ? "Please provide all required documents." : "Please accept the required consents."}
          </p>
        )}

        {/* Footer */}
        <div className="space-y-3 pb-8 pt-2">
          <div className="flex items-center justify-center gap-2">
            <Lock className="h-3 w-3 text-gray-400" />
            <p className="text-xs text-gray-400">Encrypted in transit · Accessible to authorised staff only</p>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#1B2E6B]" />
            <p className="text-xs text-gray-400">POPIA Compliant · South Africa</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">{k}</span>
      <span className="text-gray-900 text-right">{v || "—"}</span>
    </div>
  );
}

export function ConsentBox({
  checked, onChange, title, body, required, optional,
}: { checked: boolean; onChange: (b: boolean) => void; title: string; body: string; required?: boolean; optional?: boolean }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1B2E6B] shrink-0" />
      <div>
        <p className="text-sm font-medium text-gray-900">
          {title} {required && <span className="text-[#E8521A]">*</span>} {optional && <span className="text-xs font-normal text-gray-400">(optional)</span>}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </label>
  );
}
