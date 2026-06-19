"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Turnstile, { TURNSTILE_ENABLED, friendlyAuthError } from "@/components/auth/Turnstile";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

const schema = z
  .object({
    full_name: z.string().min(2, "Full name is required"),
    email: z.string().email("Enter a valid email address"),
    phone: z.string().optional(),
    id_number: z
      .string()
      .regex(/^\d{13}$/, "SA ID number must be 13 digits")
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirm_password: z.string(),
    // Honeypot — must stay empty. Bots fill every field; humans never see it.
    company: z.string().max(0).optional(),
    popia_consent: z.literal(true, {
      errorMap: () => ({
        message: "You must accept the POPIA data handling notice to continue",
      }),
    }),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export default function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    // Honeypot tripped → silently pretend success (don't tip off the bot).
    if (values.company) {
      toast.success("Account created! Please check your email to confirm.");
      router.push("/auth/login");
      return;
    }
    setLoading(true);

    // Role is NEVER set here — the DB trigger forces 'client' on public signup.
    // Staff/partner/admin accounts are provisioned from /admin/users only.
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.full_name },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        captchaToken: captchaToken ?? undefined,
      },
    });

    if (error) {
      toast.error(friendlyAuthError(error.message));
      setLoading(false);
      return;
    }

    toast.success("Account created! Please check your email to confirm.");
    router.push("/auth/login");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Honeypot: visually hidden, off-screen, not tab-reachable. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company (leave blank)</label>
        <input
          id="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("company")}
        />
      </div>

      <Input
        label="Full name"
        type="text"
        autoComplete="name"
        required
        error={errors.full_name?.message}
        {...register("full_name")}
      />
      <Input
        label="Email address"
        type="email"
        autoComplete="email"
        required
        error={errors.email?.message}
        {...register("email")}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Phone number"
          type="tel"
          autoComplete="tel"
          placeholder="+27 82 000 0000"
          error={errors.phone?.message}
          {...register("phone")}
        />
        <Input
          label="SA ID number"
          type="text"
          maxLength={13}
          placeholder="13-digit ID number"
          hint="Optional — used for verification"
          error={errors.id_number?.message}
          {...register("id_number")}
        />
      </div>
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="Min 8 characters, one uppercase, one number"
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        error={errors.confirm_password?.message}
        {...register("confirm_password")}
      />

      {/* POPIA Data Handling Notice */}
      <div className="rounded-lg border border-[#1B2E6B]/20 bg-[#1B2E6B]/5 p-4 space-y-2">
        <p className="text-xs font-semibold text-[#1B2E6B] uppercase tracking-wide">
          POPIA — Data Handling Notice
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          ConveyClear collects and processes your personal information (name,
          contact details, ID number, and documents) to provide conveyancing
          services. Your data is stored securely in South Africa and is only
          accessible to authorised ConveyClear staff. You have the right to
          access, correct, and request deletion of your information at any time.
          For queries, contact{" "}
          <a
            href="mailto:privacy@conveyclear.co.za"
            className="text-[#1B2E6B] underline"
          >
            privacy@conveyclear.co.za
          </a>
          .
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#1B2E6B] focus:ring-[#1B2E6B]"
            {...register("popia_consent")}
          />
          <span className="text-xs text-gray-700">
            I have read and accept ConveyClear&apos;s POPIA data handling
            notice and consent to the processing of my personal information.
          </span>
        </label>
        {errors.popia_consent && (
          <p className="text-xs text-red-500">{errors.popia_consent.message}</p>
        )}
      </div>

      <Turnstile onVerify={setCaptchaToken} />

      <Button
        type="submit"
        loading={loading}
        disabled={TURNSTILE_ENABLED && !captchaToken}
        className="w-full"
        size="lg"
      >
        Create account
      </Button>
      {TURNSTILE_ENABLED && !captchaToken && (
        <p className="text-center text-xs text-gray-400 -mt-2">
          Complete the verification above to continue.
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">or</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <GoogleSignInButton label="Sign up with Google" />

      <p className="text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="text-[#E8521A] font-medium hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
