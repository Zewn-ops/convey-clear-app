import OnboardForm from "./OnboardForm";
import CooOnboardForm from "./CooOnboardForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateOnboardingToken } from "@/lib/onboard-token";

// Re-exported for OnboardForm (which imports `type { TokenData } from "./page"`).
export type { TokenData } from "@/lib/onboard-token";

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams?.token;

  if (!token) {
    return <ErrorPage message="No onboarding link was provided. Please use the link sent to you by email." />;
  }

  // Supabase-native token validation (replaces the old n8n validate-token webhook).
  const admin = createAdminClient();
  const { data, error } = await validateOnboardingToken(admin, token);

  if (error || !data) {
    return <ErrorPage message={error ?? "This link is invalid, has already been used, or has expired."} />;
  }

  // COO / multi-party matters get the per-party (buyer/seller) document form.
  if (data.parties && data.parties.length > 0) {
    return <CooOnboardForm token={token} data={data} />;
  }

  return <OnboardForm token={token} data={data} />;
}

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 shadow-sm px-6 py-3 flex items-center">
        <img src="/conveyclear-logo.png" alt="ConveyClear" className="h-10 w-auto" />
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link Invalid or Expired</h1>
          <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
          <p className="mt-6 text-xs text-gray-400">
            If you believe this is an error, contact ConveyClear at{" "}
            <a href="mailto:hello@conveyclear.co.za" className="text-[#1B2E6B] underline">
              hello@conveyclear.co.za
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
