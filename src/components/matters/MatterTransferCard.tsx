"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Building2 } from "lucide-react";
import { TRANSFER_STATUS_LABELS, type TransferStatus } from "@/types";

export interface MatterTransferOption {
  id: string;
  label: string;
}

export interface LinkedTransfer {
  id: string;
  reference: string;
  status: TransferStatus;
}

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s];
}

// The matter's place in a bigger property transaction (migration 026). Staff can
// attach/detach here; partners see the link read-only. Renders nothing for a
// partner on a standalone matter — an empty "no transfer" card is just noise.
export default function MatterTransferCard({
  matterId,
  transfer,
  options = [],
  manage = false,
  basePath,
}: {
  matterId: string;
  transfer: LinkedTransfer | null;
  options?: MatterTransferOption[];
  manage?: boolean;
  basePath: "/admin/property-transfers" | "/partner/transfers";
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(transfer?.id ?? "");
  const [loading, setLoading] = useState(false);

  if (!manage && !transfer) return null;

  const save = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/property-transfers/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId, transfer_id: selected || null }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not update the transfer link");
    toast.success(selected ? "Matter linked to transfer" : "Matter removed from its transfer");
    router.refresh();
  };

  return (
    <Card accent="service" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Property transfer
        </p>
        {transfer && <Badge label={TRANSFER_STATUS_LABELS[transfer.status]} variant={statusVariant(transfer.status)} />}
      </div>

      {transfer ? (
        <p className="text-sm text-ink-2">
          Part of{" "}
          <Link href={`${basePath}/${transfer.id}`} className="font-medium text-action hover:underline">
            {transfer.reference}
          </Link>
        </p>
      ) : (
        <p className="text-sm text-ink-3">Standalone matter — not part of a property transfer.</p>
      )}

      {manage && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 pt-1">
          <label className="flex-1 text-xs font-medium text-ink-3">
            Transfer
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface text-ink py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-action"
            >
              <option value="">— None (standalone) —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            onClick={save}
            disabled={loading || selected === (transfer?.id ?? "")}
            className="shrink-0 px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </Card>
  );
}
