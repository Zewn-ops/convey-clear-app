"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import { UploadCloud, Copy, Check, ExternalLink } from "lucide-react";

// Staff-facing "collect FICA docs" control on a matter. Mints (or reuses) an
// onboarding link on demand so docs can be gathered at any point in the matter,
// not only at creation. Shows a copyable link + opens the proven /onboard flow.
export default function CollectFicaButton({ matterId, fica = true }: { matterId: string; fica?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const noun = fica ? "FICA documents" : "documents"; // COO has no FICA (A7)

  const getLink = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/onboarding-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not create the link");
    setToken(json.token);
  };

  const link = token ? `${window.location.origin}/onboard?token=${token}` : "";

  const copy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (token) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2 w-full">
        <p className="text-xs font-medium text-green-900">
          {fica ? "FICA document" : "Document"} link — valid 7 days, single use
        </p>
        <div className="rounded bg-white border border-green-200 px-3 py-2 text-xs font-mono text-gray-700 break-all">
          {link}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy link</>}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.open(link, "_blank", "noopener")}>
            Open form <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button size="sm" variant="secondary" loading={loading} onClick={getLink}>
      <UploadCloud className="h-4 w-4" /> Collect {noun}
    </Button>
  );
}
