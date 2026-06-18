import { Suspense } from "react";
import AuthLayout from "@/components/auth/AuthLayout";
import MfaChallengeForm from "@/components/auth/MfaChallengeForm";

export const metadata = { title: "Two-factor verification — ConveyClear" };

export default function MfaPage() {
  return (
    <AuthLayout
      title="Two-factor verification"
      subtitle="Enter the code from your authenticator app to continue"
    >
      <Suspense>
        <MfaChallengeForm />
      </Suspense>
    </AuthLayout>
  );
}
