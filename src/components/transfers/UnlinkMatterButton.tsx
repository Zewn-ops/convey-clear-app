"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

// Detach a matter from its transfer. The matter itself is untouched — only the
// transfer_id link is cleared.
export default function UnlinkMatterButton({ matterId }: { matterId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const unlink = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/property-transfers/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId, transfer_id: null }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not unlink the matter");
    toast.success("Matter unlinked");
    router.refresh();
  };

  return (
    <button
      onClick={unlink}
      disabled={loading}
      className="text-xs font-medium text-ink-3 hover:text-red-600 disabled:opacity-50"
    >
      {loading ? "Unlinking…" : "Unlink"}
    </button>
  );
}
