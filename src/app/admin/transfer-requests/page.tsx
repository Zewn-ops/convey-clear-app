import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import TransferRequestReview from "@/components/transfers/TransferRequestReview";
import { formatDateTime, municipalityLabel } from "@/lib/utils";
import { Inbox } from "lucide-react";

export const metadata = { title: "Transfer Requests — ConveyClear Admin" };
export const dynamic = "force-dynamic";

// Attorney firms asking ConveyClear to open a transfer (055). Meeting 2
// (2026-08-06) moved creation behind ConveyClear; this is where those asks land.
interface RequestRow {
  id: string;
  status: "pending" | "approved" | "declined";
  property_description: string;
  municipality: string | null;
  suggested_reference: string | null;
  seller_name: string | null;
  seller_email: string | null;
  seller_cell: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_cell: string | null;
  notes: string | null;
  decline_reason: string | null;
  transfer_id: string | null;
  created_at: string;
  firms?: { name: string } | null;
}

function Party({ label, name, email, cell }: { label: string; name: string | null; email: string | null; cell: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">{label}</p>
      {name ? (
        <>
          <p className="text-sm text-ink">{name}</p>
          {(email || cell) && (
            <p className="text-xs text-ink-3">{[email, cell].filter(Boolean).join(" · ")}</p>
          )}
        </>
      ) : (
        // Say "not supplied" rather than rendering nothing: an empty space and
        // "the firm didn't tell us" look identical, and only one is actionable.
        <p className="text-sm text-ink-3 italic">Not supplied</p>
      )}
    </div>
  );
}

export default async function TransferRequestsPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("transfer_requests")
    .select(
      "id, status, property_description, municipality, suggested_reference, seller_name, seller_email, seller_cell, buyer_name, buyer_email, buyer_cell, notes, decline_reason, transfer_id, created_at, firms(name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data as RequestRow[] | null) ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          Transfer requests
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          Attorney firms asking us to open a property transfer. Approving creates the transfer and
          gives the firm access to it.
        </p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <Inbox className="h-8 w-8 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-3">No requests waiting.</p>
            <p className="text-xs text-ink-3 mt-1">
              Firms request a transfer from their portal; new ones appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((r) => (
            <Card key={r.id} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-ink">{r.property_description}</p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    {r.firms?.name ?? "Unknown firm"} · {municipalityLabel(r.municipality)} ·{" "}
                    {formatDateTime(r.created_at)}
                  </p>
                </div>
                <Badge label="Pending" variant="warning" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-3 border-t border-line">
                <Party label="Seller" name={r.seller_name} email={r.seller_email} cell={r.seller_cell} />
                <Party label="Buyer" name={r.buyer_name} email={r.buyer_email} cell={r.buyer_cell} />
              </div>

              {r.notes && (
                <div className="pt-3 border-t border-line">
                  <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Notes</p>
                  <p className="text-sm text-ink-2 mt-1 whitespace-pre-wrap">{r.notes}</p>
                </div>
              )}

              <div className="pt-3 border-t border-line">
                <TransferRequestReview requestId={r.id} suggestedReference={r.suggested_reference} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <Card className="space-y-3">
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Decided</p>
          <div className="divide-y divide-line">
            {decided.map((r) => (
              <div key={r.id} className="py-2.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{r.property_description}</p>
                  <p className="text-xs text-ink-3">
                    {r.firms?.name ?? "Unknown firm"} · {formatDateTime(r.created_at)}
                    {r.decline_reason ? ` · ${r.decline_reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === "approved" && r.transfer_id && (
                    <Link
                      href={`/admin/property-transfers/${r.transfer_id}`}
                      className="text-xs text-action hover:underline"
                    >
                      Open transfer
                    </Link>
                  )}
                  <Badge
                    label={r.status === "approved" ? "Approved" : "Declined"}
                    variant={r.status === "approved" ? "success" : "danger"}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
