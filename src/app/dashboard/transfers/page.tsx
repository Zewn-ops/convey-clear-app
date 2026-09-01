import Link from "next/link";
import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { municipalityLabel, formatDate } from "@/lib/utils";
import { TRANSFER_STATUS_LABELS, type TransferStatus } from "@/types";
import { Home } from "lucide-react";

export const metadata = { title: "My Transfers — ConveyClear" };
export const dynamic = "force-dynamic";

/**
 * A client's own property transfers (meeting 2026-08-11, Decisions + Details §96;
 * next-step §46).
 *
 * Reads `client_transfers`, NOT `property_transfers`. The view (062) is the
 * security boundary: it filters to transfers the viewer is a party to and
 * exposes only the agreed columns. The base table stays closed to clients, so
 * there is no entity filter here — adding one would be a second, weaker copy of
 * a rule the database already enforces, and the kind that drifts.
 *
 * What is deliberately NOT on this page, per the decision: the other party, the
 * attorney firm, the estate agent, internal notes, and the CC↔firm feed.
 */
interface Row {
  id: string;
  reference: string;
  property_description: string | null;
  municipality: string | null;
  status: TransferStatus;
  updated_at: string;
}

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ draft: "warning", open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s] ?? "info";
}

export default async function ClientTransfersPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("client_transfers")
    .select("id, reference, property_description, municipality, status, updated_at")
    .order("updated_at", { ascending: false });

  const rows = (data as Row[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          My transfers
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          The property transactions you are part of, and how each one is progressing.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Home className="h-8 w-8 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-3">No transfers yet.</p>
            <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
              A transfer appears here once ConveyClear links you to a property transaction as the
              buyer or the seller.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <Link key={t.id} href={`/dashboard/transfers/${t.id}`}>
              <Card className="hover:border-line-strong transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink truncate">
                      {t.property_description || t.reference}
                    </p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {[t.reference, municipalityLabel(t.municipality)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge label={TRANSFER_STATUS_LABELS[t.status]} variant={statusVariant(t.status)} />
                </div>
                <p className="text-xs text-ink-3 mt-2">Updated {formatDate(t.updated_at)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
