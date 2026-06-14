"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Turnstile from "@/components/auth/Turnstile";
import { CheckCircle } from "lucide-react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordForm() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
      captchaToken: captchaToken ?? undefined,
    });

    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="h-12 w-12 text-green-500" />
        </div>
        <p className="text-gray-600 text-sm">
          If that email is registered, you&apos;ll receive a password reset link
          shortly. Check your spam folder too.
        </p>
        <Link
          href="/auth/login"
          className="block text-sm text-[#E8521A] font-medium hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-sm text-gray-600">
        Enter your account email address and we&apos;ll send you a link to reset
        your password.
      </p>
      <Input
        label="Email address"
        type="email"
        autoComplete="email"
        required
        error={errors.email?.message}
        {...register("email")}
      />
      <Turnstile onVerify={setCaptchaToken} />

      <Button type="submit" loading={loading} className="w-full" size="lg">
        Send reset link
      </Button>
      <p className="text-center text-sm text-gray-600">
        <Link href="/auth/login" className="text-[#1B2E6B] hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
