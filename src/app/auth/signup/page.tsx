import { Suspense } from "react";
import SignupForm from "@/components/auth/SignupForm";
import AuthLayout from "@/components/auth/AuthLayout";

export const metadata = { title: "Create Account — ConveyClear" };

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join the ConveyClear client portal to manage your property transactions"
    >
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  );
}
