import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/partner";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import EmptyState from "@/components/ui/EmptyState";
import Callout from "@/components/ui/Callout";
import { formatDate, municipalityLabel } from "@/lib/utils";
import { ArrowLeft, FileEdit, ArrowUpRight, Inbox } from "lucide-react";

export const metadata = { title: "Transfer Requests — ConveyClear Partner" };
export const dynamic = "force-dynamic";

/**
 * §5.10 — a firm's own transfer requests, and why one was declined.
 *
 * Zewn: "lets also give the attorneys the option to see their previous transfer
 * requests and if declined that they can see the reason given for the declined
 * request."
 *
 * 🟢 THE DATA HAS BEEN HERE ALL ALONG. `transfer_requests.decline_reason` was
 * added by 055, whose own comment says the reason is carried *so* the firm can
 * be told — and 055's read policy already grants
 * `firm_id = app_user_partner_id()`. So this page needed no migration and no
 * policy: the reason was being recorded and then shown to nobody.
 *
 * 078 narrowed only the STAFF branch of that read policy, to hide drafts from
 * ConveyClear. The firm's own branch is untouched, which is why a firm still
 * sees its drafts here alongside everything else.
 */

type RequestRow = {
  id: string;
  status: "draft" | "pending" | "changes_requested" | "approved" | "declined";
  property_description: string | null;
  municipality: string | null;
  suggested_reference: string | null;
  decline_reason: string | null;
  transfer_id: string | null;
  created_at: string;
  updated_at: string;
};

const TONE: Record<RequestRow["status"], StatusTone> = {
  draft: "neutral",
  pending: "waiting",
  // 089 — the firm is the blocker here, which is what `required` means in this
  // portal's vocabulary. `pending` is amber because WE are; this is not the same
  // state wearing a different word.
  changes_requested: "required",
  approved: "ok",
  declined: "danger",
};

const LABEL: Record<RequestRow["status"], string> = {
  draft: "Draft",
  // Says what to DO, not what happened. "Temporarily declined" was Jukka's
  // phrase for the mechanism; what the attorney needs is the instruction.
  changes_requested: "Needs your correction",
  // "With ConveyClear" rather than "Pending", which reads as though the firm
  // still has something to do. The waiting tone means somebody else is the
  // blocker (DESIGN.md's orange/amber split) and the words should agree.
  pending: "With ConveyClear",
  approved: "Opened",
  declined: "Declined",
};

export default async function TransferRequestsPage() {
  const auth = await requirePartner();
  if ("error" in auth) redirect("/partner");

  const supabase = await createClient();
  const { data } = await supabase
    .from("transfer_requests")
    .select(
      "id, status, property_description, municipality, suggested_reference, decline_reason, transfer_id, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  const rows = (data as RequestRow[] | null) ?? [];
  const open = rows.filter(
    (r) => r.status === "draft" || r.status === "pending" || r.status === "changes_requested"
  );
  const settled = rows.filter((r) => r.status === "approved" || r.status === "declined");

  const title = (r: RequestRow) =>
    r.property_description?.trim() || r.suggested_reference?.trim() || "Untitled request";

  const row = (r: RequestRow) => (
    <div key={r.id} className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{title(r)}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            {[
              r.suggested_reference?.trim(),
              r.municipality ? municipalityLabel(r.municipality) : null,
              // A draft has not been sent to anybody, and the line above
              // this list says so. Matches the transfers-page banner,
              // which also reads "Saved" off updated_at.
              r.status === "draft"
                ? `Saved ${formatDate(r.updated_at)}`
                : r.status === "changes_requested"
                  ? `Sent back ${formatDate(r.updated_at)}`
                  : `Sent ${formatDate(r.created_at)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusPill tone={TONE[r.status]}>{LABEL[r.status]}</StatusPill>
          {(r.status === "draft" || r.status === "changes_requested") && (
            <Link
              href={`/partner/transfers/new?draft=${r.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-action hover:underline"
            >
              <FileEdit className="h-3.5 w-3.5" />{" "}
              {r.status === "draft" ? "Finish" : "Correct and resend"}
            </Link>
          )}
          {r.status === "approved" && r.transfer_id && (
            <Link
              href={`/partner/transfers/${r.transfer_id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-action hover:underline"
            >
              Open transfer <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* The whole point of the page. A declined request that does not say why
          is the thing this replaces — the firm watched it vanish and phoned to
          ask. Rendered even when the reason is blank, because "declined with no
          reason recorded" is itself the answer and hiding it would send them
          back to the phone. */}
      {/* 089 — the correction, in the same place a decline is explained, because
          it is the same question: what is ConveyClear telling us? */}
      {r.status === "changes_requested" && (
        <div className="mt-3">
          <Callout tone="required" label="What needs correcting">
            {r.decline_reason?.trim() || (
              <span className="text-ink-3">
                No detail was recorded. Ask ConveyClear — this should not happen.
              </span>
            )}
          </Callout>
        </div>
      )}

      {r.status === "declined" && (
        <div className="mt-3">
          <Callout tone="required" label="Why it was declined">
            {r.decline_reason?.trim() || (
              <span className="text-ink-3">
                No reason was recorded. Ask ConveyClear — this should not happen.
              </span>
            )}
          </Callout>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/partner/transfers"
        className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to transfers
      </Link>

      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          Transfer requests
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          Everything your firm has asked ConveyClear to open, and what happened
          to it.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No requests yet" icon={<Inbox className="h-6 w-6" />}>
          When you ask ConveyClear to open a transfer it appears here, with its
          progress and — if it is declined — the reason.
        </EmptyState>
      ) : (
        <>
          {open.length > 0 && (
            <Card padding="none" className="overflow-hidden">
              <div className="border-b border-line px-5 py-3">
                <h2 className="text-sm font-semibold text-ink">
                  In progress ({open.length})
                </h2>
                <p className="mt-0.5 text-xs text-ink-3">
                  {/* NOT "yours alone": 078 left the firm's own branch of
                      055's read policy as `firm_id = app_user_partner_id()`,
                      so a colleague at the same firm sees this draft --
                      confirmed on production 2026-08-31. Only ConveyClear is
                      shut out until it is sent. Matches the transfers-page
                      banner, which said it correctly all along. */}
                  Visible to your firm. ConveyClear is not told about a draft
                  until you send it.
                </p>
              </div>
              <div className="divide-y divide-line">{open.map(row)}</div>
            </Card>
          )}

          {settled.length > 0 && (
            <Card padding="none" className="overflow-hidden">
              <div className="border-b border-line px-5 py-3">
                <h2 className="text-sm font-semibold text-ink">
                  Decided ({settled.length})
                </h2>
              </div>
              <div className="divide-y divide-line">{settled.map(row)}</div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
