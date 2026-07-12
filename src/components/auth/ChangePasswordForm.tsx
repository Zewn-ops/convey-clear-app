"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

// Used in two places:
//   • /account — a voluntary change.
//   • /auth/change-password (forced) — where the middleware holds an account
//     that is still on a staff-issued temp password (migration 031).
//
// Both go through /api/auth/change-password rather than supabase.auth.updateUser
// in the browser, because that route is the ONLY thing that clears
// must_change_password, and it clears it only after the password really changed.
export default function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (!/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return toast.error("Include an uppercase letter and a number");
    if (pw !== confirm) return toast.error("Passwords do not match");

    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) return toast.error(json.message || "Could not update your password");

    toast.success("Password updated");
    setPw("");
    setConfirm("");

    if (forced) {
      // The gate is clear — go to the portal this role actually belongs in
      // (the route resolves it; /dashboard is the client one).
      router.replace(json.home || "/dashboard");
    }
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="New password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} hint="Min 8 characters, one uppercase, one number" />
      <Input label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <Button type="submit" loading={loading} className={forced ? "w-full" : undefined} size={forced ? "lg" : undefined}>
        {forced ? "Set my password" : "Update password"}
      </Button>
    </form>
  );
}
