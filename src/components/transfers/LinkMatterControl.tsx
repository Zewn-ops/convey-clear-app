"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import SearchSelect from "@/components/ui/SearchSelect";
import { Link2 } from "lucide-react";

export interface LinkableMatter {
  id: string;
  label: string;
}

// Attach a matter to this transfer. Only shows matters that are not already
// under some other transfer — moving a matter between transfers is a deliberate
// two-step (unlink there, link here) so it can't happen by mis-click.
//
// `endpoint` lets the partner detail page point this at the firm-scoped route
// (/api/partner/transfers/link) instead of the staff one — same UI, tighter
// authorisation on the server.
export default function LinkMatterControl({
  transferId,
  candidates,
  endpoint = "/api/admin/property-transfers/link",
}: {
  transferId: string;
  candidates: LinkableMatter[];
  endpoint?: string;
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
    const res = await fetch(endpoint, {
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
      {/* Searchable: a matter's title is a long code (COT_COO_SMITH_ERF123), and
          picking one out of a raw dropdown of every unlinked matter is guesswork
          the moment there are more than a screenful. */}
      <div className="flex-1">
        <SearchSelect
          label="Link an existing matter"
          value={matterId}
          onChange={setMatterId}
          options={candidates.map((m) => ({ value: m.id, label: m.label }))}
          placeholder="Search by matter, client or property…"
          emptyLabel="— Select a matter —"
        />
      </div>
      <Button onClick={link} loading={loading} className="shrink-0">
        <Link2 className="h-4 w-4" /> Link
      </Button>
    </div>
  );
}
