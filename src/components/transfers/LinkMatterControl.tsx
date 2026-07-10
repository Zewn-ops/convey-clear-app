"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import { Link2 } from "lucide-react";

export interface LinkableMatter {
  id: string;
  label: string;
}

// Attach a matter to this transfer. Only shows matters that are not already
// under some other transfer — moving a matter between transfers is a deliberate
// two-step (unlink there, link here) so it can't happen by mis-click.
export default function LinkMatterControl({
  transferId,
  candidates,
}: {
  transferId: string;
  candidates: LinkableMatter[];
}) {
  const router = useRouter();
  const [matterId, setMatterId] = useState("");
  const [loading, setLoading] = useState(false);

  if (candidates.length === 0) {
    return <p className="text-sm text-gray-400">No unlinked matters available to attach.</p>;
  }

  const link = async () => {
    if (!matterId) return toast.error("Pick a matter");
    setLoading(true);
    const res = await fetch("/api/admin/property-transfers/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId, transfer_id: transferId }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not link the matter");
    toast.success("Matter linked");
    setMatterId("");
    router.refresh();
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-2">
      <label className="flex-1 text-xs font-medium text-gray-500">
        Link an existing matter
        <select
          value={matterId}
          onChange={(e) => setMatterId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
        >
          <option value="">— Select a matter —</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>
      <Button onClick={link} loading={loading} className="shrink-0">
        <Link2 className="h-4 w-4" /> Link
      </Button>
    </div>
  );
}
