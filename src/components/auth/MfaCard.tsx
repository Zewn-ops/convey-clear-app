"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { ShieldCheck, ShieldAlert, Smartphone, Trash2 } from "lucide-react";

type Factor = { id: string; friendly_name: string | null; status: string };

// Two-factor authentication (TOTP) self-management. Any signed-in user can add an
// authenticator app; once a verified factor exists, sign-in requires a 6-digit code
// (enforced in LoginForm / the /auth/mfa challenge). Removing it reverts to password-only.
export default function MfaCard() {
  const supabase = createClient();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = (data?.totp ?? []) as Factor[];
    setFactors(totp);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const verified = factors.filter((f) => f.status === "verified");

  const startEnroll = async () => {
    setBusy(true);
    try {
      // Clear any half-finished (unverified) factor so the friendly name is free.
      for (const f of factors.filter((f) => f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "ConveyClear",
        friendlyName: `Authenticator ${Date.now()}`,
      });
      if (error) return toast.error(error.message);
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const verifyEnroll = async () => {
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
      setEnrolling(null);
      setCode("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this authenticator? Sign-in will no longer ask for a code.")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error(error.message);
    toast.success("Authenticator removed");
    await load();
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        {verified.length > 0 ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldAlert className="h-5 w-5 text-gray-400" />}
        <h2 className="font-semibold text-gray-900">Two-factor authentication</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Add an authenticator app (Google Authenticator, 1Password, Authy…) for a 6-digit code at sign-in.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : enrolling ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
          {/* Supabase returns qr_code as an SVG data URI */}
          <img src={enrolling.qr} alt="TOTP QR code" className="h-44 w-44 rounded-lg border border-gray-200 bg-white p-2" />
          <p className="text-xs text-gray-500">
            Can&rsquo;t scan? Enter this key manually: <code className="font-mono text-gray-700 break-all">{enrolling.secret}</code>
          </p>
          <Input label="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
          <div className="flex gap-2">
            <Button onClick={verifyEnroll} loading={busy}>Verify &amp; enable</Button>
            <Button variant="ghost" onClick={() => { setEnrolling(null); setCode(""); }}>Cancel</Button>
          </div>
        </div>
      ) : verified.length > 0 ? (
        <div className="space-y-2">
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-gray-800">
                <Smartphone className="h-4 w-4 text-gray-400" /> Authenticator app <span className="text-xs text-green-600 font-medium">· active</span>
              </span>
              <button onClick={() => remove(f.id)} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">Two-factor authentication is on. You&rsquo;ll be asked for a code each sign-in.</p>
        </div>
      ) : (
        <Button onClick={startEnroll} loading={busy}>
          <ShieldCheck className="h-4 w-4" /> Set up two-factor authentication
        </Button>
      )}
    </Card>
  );
}
