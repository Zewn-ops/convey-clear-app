"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Upload, ExternalLink } from "lucide-react";

// Lets a logged-in client upload documents for their own matter via the secure
// /onboard flow. The link is minted server-side (ownership verified).
export default function ClientDocUpload({ matterId }: { matterId: string }) {
  const [loading, setLoading] = useState(false);

  const open = async () => {
    setLoading(true);
    const res = await fetch("/api/client/onboarding-link", {
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
            <p className="font-semibold text-gray-900 text-sm">Upload your documents</p>
            <p className="text-xs text-gray-600">Securely submit your ID, proof of address and signed forms (FICA).</p>
          </div>
        </div>
        <Button variant="secondary" onClick={open} loading={loading}>
          Upload documents <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
