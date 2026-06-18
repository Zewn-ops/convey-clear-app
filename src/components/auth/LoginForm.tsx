"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { isStaffRole, isPartnerRole, type UserRole } from "@/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Turnstile from "@/components/auth/Turnstile";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginForm() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const { error, data } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
      options: { captchaToken: captchaToken ?? undefined },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // MFA step-up: if this account has a verified factor, finish at the challenge
    // page. Fail-open — never block sign-in if the AAL check itself errors.
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
        window.location.assign("/auth/mfa");
        return;
      }
    } catch {
      /* proceed to destination */
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    const role = (profile?.role ?? null) as UserRole | null;
    const dest = isStaffRole(role) ? "/admin" : isPartnerRole(role) ? "/partner" : "/dashboard";
    // Full-page navigation (not router.push) so the browser re-requests with the
    // freshly-set auth cookie — avoids a race where middleware on the hard-guarded
    // /admin route sees no session and bounces back to /auth/login.
    window.location.assign(dest);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Email address"
        type="email"
        autoComplete="email"
        required
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={errors.password?.message}
        {...register("password")}
      />

      <div className="flex items-center justify-end">
        <Link
          href="/auth/forgot-password"
          className="text-sm text-[#1B2E6B] hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <Turnstile onVerify={setCaptchaToken} />

      <Button type="submit" loading={loading} className="w-full" size="lg">
        Sign in
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">or</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <GoogleSignInButton />

      <p className="text-center text-sm text-gray-600">
        Don&apos;t have an account?{" "}
        <Link href="/auth/signup" className="text-[#E8521A] font-medium hover:underline">
          Create account
        </Link>
      </p>
    </form>
  );
}
