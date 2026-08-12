import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
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
  // 060 / §92 — a sold property stays on the seller's account rather than being
  // deleted, so the two states are shown apart instead of interleaved. Sold ones
  // go below: they are history, and history should not push the live one down
  // the page after a few years of moving house.
  const current = rows.filter((p) => p.active);
  const sold = rows.filter((p) => !p.active);

  return (
    <div className="space-y-6">
      <div>
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
        <div className="space-y-8">
          {current.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {current.map((p) => (
                <PropertyCard key={p.id} p={p} />
              ))}
            </div>
          )}

          {sold.length > 0 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Previously owned</h2>
                <p className="text-xs text-ink-3 mt-0.5">
                  Sold, and kept here so you keep the council history and documents.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {sold.map((p) => (
                  <PropertyCard key={p.id} p={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PropertyCard({ p }: { p: Row }) {
  const sold = soldOn(p.deactivated_at);
  return (
    <Card className={`space-y-2${p.active ? "" : " opacity-75"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-ink">{p.label}</p>
        {!p.active && (
          // Worded, not colour-only — the same rule the party slots follow.
          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-3">
            Sold
          </span>
        )}
      </div>
      <p className="text-xs text-ink-3">
        {[p.address, p.suburb, municipalityLabel(p.municipality)].filter(Boolean).join(" · ") ||
          "No address on file"}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3 pt-1">
        {p.erf_number && <span>Erf {p.erf_number}</span>}
        {p.rates_account_no && <span>Rates account {p.rates_account_no}</span>}
        {sold && <span>Sold {sold}</span>}
      </div>
    </Card>
  );
}
