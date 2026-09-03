import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { municipalityLabel } from "@/lib/utils";
import { Building } from "lucide-react";

export const metadata = { title: "My Properties — ConveyClear" };
export const dynamic = "force-dynamic";

/**
 * The client's Properties tab (Meeting 2 §98).
 *
 * No explicit entity filter here: properties_read routes through
 * can_access_property(), which already resolves the viewer's entities via
 * can_access_client (multi-entity aware since 049). Adding a WHERE client_id =
 * … on top would be a second, weaker copy of that rule — and the kind that
 * drifts out of step with the policy it duplicates.
 */
interface Row {
  id: string;
  label: string;
  erf_number: string | null;
  address: string | null;
  suburb: string | null;
  municipality: string | null;
  rates_account_no: string | null;
  active: boolean;
  deactivated_at: string | null;
}

const soldOn = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" })
    : null;

export default async function ClientPropertiesPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("id, label, erf_number, address, suburb, municipality, rates_account_no, active, deactivated_at")
    .order("created_at", { ascending: false });

  const rows = (data as Row[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          My properties
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          The properties on your account, with their council details.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Building className="h-8 w-8 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-3">No properties yet.</p>
            <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
              Properties appear here once ConveyClear links them to your account.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((p) => {
            const since = soldOn(p.deactivated_at);
            return (
              <Card key={p.id} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-semibold text-ink">{p.label}</p>
                  {/* 060 / §92 — one list, always. A sold property never leaves
                      the client's dashboard (Zewn, 2026-08-14); the pill is the
                      only thing that changes. Labelled as well as coloured, so
                      it does not depend on telling green from red. */}
                  <Badge label={p.active ? "Active" : "Inactive"} variant={p.active ? "success" : "danger"} />
                </div>
                <p className="text-xs text-ink-3">
                  {[p.address, p.suburb, municipalityLabel(p.municipality)].filter(Boolean).join(" · ") ||
                    "No address on file"}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3 pt-1">
                  {p.erf_number && <span>Erf {p.erf_number}</span>}
                  {p.rates_account_no && <span>Rates account {p.rates_account_no}</span>}
                  {!p.active && since && <span>Sold {since}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
