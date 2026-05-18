import OnboardForm from "./OnboardForm";

const N8N_URL =
  process.env.N8N_WEBHOOK_URL ?? "https://n8n.conveyclear.co.za";

export interface TokenData {
  link_id: string;
  matter_id: string;
  purpose: string;
  expires_at: string;
  matter_title: string;
  sub_service: string | null;
  drive_folder_id: string | null;
  client_name: string;
  entity_type: "natural_person" | "business";
  primary_email: string;
  service_code: string;
  service_name: string;
  service_config: {
    required_documents: {
      natural_person: string[];
      business: string[];
    };
    documents_allow_not_available: boolean;
  };
}

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams?.token;

  if (!token) {
    return (
      <ErrorPage message="No onboarding link was provided. Please use the link sent to you by email." />
    );
  }

  let data: TokenData | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(
      `${N8N_URL}/webhook/validate-token?token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    if (json.error || !json.link_id) {
      error =
        json.message ??
        "This link is invalid, has already been used, or has expired.";
    } else {
      data = json as TokenData;
    }
  } catch {
    error = "Could not verify your link. Please check your connection and try again.";
  }

  if (error || !data) {
    return <ErrorPage message={error ?? "Invalid link."} />;
  }

  return (
    <OnboardForm
      token={token}
      data={data}
      submitUrl={`${N8N_URL}/webhook/submit-docs`}
    />
  );
}

function LogoWhite({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 40"
      fill="none"
      className={className}
      aria-label="ConveyClear"
    >
      <g fill="white">
        <rect x="0" y="16" width="8" height="24" rx="1" />
        <rect x="4" y="0" width="2" height="40" rx="1" />
        <rect x="10" y="16" width="8" height="24" rx="1" />
        <rect x="0" y="14" width="18" height="3" rx="1" />
      </g>
      <text
        x="24"
        y="28"
        fontFamily="system-ui, sans-serif"
        fontSize="14"
        fontWeight="700"
        fill="white"
      >
        ConveyClear
      </text>
    </svg>
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#1B2E6B] px-6 py-4 flex items-center">
        <LogoWhite className="h-8 w-auto" />
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Link Invalid or Expired
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
          <p className="mt-6 text-xs text-gray-400">
            If you believe this is an error, contact ConveyClear at{" "}
            <a
              href="mailto:info@conveyclear.co.za"
              className="text-[#1B2E6B] underline"
            >
              info@conveyclear.co.za
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
