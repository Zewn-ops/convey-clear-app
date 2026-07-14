import OnboardForm from "./OnboardForm";
import CooOnboardForm from "./CooOnboardForm";
import PrcOnboardForm from "./PrcOnboardForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { logMatterActivity } from "@/lib/activity";
import { validateOnboardingToken, resolveMatterForFreshLink, type OnboardTokenReason } from "@/lib/onboard-token";
import { notifyStaff } from "@/lib/notify";
import { redirect } from "next/navigation";

// Re-exported for OnboardForm (which imports `type { TokenData } from "./page"`).
export type { TokenData } from "@/lib/onboard-token";

// Bug #2 (A&A demo): a fresh onboarding link that failed on the client's Mac —
// most likely a network drop, but it looked broken. When a link genuinely can't
// be used, a client asks ConveyClear to send a new one. Resolves the matter
// behind the (used/expired) token and notifies staff, then bounces back to a
// confirmation state. Module-scope server action (see the matter-detail note on
// the "use server" scoping rule).
async function requestFreshLink(formData: FormData) {
  "use server";
  const token = (formData.get("token") as string) || "";
  const admin = createAdminClient();
  const matterId = await resolveMatterForFreshLink(admin, token);
  if (!matterId) {
    // No link row matches (a genuinely invalid/mistyped token) — we can't route
    // it to a matter, so fall back to the contact path.
    redirect(`/onboard?token=${encodeURIComponent(token)}&requested=nomatch`);
  }
  const logged = await logMatterActivity(admin, {
    matterId,
    authorId: null,
    activityType: "system",
    body: "Client requested a fresh onboarding link (their link was expired or already used).",
  });
  // A client whose link just failed will press this twice. One request, one ping.
  if (!logged.deduped) {
    await notifyStaff({
      type: "onboard",
      title: "Client requested a fresh onboarding link",
      body: "Their onboarding link had expired or was already used — send a new one.",
      matter_id: matterId,
      link: `/admin/matters/${matterId}`,
    });
  }
  redirect(`/onboard?token=${encodeURIComponent(token)}&requested=1`);
}

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: { token?: string; requested?: string };
}) {
  const token = searchParams?.token;
  const requested = searchParams?.requested;

  if (!token) {
    return <ErrorPage reason="missing" token="" requested={requested} />;
  }

  // Supabase-native token validation (replaces the old n8n validate-token webhook).
  const admin = createAdminClient();
  const { data, error, reason } = await validateOnboardingToken(admin, token);

  if (error || !data) {
    return <ErrorPage reason={reason} token={token} requested={requested} />;
  }

  // PRC / Rates Clearance (service code RCF; both RCF + RCC subtypes) gets the
  // rates-clearance doc set. PRC matters now carry a single seller party, so this
  // MUST come before the parties check below — otherwise they'd be sent to the
  // COO multi-party form and shown COO documents.
  if (data.service_code === "RCF") {
    return <PrcOnboardForm token={token} data={data} />;
  }

  // COO / multi-party matters get the per-party (buyer/seller) document form.
  if (data.parties && data.parties.length > 0) {
    return <CooOnboardForm token={token} data={data} />;
  }

  return <OnboardForm token={token} data={data} />;
}

const REASON_COPY: Record<OnboardTokenReason, { heading: string; message: string }> = {
  missing: {
    heading: "No link found",
    message: "Please open the onboarding link directly from the email ConveyClear sent you.",
  },
  invalid: {
    heading: "We couldn't recognise this link",
    message: "It may have been mistyped or copied incompletely. Try opening it straight from your email, or request a fresh one below.",
  },
  used: {
    heading: "This link has already been used",
    message: "Each onboarding link works once, for your security. If you still need to upload documents, request a fresh link below and ConveyClear will send you a new one.",
  },
  expired: {
    heading: "This link has expired",
    message: "Onboarding links expire after a while to keep your information safe. Request a fresh link below and ConveyClear will email you a new one.",
  },
  no_matter: {
    heading: "We couldn't recognise this link",
    message: "This link doesn't point to an active matter. Request a fresh link below and ConveyClear will sort it out.",
  },
  ok: { heading: "", message: "" },
};

function ErrorPage({
  reason,
  token,
  requested,
}: {
  reason: OnboardTokenReason;
  token: string;
  requested?: string;
}) {
  const copy = REASON_COPY[reason] ?? REASON_COPY.invalid;
  // A "request a fresh link" button only makes sense when there's a token to act
  // on and it hasn't just been requested.
  const canRequest = Boolean(token) && reason !== "missing" && !requested;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 shadow-sm px-6 py-3 flex items-center">
        <img src="/conveyclear-logo.png" alt="ConveyClear" className="h-10 w-auto" />
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          {requested === "1" ? (
            <>
              <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Request sent</h1>
              <p className="text-gray-500 text-sm leading-relaxed">
                We&apos;ve let ConveyClear know. They&apos;ll email you a fresh onboarding link shortly — no need to do anything else.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">{copy.heading}</h1>
              <p className="text-gray-500 text-sm leading-relaxed">{copy.message}</p>

              {requested === "nomatch" && (
                <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                  We couldn&apos;t match that link to a matter. Please contact ConveyClear below and we&apos;ll get you a new one.
                </p>
              )}

              {canRequest && (
                <form action={requestFreshLink} className="mt-6">
                  <input type="hidden" name="token" value={token} />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-lg bg-[#1B2E6B] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#16255a] transition-colors"
                  >
                    Request a fresh link
                  </button>
                </form>
              )}

              <p className="mt-6 text-xs text-gray-400">
                If you believe this is an error, contact ConveyClear at{" "}
                <a href="mailto:hello@conveyclear.co.za" className="text-[#1B2E6B] underline">
                  hello@conveyclear.co.za
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
