"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { KeyRound, CheckCircle2 } from "lucide-react";
import Card from "@/components/ui/Card";

// Provision a portal login for this client entity. Shown on the client detail
// page. If the account already exists it says so; otherwise it creates one and
// surfaces the temp password (the email channel may still be dark, so staff can
// relay it by hand — the account is held at /auth/change-password until the
// client sets their own).
export default function CreateLoginButton({
  clientId,
  hasLogin,
  loginEmail,
  clientEmail,
}: {
  clientId: string;
  hasLogin: boolean;
  loginEmail: string | null;
  clientEmail: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ email: string; temp_password?: string; emailed?: boolean } | null>(null);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/create-login`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not create the login");
      if (json.already_exists) {
        toast.success("A login already exists for this client");
        router.refresh();
        return;
      }
      setResult({ email: json.email, temp_password: json.temp_password, emailed: json.emailed });
      toast.success(json.emailed ? "Login created — credentials emailed" : "Login created");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-action" />
          <h2 className="font-semibold text-ink">Portal access</h2>
        </div>
        {hasLogin ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Login active
          </span>
        ) : (
          <button
            onClick={create}
            disabled={busy || !clientEmail}
            title={!clientEmail ? "Add an email to this client first" : undefined}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" /> {busy ? "Creating…" : "Create login"}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-3">
        {hasLogin
          ? `This client can sign in to the portal${loginEmail ? ` as ${loginEmail}` : ""}. Attach their matters and they will appear on their dashboard.`
          : clientEmail
            ? "Creates a portal account and emails the client a temporary password. They set their own password on first sign-in."
            : "Add an email address above, then create a login."}
      </p>

      {result && (
        <div className="mt-3 rounded-lg border border-line/20 bg-action-fill/5 p-3 text-sm">
          <p className="font-medium text-ink">Login created for {result.email}</p>
          {result.temp_password && (
            <p className="mt-1 text-ink-2">
              Temporary password: <span className="font-mono font-semibold">{result.temp_password}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-ink-3">
            {result.emailed
              ? "Emailed to the client. They must change it on first sign-in."
              : "Email is not configured — send these details to the client yourself. They must change the password on first sign-in."}
          </p>
        </div>
      )}
    </Card>
  );
}
