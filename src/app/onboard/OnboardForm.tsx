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
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import type { TokenData } from "./page";

const DOC_META: Record<string, { label: string; hint: string }> = {
  id: {
    label: "South African ID Document",
    hint: "Green ID book, Smart ID card, or Passport",
  },
  id_directors: {
    label: "Directors' ID Documents",
    hint: "ID for all directors — compile into one PDF if multiple",
  },
  por: {
    label: "Proof of Residence",
    hint: "Utility bill or bank statement — not older than 3 months",
  },
  tc: {
    label: "Tax Clearance Certificate",
    hint: "Valid SARS tax clearance certificate",
  },
  poa: {
    label: "Power of Attorney",
    hint: "Signed and dated power of attorney",
  },
  board_resolution: {
    label: "Board Resolution",
    hint: "Signed resolution authorising this application",
  },
  company_reg: {
    label: "Company Registration",
    hint: "CIPC registration certificate (COR14.3 or similar)",
  },
};

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

type DocSlotState = {
  file: File | null;
  notAvailable: boolean;
  reason: string;
};

type FormState = Record<string, DocSlotState>;

interface OnboardFormProps {
  token: string;
  data: TokenData;
  submitUrl: string;
}

function DocSlot({
  docType,
  allowNotAvailable,
  state,
  onChange,
}: {
  docType: string;
  allowNotAvailable: boolean;
  state: DocSlotState;
  onChange: (next: Partial<DocSlotState>) => void;
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
    <div
      className={cn(
        "rounded-xl border bg-white transition-all",
        isComplete
          ? "border-green-200 shadow-sm"
          : "border-gray-200 shadow-sm"
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isComplete ? (
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
              )}
              <span className="text-sm font-medium text-gray-900">
                {meta.label}
              </span>
            </div>
            {meta.hint && (
              <p className="mt-0.5 ml-6 text-xs text-gray-400">{meta.hint}</p>
            )}
          </div>

          {allowNotAvailable && !state.file && (
            <button
              type="button"
              onClick={() => onChange({ notAvailable: !state.notAvailable, file: null })}
              className={cn(
                "shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors",
                state.notAvailable
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              )}
            >
              {state.notAvailable ? "Upload instead" : "Not available"}
            </button>
          )}
        </div>

        {state.notAvailable ? (
          <div className="ml-6 space-y-2">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Please explain why this document is not available.
            </p>
            <textarea
              value={state.reason}
              onChange={(e) => onChange({ reason: e.target.value })}
              placeholder="e.g. Tax clearance expired, renewal in progress"
              rows={2}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none",
                "focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] focus:border-transparent",
                state.reason.trim() ? "border-gray-300" : "border-amber-300"
              )}
            />
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "ml-6 relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors cursor-pointer py-5 px-4 text-center",
              state.file
                ? "border-green-300 bg-green-50"
                : "border-gray-200 hover:border-[#1B2E6B] hover:bg-navy-50"
            )}
          >
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {state.file ? (
              <>
                <FileText className="h-6 w-6 text-green-600" />
                <div>
                  <p className="text-xs font-medium text-green-800">
                    {state.file.name}
                  </p>
                  <p className="text-xs text-green-600">
                    {formatBytes(state.file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ file: null });
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 rounded-full bg-white p-0.5 shadow text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-600">
                    Click or drag file here
                  </p>
                  <p className="text-xs text-gray-400">PDF, JPG, PNG up to 10 MB</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardForm({ token, data, submitUrl }: OnboardFormProps) {
  const requiredDocs = (
    data.service_config.required_documents[data.entity_type] ?? []
  ).filter((d) => d !== "popia_consent");

  const allowNotAvailable = data.service_config.documents_allow_not_available ?? false;

  const [popiaAgreed, setPopiaAgreed] = useState(false);
  const [docStates, setDocStates] = useState<FormState>(() =>
    Object.fromEntries(
      requiredDocs.map((d) => [d, { file: null, notAvailable: false, reason: "" }])
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateDoc = useCallback(
    (docType: string, next: Partial<DocSlotState>) => {
      setDocStates((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], ...next },
      }));
    },
    []
  );

  const completedCount = requiredDocs.filter((d) => {
    const s = docStates[d];
    return s.file !== null || (s.notAvailable && s.reason.trim().length > 0);
  }).length;

  const allComplete = popiaAgreed && completedCount === requiredDocs.length;

  const handleSubmit = async () => {
    if (!allComplete) {
      toast.error("Please complete all required fields before submitting.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const formData = new FormData();
    formData.append("token", token);
    formData.append("popia_consent_agreed", "true");
    formData.append("entity_type", data.entity_type);
    formData.append("client_name", data.client_name);
    formData.append("matter_id", data.matter_id);
    formData.append("service_code", data.service_code);

    for (const [docType, state] of Object.entries(docStates)) {
      if (state.file) {
        formData.append(`doc_${docType}`, state.file, state.file.name);
      } else if (state.notAvailable) {
        formData.append(`not_available_${docType}`, "true");
        formData.append(`reason_${docType}`, state.reason.trim());
      }
    }

    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? `Server error (${res.status})`);
      }

      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const expiryDate = new Date(data.expires_at);
  const daysLeft = Math.ceil(
    (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (submitted) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-[#1B2E6B] px-6 py-4">
          <span className="text-white font-semibold text-lg tracking-tight">ConveyClear</span>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-5 h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Documents Received
            </h1>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              Thank you, <strong>{data.client_name}</strong>. We&apos;ve received your
              FICA documents for your{" "}
              <strong>{data.service_name}</strong> application.
            </p>
            <div className="bg-navy-50 rounded-xl p-4 text-left space-y-1.5">
              <p className="text-sm font-medium text-[#1B2E6B]">What happens next</p>
              <p className="text-xs text-gray-600">1. Our team verifies your documents (typically within 1 business day)</p>
              <p className="text-xs text-gray-600">2. You&apos;ll receive a confirmation email once approved</p>
              <p className="text-xs text-gray-600">3. We proceed with your {data.service_name} application</p>
            </div>
            <p className="mt-6 text-xs text-gray-400">
              Questions?{" "}
              <a href="mailto:info@conveyclear.co.za" className="text-[#1B2E6B] underline">
                info@conveyclear.co.za
              </a>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#1B2E6B] px-6 py-4 sticky top-0 z-10">
        <span className="text-white font-semibold text-lg tracking-tight">ConveyClear</span>
      </header>

      <div className="flex-1 w-full max-w-xl mx-auto px-4 py-8 space-y-5">
        {/* Welcome card */}
        <div className="rounded-xl bg-[#1B2E6B] text-white p-6">
          <p className="text-navy-200 text-xs font-medium uppercase tracking-wider mb-1">
            {data.service_name}
          </p>
          <h1 className="text-xl font-semibold mb-1">Hi {data.client_name},</h1>
          <p className="text-navy-200 text-sm leading-relaxed">
            Please upload your FICA documents below to proceed with your application.
            {data.matter_title && (
              <> This is for <strong className="text-white">{data.matter_title}</strong>.</>
            )}
          </p>
          {daysLeft <= 3 && daysLeft > 0 && (
            <div className="mt-3 flex items-center gap-2 bg-amber-400/20 border border-amber-400/30 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 text-amber-300 shrink-0" />
              <p className="text-xs text-amber-200">
                This link expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}.
              </p>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">
              Documents completed
            </span>
            <span className="text-xs font-semibold text-[#1B2E6B]">
              {completedCount} / {requiredDocs.length}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1B2E6B] rounded-full transition-all duration-500"
              style={{
                width: `${requiredDocs.length > 0 ? (completedCount / requiredDocs.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* POPIA Consent */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={popiaAgreed}
                onChange={(e) => setPopiaAgreed(e.target.checked)}
              />
              <div
                className={cn(
                  "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                  popiaAgreed
                    ? "bg-[#1B2E6B] border-[#1B2E6B]"
                    : "border-gray-300 bg-white"
                )}
              >
                {popiaAgreed && (
                  <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">POPIA Consent</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                I consent to ConveyClear processing my personal information in
                accordance with the Protection of Personal Information Act (POPIA)
                for the purpose of this application.
              </p>
            </div>
          </label>
        </div>

        {/* Document uploads */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 px-1">
            Required Documents
          </h2>
          {requiredDocs.map((docType) => (
            <DocSlot
              key={docType}
              docType={docType}
              allowNotAvailable={allowNotAvailable}
              state={docStates[docType]}
              onChange={(next) => updateDoc(docType, next)}
            />
          ))}
        </div>

        {/* Submit */}
        {submitError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={!allComplete}
          loading={submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Submitting..." : "Submit Documents"}
        </Button>

        {!allComplete && (
          <p className="text-center text-xs text-gray-400">
            {!popiaAgreed
              ? "Please accept the POPIA consent above to continue."
              : `${requiredDocs.length - completedCount} document${
                  requiredDocs.length - completedCount !== 1 ? "s" : ""
                } still needed.`}
          </p>
        )}

        {/* Security footer */}
        <div className="flex items-center justify-center gap-2 pb-8">
          <Lock className="h-3 w-3 text-gray-400" />
          <p className="text-xs text-gray-400">
            Secure submission — your documents are encrypted in transit
          </p>
        </div>
      </div>
    </main>
  );
}
