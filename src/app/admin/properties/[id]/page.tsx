import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole, clientDisplayName, TRANSFER_STATUS_LABELS, type TransferStatus } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { municipalityLabel, formatDate } from "@/lib/utils";
import PropertyActiveToggle from "@/components/properties/PropertyActiveToggle";
import { ArrowLeft, Pencil, Building2 } from "lucide-react";

export const metadata = { title: "Property — ConveyClear Admin" };
export const dynamic = "force-dynamic";

// A property profile (056). Meeting 2 §106: this is where the rates account,
// building plans and compliance certificates live, with transfers linking in.
interface PropertyRow {
  id: string;
  label: string;
  erf_number: string | null;
  address: string | null;
  suburb: string | null;
  municipality: string | null;
  province: string | null;
  rates_account_no: string | null;
  title_deed_no: string | null;
  notes: string | null;
  client_id: string | null;
  active: boolean;
  deactivated_at: string | null;
  clients?: { id: string; full_name: string | null; first_name: string | null; last_name: string | null; business_name: string | null } | null;
}

interface TransferRow {
  id: string;
  reference: string;
  status: TransferStatus;
  created_at: string;
}

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  const map: Record<string, "info" | "success" | "danger" | "warning"> = {
    open: "info", registered: "success", cancelled: "danger", on_hold: "warning",
  };
  return map[s] ?? "info";
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("*, clients(id, full_name, first_name, last_name, business_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const property = data as PropertyRow;

  const { data: transferData } = await supabase
    .from("property_transfers")
    .select("id, reference, status, created_at")
    .eq("property_id", id)
    .order("created_at", { ascending: false });
  const transfers = (transferData as TransferRow[] | null) ?? [];

  const facts: { label: string; value: string | null }[] = [
    { label: "Erf number", value: property.erf_number },
    { label: "Title deed", value: property.title_deed_no },
    { label: "Rates account", value: property.rates_account_no },
    { label: "Address", value: property.address },
    { label: "Suburb", value: property.suburb },
    { label: "Municipality", value: property.municipality ? municipalityLabel(property.municipality) : null },
    { label: "Province", value: property.province },
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin/properties" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to properties
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
              {property.label}
            </h1>
            <Badge label={property.active ? "Active" : "Inactive"} variant={property.active ? "success" : "danger"} />
          </div>
          {property.clients && (
            <p className="text-sm text-ink-3 mt-1">
              {/* Wording follows the state: after a sale this record is the
                  seller's history, and calling them the owner would be wrong. */}
              {property.active ? "Owned by" : "Previously owned by"}{" "}
              <Link href={`/admin/clients/${property.clients.id}`} className="text-action hover:underline">
                {clientDisplayName(property.clients)}
              </Link>
              {!property.active && property.deactivated_at && (
                <> · sold {new Date(property.deactivated_at).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" })}</>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PropertyActiveToggle propertyId={property.id} label={property.label} active={property.active} />
          <Link
            href={`/admin/properties/${id}/edit`}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink-2 border border-line rounded-lg hover:bg-raised shrink-0"
          >
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </div>
      </div>

      <Card className="space-y-3">
        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Details</p>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-ink-3">{f.label}</dt>
              {/* "Not captured" rather than an empty cell: a blank and a missing
                  value look identical, and only one of them is a to-do. */}
              <dd className={f.value ? "text-sm text-ink" : "text-sm text-ink-3 italic"}>
                {f.value ?? "Not captured"}
              </dd>
            </div>
          ))}
        </dl>
        {property.notes && (
          <div className="pt-3 border-t border-line">
            <p className="text-xs text-ink-3">Notes</p>
            <p className="text-sm text-ink-2 mt-1 whitespace-pre-wrap">{property.notes}</p>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">
          Transfers on this property
        </p>
        {transfers.length === 0 ? (
          <div className="py-8 text-center">
            <Building2 className="h-7 w-7 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-2">No transfers linked yet.</p>
            <p className="text-xs text-ink-3 mt-1">
              Link one from the transfer&rsquo;s own page.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {transfers.map((t) => (
              <Link
                key={t.id}
                href={`/admin/property-transfers/${t.id}`}
                className="flex items-center justify-between gap-4 py-2.5 hover:bg-raised -mx-2 px-2 rounded"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{t.reference}</p>
                  <p className="text-xs text-ink-3">{formatDate(t.created_at)}</p>
                </div>
                <Badge label={TRANSFER_STATUS_LABELS[t.status]} variant={statusVariant(t.status)} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
