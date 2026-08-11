import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TransferCard from "@/components/transfers/TransferCard";
import EmptyState from "@/components/ui/EmptyState";
import { type PropertyTransfer } from "@/types";
import { Plus, Building2 } from "lucide-react";

export const metadata = { title: "Property Transfers — ConveyClear Partner" };
export const dynamic = "force-dynamic";

// Read-only. RLS (property_transfers_read_scoped) already limits these rows to
// the caller's own firm — no extra filter needed here.
export default async function PartnerTransfersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_transfers")
    .select("*")
    .order("created_at", { ascending: false });

  const transfers = (data as PropertyTransfer[] | null) ?? [];

  const counts = new Map<string, number>();
  if (transfers.length) {
    const { data: linked } = await supabase
      .from("matters")
      .select("transfer_id")
      .in("transfer_id", transfers.map((t) => t.id));
    (linked ?? []).forEach((m) => {
      const tid = (m as { transfer_id: string | null }).transfer_id;
      if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Property transfers</h1>
          <p className="mt-2.5 text-[15px] font-medium text-ink-3">
            {transfers.length} transfer{transfers.length === 1 ? "" : "s"} · every matter in one transaction, together
          </p>
        </div>
        <Link
          href="/partner/transfers/new"
          className="inline-flex shrink-0 items-center gap-1.5 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <Plus className="h-4 w-4" /> Request a transfer
        </Link>
      </div>

      {transfers.length === 0 ? (
        <EmptyState
          title="No property transfers yet"
          icon={<Building2 className="h-6 w-6" />}
          action={
            <Link href="/partner/transfers/new" className="text-[12.5px] font-bold text-action hover:underline">
              Request one
            </Link>
          }
        >
          A transfer groups every matter in one transaction, so the clearance, the change of ownership
          and the refund sit together instead of side by side in a list.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {transfers.map((t) => (
            <TransferCard
              key={t.id}
              transfer={t}
              href={`/partner/transfers/${t.id}`}
              matterCount={counts.get(t.id) ?? 0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
