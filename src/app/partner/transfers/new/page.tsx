import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePartner } from "@/lib/partner";
import TransferRequestForm from "@/components/transfers/TransferRequestForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Request a Property Transfer — ConveyClear Partner" };
export const dynamic = "force-dynamic";

// Was a direct-create form until 2026-08-07. Meeting 2 (2026-08-06) moved
// transfer creation behind ConveyClear so one vetted client database is kept
// without firms reaching each other's contacts (§84) — the firm now asks and
// ConveyClear opens it. The old PartnerTransferForm is still in the tree
// alongside the disabled route, in case Jukka wants the 07-16 behaviour back.
export default async function RequestTransferPage() {
  // Gate the page itself, not just the API — a non-partner should never see the form.
  const auth = await requirePartner();
  if ("error" in auth) redirect("/partner");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/partner/transfers" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to transfers
      </Link>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          Request a property transfer
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          Send us the transaction and ConveyClear will open it. You will be notified as soon as it
          is set up, and it will appear in your transfers.
        </p>
      </div>
      <TransferRequestForm />
    </div>
  );
}
