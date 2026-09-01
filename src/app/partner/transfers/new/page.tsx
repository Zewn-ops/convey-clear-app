import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePartner } from "@/lib/partner";
import { createClient } from "@/lib/supabase/server";
import TransferRequestForm, {
  type TransferRequestDraft,
} from "@/components/transfers/TransferRequestForm";
import { ArrowLeft } from "lucide-react";

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
      .select(
        "id, property_description, municipality, suggested_reference, seller_name, seller_email, seller_cell, buyer_name, buyer_email, buyer_cell, notes"
      )
      .eq("id", draftId)
      .eq("status", "draft")
      .maybeSingle();
    draft = (data as TransferRequestDraft | null) ?? null;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/partner/transfers" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to transfers
      </Link>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          {draft ? "Finish your request" : "Request a property transfer"}
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          {draft
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
      <TransferRequestForm draft={draft} />
    </div>
  );
}
