import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getEntityContext } from "@/lib/entity";
import { entityKind } from "@/lib/entity-display";
import { getSessionProfile } from "@/lib/auth";
import { formatDate, municipalityLabel } from "@/lib/utils";
import {
  TRANSFER_STATUS_LABELS,
  type MatterDocument,
  type TransferStatus,
} from "@/types";
import Badge from "@/components/ui/Badge";

/** The 062 view: a client's own transfer, column-limited by design. */
interface ClientTransferRow {
  id: string;
  reference: string;
  property_description: string | null;
  municipality: string | null;
  status: string;
}
import { Clock, CheckCircle, FolderOpen, FileText, PlusCircle, Home } from "lucide-react";

export const metadata = { title: "Dashboard — ConveyClear" };

export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");
  const profile = session.profile;

  const supabase = await createClient();

  const { active, hasChoice } = await getEntityContext();

  // The client's property transfers. Reaches them through client_can_view_transfer()
  // (062), the party-based function, so this is their own transaction and carries
  // no other party's detail.
  const { data: transferData } = await supabase
    .from("client_transfers")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(5);
  const transfers = (transferData as ClientTransferRow[] | null) ?? [];

  const { data: documentsData } = await supabase
    .from("documents")
    .select("id, matter_id, document_type, file_name, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  const documents = (documentsData as MatterDocument[] | null) ?? [];

  // 🔴 THESE COUNT TRANSFERS, AND USED TO COUNT MATTERS. Two bugs in one row,
  // found as the buyer on production 2026-08-31:
  //
  //   1. SCOPE. The matters query was narrowed to the active entity; the
  //      transfer view cannot be (it has no client column, deliberately -- see
  //      077). So "Transfers 1 / Active 1 / Completed 1" put a figure spanning
  //      every entity beside two figures for one entity, and no reader could
  //      reconcile them.
  //   2. OBJECT. Zewn, 2026-08-26: clients "dont see matters but only see
  //      property transfers". There is no Matters link in the client nav, so
  //      these counted something the reader cannot reach or verify.
  //
  // Counted with head:true rather than from the list above, which is limit(5):
  // the old counts silently capped at the page size.
  const countTransfers = async (status?: string) => {
    let q = supabase.from("client_transfers").select("id", { count: "exact", head: true });
    if (status) q = q.eq("status", status);
    const { count } = await q;
    return count ?? 0;
  };
  const [totalCount, activeCount, completedCount] = await Promise.all([
    countTransfers(),
    countTransfers("open"),
    countTransfers("registered"),
  ]);
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const isClient = profile?.role === "client";

  // The heading names WHOSE affairs you are looking at, not who you are. On a
  // business entity "Welcome back, Thabo" was actively wrong: the matters below
  // belong to Brookfield Props, and Thabo may be one of several people acting
  // for it. A personal entity is still the person, so the greeting stays there.
  const onBusinessEntity = Boolean(active && active.entityType !== "natural_person");
  const heading = onBusinessEntity ? `${active!.name}` : `Welcome back, ${firstName}`;
  // ⚠️ "its property transfers" is only true for someone with ONE entity. The
  // switcher scopes this entity's details and FICA vault; it does NOT scope the
  // transfer list, because client_transfers reaches every transfer the caller
  // is a party to through ANY of their entities (062's can_access_client, which
  // is multi-entity aware on purpose). Naledi Dlamini, acting for a company and
  // a trust, was shown the company's transfer under the trust's name.
  const subheading = hasChoice
    ? "Every transfer you act on, across all your entities."
    : onBusinessEntity
      ? `${entityKind(active!)} entity · here's where its property transfers stand.`
      : "Here's where your property transfers stand.";

  // Zewn, 2026-08-26: clients "dont see matters but only see property transfers".
  // A matter is one service inside a transaction; the transaction is the thing a
  // seller or buyer recognises as "my house". Matters still power the Active and
  // Completed counts, because those are the honest measure of progress — they are
  // just no longer the thing being counted first or linked to.
  const stats = [
    { label: "Transfers", value: totalCount, icon: Home, tone: "text-action bg-action-fill/10" },
    { label: "Active", value: activeCount, icon: Clock, tone: "text-amber-600 bg-amber-100" },
    { label: "Completed", value: completedCount, icon: CheckCircle, tone: "text-green-600 bg-green-100" },
    { label: "Documents", value: documents.length, icon: FolderOpen, tone: "text-action bg-action-fill/10" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="page-header flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">{heading}</h1>
          <p className="text-sm text-ink-3 mt-1">{subheading}</p>
        </div>
        {isClient && (
          <Link
            href="/dashboard/request"
            className="inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90 shrink-0"
          >
            <PlusCircle className="h-4 w-4" /> Request a service
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="flex items-center gap-3">
            <div className={`rounded-lg p-2.5 ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-action">{value}</p>
              <p className="text-xs text-ink-3">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-ink">Your property transfers</h2>
          <Link href="/dashboard/transfers" className="text-sm text-action hover:underline">
            View all
          </Link>
        </div>
        {transfers.length > 0 ? (
          <ul className="space-y-3">
            {transfers.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/transfers/${t.id}`} className="block">
                  <Card className="transition-shadow duration-200 ease-out hover:shadow-lg">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t.reference}</p>
                        <p className="mt-0.5 text-[13px] text-ink-3">
                          {t.property_description || "No property description"}
                          {t.municipality ? ` · ${municipalityLabel(t.municipality)}` : ""}
                        </p>
                      </div>
                      <Badge
                        label={TRANSFER_STATUS_LABELS[t.status as TransferStatus] ?? t.status}
                        variant={t.status === "registered" ? "success" : "info"}
                      />
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="text-center py-10">
            <Home className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-ink-3 text-sm">No property transfers yet</p>
            <p className="text-ink-3 text-xs mt-1">
              One appears here once ConveyClear links you to a transaction as the buyer or the seller.
            </p>
            {isClient && (
              <Link
                href="/dashboard/request"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <PlusCircle className="h-4 w-4" /> Request a service
              </Link>
            )}
          </Card>
        )}
      </div>

      {documents.length > 0 && (
        <div>
          <h2 className="font-semibold text-ink mb-3">Recent Documents</h2>
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-line">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="h-4 w-4 text-ink-3 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {doc.file_name || doc.document_type}
                    </p>
                    <p className="text-xs text-ink-3">
                      {doc.document_type} · {formatDate(doc.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
