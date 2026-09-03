import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePartner } from "@/lib/partner";
import { createClient } from "@/lib/supabase/server";
import TransferRequestForm, {
  type TransferRequestDraft,
} from "@/components/transfers/TransferRequestForm";
import { ArrowLeft } from "lucide-react";
import Callout from "@/components/ui/Callout";

export const metadata = { title: "Request a Property Transfer — ConveyClear Partner" };
export const dynamic = "force-dynamic";

// Was a direct-create form until 2026-08-07. Meeting 2 (2026-08-06) moved
// transfer creation behind ConveyClear so one vetted client database is kept
// without firms reaching each other's contacts (§84) — the firm now asks and
// ConveyClear opens it. The old PartnerTransferForm is still in the tree
// alongside the disabled route, in case Jukka wants the 07-16 behaviour back.
export default async function RequestTransferPage({
  searchParams,
}: {
  searchParams?: Promise<{ draft?: string }>;
}) {
  // Gate the page itself, not just the API — a non-partner should never see the form.
  const auth = await requirePartner();
  if ("error" in auth) redirect("/partner");

  // 078 — resuming an unfinished request. RLS is the scope: a draft is
  // readable only by the firm that owns it, so a guessed id from another firm
  // simply returns nothing and the page renders a blank form rather than
  // leaking that the row exists.
  const params = await searchParams;
  const draftId = params?.draft;
  let draft: TransferRequestDraft | null = null;
  if (draftId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("transfer_requests")
      // 088's party detail comes back too, so resuming a draft restores the
      // entity type, the identifying number, the extra emails and the directors
      // rather than silently dropping half of what was typed.
      .select(
        "id, status, decline_reason, property_description, municipality, suggested_reference, seller_name, seller_email, seller_cell, seller_entity_type, seller_id_number, seller_registration_no, seller_extra_emails, seller_directors, buyer_name, buyer_email, buyer_cell, buyer_entity_type, buyer_id_number, buyer_registration_no, buyer_extra_emails, buyer_directors, notes"
      )
      .eq("id", draftId)
      // 089 — a returned request resumes through the same form. RLS already
      // decides whether this firm may edit it; the status filter here only keeps
      // an approved or declined request from being reopened as a draft.
      .in("status", ["draft", "changes_requested"])
      .maybeSingle();
    draft = (data as TransferRequestDraft | null) ?? null;
  }
  const returned = (draft as { status?: string } | null)?.status === "changes_requested";
  const reason = (draft as { decline_reason?: string | null } | null)?.decline_reason ?? null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/partner/transfers" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to transfers
      </Link>
      <div>
        {/* 🔴 A RETURNED REQUEST IS NOT A DRAFT, and the draft copy lied to the
            firm about it: "Nothing here has reached ConveyClear yet" appeared on
            a request ConveyClear had read, answered and sent back. Found by
            walking the round trip, 2026-09-02. Three states, three sentences. */}
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          {returned
            ? "Correct and resend"
            : draft
              ? "Finish your request"
              : "Request a property transfer"}
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          {returned
            ? "ConveyClear looked at this and sent it back. Fix what they asked for and send it again — the transfer stays where it is."
            : draft
            ? "Picking up where you left off. Nothing here has reached ConveyClear yet."
            : // 083 changed what happens when this is sent, and the copy still
              // described the old behaviour: nothing existed until ConveyClear
              // approved it. The transfer is now created immediately, in draft,
              // and the firm can start uploading to it straight away — which is
              // the half Jukka signed off on ("they can still go in and upload
              // to that transfer while it's in draft state"). Saying so here is
              // the difference between a form you send and wait on, and one that
              // opens the file you were about to work.
              "Sending this opens the transfer straight away, in draft, so you can start uploading documents while you wait. ConveyClear reviews it and confirms — you will be notified then."}
        </p>
      </div>
      {/* What was asked for, on the form where it gets fixed. The firm reached
          this page from a callout on the requests list; carrying the reason over
          means they do not have to hold it in their head while they edit. */}
      {returned && reason && (
        <Callout tone="required" label="What needs correcting">
          {reason}
        </Callout>
      )}

      <TransferRequestForm draft={draft} />
    </div>
  );
}
