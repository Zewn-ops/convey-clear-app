"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import { Building, Link2, Unlink } from "lucide-react";

export interface PropertyOption {
  id: string;
  label: string;
  detail: string | null;
}

export interface LinkedProperty {
  id: string;
  label: string;
  erf_number: string | null;
  rates_account_no: string | null;
  address: string | null;
}

/**
 * Link this transfer to a property (056).
 *
 * Meeting 2 §44/§106: the transfer is the central node, the property is the
 * linked entity holding rates account, deed number and (later) building plans
 * and compliance certificates. The link is nullable — a transfer can be opened
 * before anyone has built the property profile — so this card is present on
 * every transfer, filled or not, rather than only appearing once it is linked.
 * A card that only exists when populated cannot tell you it is empty.
 */
export default function TransferPropertyCard({
  transferId,
  linked,
  options,
}: {
  transferId: string;
  linked: LinkedProperty | null;
  options: PropertyOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState("");

  async function save(propertyId: string | null) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/property-transfers/property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: transferId, property_id: propertyId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not save that.");
        return;
      }
      toast.success(propertyId ? "Property linked." : "Property unlinked.");
      setSel("");
      router.refresh();
    } catch {
      toast.error("Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide flex items-center gap-1.5">
        <Building className="h-3.5 w-3.5 text-action" /> Property
      </p>

      {linked ? (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/admin/properties/${linked.id}`} className="text-sm font-medium text-action hover:underline">
              {linked.label}
            </Link>
            <p className="text-xs text-ink-3 mt-0.5">
              {[
                linked.erf_number ? `Erf ${linked.erf_number}` : null,
                linked.rates_account_no ? `Rates ${linked.rates_account_no}` : null,
                linked.address,
              ]
                .filter(Boolean)
                .join(" · ") || "No details captured yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => save(null)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-2 shrink-0 disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" /> Unlink
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-3">
            Not linked. The rates account and deed number live on the property, and linking lets one
            profile serve every transfer on it.
          </p>
          <div className="flex items-end gap-2">
            <label className="flex-1 text-xs font-medium text-ink-3">
              Property
              <select
                value={sel}
                onChange={(e) => setSel(e.target.value)}
                disabled={busy}
                className="bg-surface text-ink mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] disabled:bg-raised disabled:text-ink-3"
              >
                <option value="">— Select a property —</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                    {o.detail ? ` · ${o.detail}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => save(sel)}
              disabled={busy || !sel}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Link2 className="h-4 w-4" /> Link
            </button>
          </div>
          <Link href="/admin/properties/new" className="text-xs text-action hover:underline inline-block">
            Or create a new property →
          </Link>
        </>
      )}
    </Card>
  );
}
