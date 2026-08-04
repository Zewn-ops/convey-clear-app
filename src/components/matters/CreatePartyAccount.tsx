"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { UserPlus, Copy, Check } from "lucide-react";

// A8 — staff control on a party card: create a CRM contact or a portal login
// from the captured party data. Login mode returns a one-time temp password.
export default function CreatePartyAccount({ partyId, partyName }: { partyId: string; partyName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"contact" | "login" | null>(null);
  const [cred, setCred] = useState<{ email: string; password: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(mode: "contact" | "login") {
    setLoading(mode);
    try {
      const res = await fetch("/api/admin/parties/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party_id: partyId, mode }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not create the account");
      if (mode === "login") {
        setCred({ email: json.email, password: json.temp_password, emailed: Boolean(json.emailed) });
        toast.success(json.emailed ? "Login created and emailed" : "Login created");
      } else {
        toast.success(`Contact created for ${partyName}`);
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  if (cred) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm space-y-1.5">
        <p className="text-xs font-semibold text-green-800">
          {cred.emailed
            ? `Login created — credentials emailed to ${partyName}`
            : `Login created — hand these to ${partyName}`}
        </p>
        <p className="text-ink-2"><span className="text-ink-3">Email:</span> {cred.email}</p>
        <div className="flex items-center gap-2">
          <p className="text-ink-2"><span className="text-ink-3">Temp password:</span> <code className="font-mono">{cred.password}</code></p>
          <button
            onClick={() => { navigator.clipboard.writeText(cred.password); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-green-700 hover:text-green-900"
            title="Copy password"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-xs text-ink-3 pt-1">They will be asked to choose their own password when they first sign in.</p>
        <button onClick={() => setCred(null)} className="text-xs text-green-700 hover:underline pt-1">Dismiss</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 pt-1">
      <UserPlus className="h-3.5 w-3.5 text-ink-3" />
      <button
        onClick={() => create("contact")}
        disabled={loading !== null}
        className="text-xs font-medium text-[#1B2E6B] hover:underline disabled:opacity-50"
      >
        {loading === "contact" ? "Creating…" : "Create contact"}
      </button>
      <span className="text-gray-300">·</span>
      <button
        onClick={() => create("login")}
        disabled={loading !== null}
        className="text-xs font-medium text-[#1B2E6B] hover:underline disabled:opacity-50"
      >
        {loading === "login" ? "Creating…" : "Create login"}
      </button>
    </div>
  );
}
