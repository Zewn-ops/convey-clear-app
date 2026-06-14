"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Upload, ExternalLink } from "lucide-react";

// Lets a partner complete FICA / upload documents on behalf of a referred client
// via the proven /onboard flow. We mint (or reuse) an onboarding link server-side
// — ownership is verified there — then open the secure form.
export default function PartnerDocUpload({ matterId }: { matterId: string }) {
  const [loading, setLoading] = useState(false);

  const openOnboarding = async () => {
    setLoading(true);
    const res = await fetch("/api/partner/onboarding-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not open the upload form");
    window.open(`/onboard?token=${json.token}`, "_blank", "noopener");
  };

  return (
    <Card className="border-[#E8521A]/30 bg-[#E8521A]/5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[#E8521A]/10 p-2.5">
            <Upload className="h-5 w-5 text-[#E8521A]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Complete onboarding / upload documents</p>
            <p className="text-xs text-gray-600">
              Open the secure FICA form to upload your client&apos;s ID, proof of address and signed authorisations.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={openOnboarding} loading={loading}>
          Open upload form <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
