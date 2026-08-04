import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { ArrowLeft, Pencil } from "lucide-react";
import { formatDate, municipalityLabel } from "@/lib/utils";
import {
  isStaffRole,
  isAdminRole,
  PARTNER_TYPE_LABELS,
  type AppUser,
  type Firm,
  type PropertyTransfer,
} from "@/types";

export const metadata = { title: "Firm — ConveyClear Admin" };
export const dynamic = "force-dynamic";

type MatterRow = {
  id: string;
  title: string;
  status: string;
  municipality: string | null;
  partner_file_ref: string | null;
  created_at: string;
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-1">{value || "—"}</p>
    </div>
  );
}

export default async function AdminFirmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");
  const canWrite = isAdminRole(session.profile?.role);

  const supabase = await createClient();
  const { data: firmRow } = await supabase.from("firms").select("*").eq("id", id).maybeSingle();
  if (!firmRow) notFound();
  const firm = firmRow as Firm;

  // A transfer references a firm through EITHER the attorney or the estate-agent
  // column, so both are matched here.
  const [{ data: userRows }, { data: matterRows }, { data: transferRows }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, first_name, last_name, role, active")
      .eq("business_partner_id", id)
      .order("created_at"),
    supabase
      .from("matters")
      .select("id, title, status, municipality, partner_file_ref, created_at")
      .eq("business_partner_id", id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("property_transfers")
      .select("id, reference, status, property_description, business_partner_id")
      .or(`business_partner_id.eq.${id},estate_agent_partner_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const users = (userRows as Pick<AppUser, "id" | "email" | "full_name" | "first_name" | "last_name" | "role" | "active">[] | null) ?? [];
  const matters = (matterRows as MatterRow[] | null) ?? [];
  const transfers = (transferRows as (Pick<PropertyTransfer, "id" | "reference" | "status" | "property_description"> & { business_partner_id: string | null })[] | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/admin/firms" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to firms
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{firm.name}</h1>
            {firm.abbreviation && (
              <span className="font-mono text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{firm.abbreviation}</span>
            )}
            {!firm.active && <Badge label="Inactive" variant="gray" />}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {PARTNER_TYPE_LABELS[firm.partner_type] ?? firm.partner_type} · added {formatDate(firm.created_at)}
          </p>
        </div>
        {canWrite && (
          <Link
            href={`/admin/firms/${firm.id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" /> Edit firm
          </Link>
        )}
      </div>

      {!firm.abbreviation && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            <strong>No short code set.</strong> The matter detail page shows a firm&apos;s abbreviation
            beside its name. Add one under <em>Edit firm</em>.
          </p>
        </Card>
      )}

      <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Primary email" value={firm.primary_email} />
        <Field label="Primary cell" value={firm.primary_cell} />
        <Field label="Physical address" value={firm.physical_address} />
        <Field label="Short code" value={firm.abbreviation} />
        {firm.notes && (
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</p>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{firm.notes}</p>
          </div>
        )}
      </Card>

      <Card padding="none">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Partner users ({users.length})</h2>
          {canWrite && (
            <Link href="/admin/users" className="text-[#E8521A] hover:underline text-xs font-medium">
              Users &amp; Access
            </Link>
          )}
        </div>
        <div className="divide-y divide-gray-50">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {u.full_name || [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                </p>
                <p className="text-xs text-gray-500">{u.email}</p>
              </div>
              {!u.active && <Badge label="Disabled" variant="gray" />}
            </div>
          ))}
          {users.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              No logins for this firm yet. Create one under Users &amp; Access.
            </p>
          )}
        </div>
      </Card>

      <Card padding="none">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Matters ({matters.length})</h2>
          <p className="text-xs text-gray-500 mt-0.5">Most recent 25.</p>
        </div>
        <div className="divide-y divide-gray-50">
          {matters.map((m) => (
            <Link key={m.id} href={`/admin/matters/${m.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
              <div>
                <p className="text-sm font-medium text-gray-900">{m.title}</p>
                <p className="text-xs text-gray-500">
                  {municipalityLabel(m.municipality)}
                  {m.partner_file_ref && ` · ${m.partner_file_ref}`}
                </p>
              </div>
              <span className="text-xs text-gray-400">{formatDate(m.created_at)}</span>
            </Link>
          ))}
          {matters.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No matters for this firm yet.</p>
          )}
        </div>
      </Card>

      <Card padding="none">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Property transfers ({transfers.length})</h2>
          <p className="text-xs text-gray-500 mt-0.5">Where this firm is the conveyancing attorney or the estate agent.</p>
        </div>
        <div className="divide-y divide-gray-50">
          {transfers.map((t) => (
            <Link key={t.id} href={`/admin/property-transfers/${t.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
              <div>
                <p className="text-sm font-medium text-gray-900">{t.reference}</p>
                {t.property_description && <p className="text-xs text-gray-500">{t.property_description}</p>}
              </div>
              <span className="text-xs text-gray-400">
                {t.business_partner_id === firm.id ? "Attorney" : "Estate agent"}
              </span>
            </Link>
          ))}
          {transfers.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No property transfers for this firm yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
