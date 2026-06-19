import { Suspense } from "react";
import AuthLayout from "@/components/auth/AuthLayout";
import MfaSetupForm from "@/components/auth/MfaSetupForm";

export const metadata = { title: "Set up two-factor authentication — ConveyClear" };

export default function MfaSetupPage() {
  return (
    <AuthLayout
      title="Set up two-factor authentication"
      subtitle="Required for staff accounts before you can continue"
    >
      <Suspense>
        <MfaSetupForm />
      </Suspense>
    </AuthLayout>
  );
}
