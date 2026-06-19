"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { isStaffRole, isPartnerRole, type UserRole } from "@/types";

// Forced TOTP enrollment. Middleware sends staff/admin here when their role
// requires 2FA but they have no verified factor yet. Blocking: no portal chrome,
// the only ways out are "enrol + verify" (-> home, now AAL2) or "sign out".
export default function MfaSetupForm() {
  const supabase = createClient();
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const goHome = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    let dest = "/dashboard";
    if (user) {
      const { data: p } = await supabase.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
      const role = (p?.role ?? null) as UserRole | null;
      dest = isStaffRole(role) ? "/admin" : isPartnerRole(role) ? "/partner" : "/dashboard";
    }
    window.location.assign(dest);
  };

  // On mount: if a verified factor already exists, there's nothing to set up —
  // leave (the challenge page / middleware handles step-up). Otherwise start enrol.
  useEffect(() => {
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2") return goHome();
      // Clear any half-finished (unverified) factors so enrol succeeds cleanly.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.totp ?? [])) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "ConveyClear",
        friendlyName: `Authenticator ${Date.now()}`,
      });
      if (error) { toast.error(error.message); return; }
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async () => {
    if (!enrolling) return;
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) return toast.error("Enter the 6-digit code from your app");
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.id });
      if (chErr) return toast.error(chErr.message);
      const { error } = await supabase.auth.mfa.verify({ factorId: enrolling.id, challengeId: ch.id, code: c });
      if (error) return toast.error(error.message);
      toast.success("Two-factor authentication enabled");
      goHome();
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth/login");
  };

  if (!ready || !enrolling) return <p className="text-sm text-gray-400">Preparing setup…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Your role requires two-factor authentication. Scan this QR code with an
        authenticator app (Google Authenticator, 1Password, Authy…), then enter the
        6-digit code it shows.
      </p>
      <img src={enrolling.qr} alt="TOTP QR code" className="h-44 w-44 rounded-lg border border-gray-200 bg-white p-2" />
      <p className="text-xs text-gray-500">
        Can&rsquo;t scan? Enter this key manually: <code className="font-mono text-gray-700 break-all">{enrolling.secret}</code>
      </p>
      <Input label="6-digit code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
      <Button onClick={verify} loading={busy} className="w-full" size="lg">Verify &amp; continue</Button>
      <button type="button" onClick={signOut} className="w-full text-center text-sm text-gray-500 hover:underline">
        Sign out
      </button>
    </div>
  );
}
