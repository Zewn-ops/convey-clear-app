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
  status: "pending" | "changes_requested" | "approved" | "declined";
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
  // WHO at the firm asked (§92). Stored since 055 and never shown — so staff
  // could see "Sterling & Hayes" but not which of their conveyancers to reply
  // to, which is the one thing you want before approving or declining.
  requester?: { full_name: string | null; email: string | null } | null;
}

/** The requester as a person: their name, falling back to the address. */
function requesterLabel(r: RequestRow): string | null {
  const u = r.requester;
  if (!u) return null;
  return u.full_name?.trim() || u.email || null;
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
    // The requester relation is named explicitly: transfer_requests has TWO FKs
    // to users (requested_by and reviewed_by), so an unqualified users(...) is
    // ambiguous and PostgREST refuses it.
    .select(
      "id, status, property_description, municipality, suggested_reference, seller_name, seller_email, seller_cell, buyer_name, buyer_email, buyer_cell, notes, decline_reason, transfer_id, created_at, firms(name), requester:users!transfer_requests_requested_by_fkey(full_name, email)"
    )
    // 078 — a firm's unfinished draft is not a request. RLS already hides it
    // from staff entirely; this is defence in depth alongside it, and it says
    // out loud what the split below assumes. Without either, a draft would land
    // in "decided" — that filter is `status !== 'pending'`.
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data as RequestRow[] | null) ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  // 089 — sent back, and not yet returned. NOT "decided": nothing was decided,
  // we asked a question and are waiting for the answer. Filed with the decided
  // list would bury it; filed with pending would put it in a queue staff work
  // through, when the ball is with the firm.
  const awaitingFirm = rows.filter((r) => r.status === "changes_requested");
  const decided = rows.filter((r) => r.status === "approved" || r.status === "declined");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          Transfer requests
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          {/* 083: the transfer already exists, in draft, from the moment the firm
              sent the request — so approving accepts the work rather than
              creating anything. The old wording said the opposite. */}
          Attorney firms asking us to open a property transfer. The transfer already exists in
          draft and the firm can upload to it; approving opens it and makes it visible to the
          buyer and seller.
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
                  {/* The firm's reference IS the transfer's (2026-08-11 §78), so
                      it belongs on the card — staff should be able to spot a
                      duplicate or a malformed code without opening the approve
                      field to find out what it says. */}
                  {r.suggested_reference && (
                    <p className="text-xs font-medium text-ink-2 mt-0.5">Ref {r.suggested_reference}</p>
                  )}
                  <p className="text-xs text-ink-3 mt-0.5">
                    {r.firms?.name ?? "Unknown firm"} · {municipalityLabel(r.municipality)} ·{" "}
                    {formatDateTime(r.created_at)}
                  </p>
                  {/* The person, on its own line and mailto-linked. Approving is
                      a reply to somebody: a decline reason that reaches "the
                      firm" reaches nobody in particular. */}
                  {requesterLabel(r) && (
                    <p className="text-xs text-ink-3 mt-0.5">
                      Requested by{" "}
                      {r.requester?.email ? (
                        <a href={`mailto:${r.requester.email}`} className="text-action hover:underline">
                          {requesterLabel(r)}
                        </a>
                      ) : (
                        <span className="text-ink-2">{requesterLabel(r)}</span>
                      )}
                    </p>
                  )}
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

      {/* 089 — with the firm, waiting on them. Between the queue and the decided
          list because that is where it sits in time: read, answered, not
          finished. The reason is shown because it is what we asked for, and
          staff chasing a slow firm need it in front of them. */}
      {awaitingFirm.length > 0 && (
        <Card className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">
              Sent back for corrections
            </p>
            <p className="mt-1 text-xs text-ink-3">
              Waiting on the firm. It returns to the queue above when they resend it.
            </p>
          </div>
          <div className="divide-y divide-line">
            {awaitingFirm.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{r.property_description}</p>
                  <p className="text-xs text-ink-3">
                    {[r.firms?.name ?? "Unknown firm", requesterLabel(r), formatDateTime(r.created_at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {r.decline_reason && (
                    <p className="mt-1 text-xs text-required">We asked for: {r.decline_reason}</p>
                  )}
                </div>
                <Badge label="With the firm" variant="warning" />
              </div>
            ))}
          </div>
        </Card>
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
                    {[
                      r.firms?.name ?? "Unknown firm",
                      requesterLabel(r),
                      formatDateTime(r.created_at),
                      r.decline_reason,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
