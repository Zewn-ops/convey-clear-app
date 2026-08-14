import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { municipalityLabel } from "@/lib/utils";
import { Building, Plus } from "lucide-react";

export const metadata = { title: "Properties — ConveyClear Admin" };
export const dynamic = "force-dynamic";

// The property as an entity (056, Meeting 2 §44/§106). Transfers link TO a
// property; this is where the rates account, deed number and address live.
interface Row {
  id: string;
  label: string;
  erf_number: string | null;
  address: string | null;
  suburb: string | null;
  municipality: string | null;
  rates_account_no: string | null;
  active: boolean;
  clients?: { full_name: string | null; business_name: string | null } | null;
  property_transfers?: { id: string }[] | null;
}

export default async function PropertiesPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("id, label, erf_number, address, suburb, municipality, rates_account_no, active, clients(full_name, business_name), property_transfers(id)")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data as Row[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Properties</h1>
          <p className="text-sm text-ink-3 mt-1">
            The property itself — rates account, deed number, address. Transfers link to it.
          </p>
        </div>
        <Link
          href="/admin/properties/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 shrink-0"
        >
          <Plus className="h-4 w-4" /> New property
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Building className="h-8 w-8 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-3">No properties yet.</p>
            <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
              Existing transfers were not converted automatically — their property description is
              free text, and splitting it would have invented duplicates. Create them as you go.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((p) => {
            const owner = p.clients?.business_name?.trim() || p.clients?.full_name?.trim() || null;
            const transferCount = p.property_transfers?.length ?? 0;
            return (
              <Link key={p.id} href={`/admin/properties/${p.id}`}>
                <Card className="h-full hover:border-line-strong transition-colors space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-semibold text-ink">{p.label}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Always shown, both states — the pill IS the status, so
                          rendering it only when inactive would leave staff
                          guessing whether a bare card means active or unset. */}
                      <Badge label={p.active ? "Active" : "Inactive"} variant={p.active ? "success" : "danger"} />
                      {transferCount > 0 && (
                        <Badge label={`${transferCount} transfer${transferCount === 1 ? "" : "s"}`} variant="info" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-ink-3">
                    {[p.address, p.suburb, municipalityLabel(p.municipality)].filter(Boolean).join(" · ") || "No address captured"}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3 pt-1">
                    {p.erf_number && <span>Erf {p.erf_number}</span>}
                    {p.rates_account_no && <span>Rates {p.rates_account_no}</span>}
                    {owner && <span className="text-ink-2">{owner}</span>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
