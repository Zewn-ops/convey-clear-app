"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { CheckCircle, Lock, ShieldCheck, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { DocSlot, ConsentBox, type DocSlotState } from "./OnboardForm";
import { prcRcfDocs } from "@/lib/prc-docs";
import type { TokenData } from "@/lib/onboard-token";

const STAGES = ["Documents", "Consent", "Review"] as const;

type Slot = { key: string; docType: string; optional: boolean };

// Property Rates Clearance (RCF) onboarding — a single, municipality-specific
// document set (COT vs COJ/COE differ). No buyer/seller parties. Files go
// direct to Supabase Storage via signed URLs.
export default function PrcOnboardForm({ token, data }: { token: string; data: TokenData }) {
  const slots: Slot[] = useMemo(
    () => prcRcfDocs(data.municipality).map((d) => ({ key: d.docType, docType: d.docType, optional: Boolean(d.optional) })),
    [data.municipality]
  );

  const [docStates, setDocStates] = useState<Record<string, DocSlotState>>(() =>
    Object.fromEntries(slots.map((s) => [s.key, { file: null, notAvailable: false, reason: "" }]))
  );
  const updateDoc = (key: string, next: Partial<DocSlotState>) =>
    setDocStates((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));

  const [popia, setPopia] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [stage, setStage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const slotDone = (s: Slot) => {
    const st = docStates[s.key];
    return st.file !== null || (st.notAvailable && st.reason.trim().length > 0);
  };
  const requiredSlots = slots.filter((s) => !s.optional);
  const complete = requiredSlots.filter(slotDone).length;
  const stageValid: Record<number, boolean> = {
    0: complete === requiredSlots.length,
    1: popia && terms,
    2: confirmed,
  };

  async function handleSubmit() {
    if (!stageValid[1] || !confirmed) {
      toast.error("Please complete all required documents and consents.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const supabase = createBrowserSupabase();
      const uploaded: { storage_path: string; document_type: string; file_name: string; mime_type: string; size_bytes: number }[] = [];
      const notAvailable: { document_type: string; reason: string }[] = [];

      for (const s of slots) {
        const st = docStates[s.key];
        if (st.file) {
          const r = await fetch("/api/onboard/signed-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, file_name: st.file.name }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.message ?? "Could not start the upload");
          const { error: upErr } = await supabase.storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, st.file);
          if (upErr) throw new Error(upErr.message);
          uploaded.push({
            storage_path: j.path,
            document_type: s.docType,
            file_name: st.file.name,
            mime_type: st.file.type,
            size_bytes: st.file.size,
          });
        } else if (st.notAvailable && st.reason.trim()) {
          notAvailable.push({ document_type: s.docType, reason: st.reason.trim() });
        }
      }

      const res = await fetch("/api/onboard/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          matter_id: data.matter_id,
          entity_type: "prc",
          fica: { consents: { popia, terms, marketing } },
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
  }

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
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Documents Submitted</h1>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              Thank you. The documents for this rates clearance matter have been securely received. Our team will be in touch shortly.
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
        <div className="flex items-center justify-between">
          {STAGES.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold " +
                  (i < stage ? "bg-green-500 text-white" : i === stage ? "bg-[#1B2E6B] text-white" : "bg-gray-200 text-gray-500")
                }
              >
                {i < stage ? "✓" : i + 1}
              </div>
              <span className={"text-xs hidden sm:block " + (i === stage ? "text-gray-900 font-medium" : "text-gray-400")}>{label}</span>
            </div>
          ))}
        </div>

        {stage === 0 && (
          <>
            <div className="rounded-xl bg-[#1B2E6B] text-white p-6">
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-1">
                {data.service_name || "Rates Clearance Figures"}{data.municipality ? ` · ${data.municipality}` : ""}
              </p>
              <h1 className="text-xl font-semibold mb-2">Supporting documents</h1>
              <p className="text-blue-100 text-sm leading-relaxed">
                Please upload the documents below for this rates clearance figures request. Optional items can be marked as not available with a short reason.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">Required documents completed</span>
                <span className="text-xs font-semibold text-[#1B2E6B]">{complete} / {requiredSlots.length}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#E8521A] rounded-full transition-all duration-500"
                  style={{ width: `${requiredSlots.length > 0 ? (complete / requiredSlots.length) * 100 : 100}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              {slots.map((s) => (
                <div key={s.key} className="space-y-1">
                  {s.optional && <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Optional — not required</p>}
                  <DocSlot
                    docType={s.docType}
                    allowNotAvailable={s.optional || (data.service_config.documents_allow_not_available ?? false)}
                    state={docStates[s.key]}
                    onChange={(next) => updateDoc(s.key, next)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {stage === 1 && (
          <div className="space-y-3">
            <ConsentBox checked={popia} onChange={setPopia} title="POPIA Consent" required body="I consent to ConveyClear collecting and processing the personal information provided in accordance with the Protection of Personal Information Act (POPIA) for the purpose of this matter." />
            <ConsentBox checked={terms} onChange={setTerms} title="Terms & Conditions" required body="I have read and accept ConveyClear's Terms and Conditions of service." />
            <ConsentBox checked={marketing} onChange={setMarketing} title="Marketing emails" optional body="I would like to receive occasional updates and offers from ConveyClear. You can opt out at any time." />
          </div>
        )}

        {stage === 2 && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2 text-sm">
              <h2 className="font-semibold text-gray-700 mb-2">Review</h2>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Documents</span>
                <span className="text-gray-900 text-right">{slots.filter(slotDone).length} / {slots.length} provided</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Consents</span>
                <span className="text-gray-900 text-right">POPIA ✓ Terms ✓{marketing ? " Marketing ✓" : ""}</span>
              </div>
            </div>
            <label className="flex items-start gap-3 cursor-pointer bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1B2E6B]" />
              <span className="text-sm text-gray-700">I confirm the documents provided are correct and complete.</span>
            </label>
            {submitError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          {stage > 0 && (
            <Button variant="ghost" size="lg" className="flex-1" onClick={() => setStage((s) => s - 1)} disabled={submitting}>
              Back
            </Button>
          )}
          {stage < 2 ? (
            <Button variant="secondary" size="lg" className="flex-1" disabled={!stageValid[stage]} onClick={() => setStage((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="secondary" size="lg" className="flex-1" disabled={!confirmed} loading={submitting} onClick={handleSubmit}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          )}
        </div>

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
