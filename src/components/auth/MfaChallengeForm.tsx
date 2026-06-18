"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { isStaffRole, isPartnerRole, type UserRole } from "@/types";

// Step-up MFA challenge: shown right after sign-in for accounts with a verified
// TOTP factor (AAL1 -> AAL2). On success the session is upgraded and the user
// continues to their portal home.
export default function MfaChallengeForm() {
  const supabase = createClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      // Already stepped up, or no factor requires it → leave.
      if (!aal || aal.currentLevel === "aal2" || aal.nextLevel !== "aal2") return goHome();
      const { data } = await supabase.auth.mfa.listFactors();
      const f = (data?.totp ?? []).find((x) => x.status === "verified");
      if (!f) return goHome();
      setFactorId(f.id);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) return toast.error("Enter the 6-digit code");
    setLoading(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) { setLoading(false); return toast.error(chErr.message); }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: c });
    if (error) { setLoading(false); return toast.error(error.message); }
    toast.success("Verified");
    goHome();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth/login");
  };

  if (!ready) return <p className="text-sm text-gray-400">Checking…</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        label="Authentication code"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="123456"
        hint="6-digit code from your authenticator app"
      />
      <Button type="submit" loading={loading} className="w-full" size="lg">Verify</Button>
      <button type="button" onClick={signOut} className="w-full text-center text-sm text-gray-500 hover:underline">
        Sign out
      </button>
    </form>
  );
}
