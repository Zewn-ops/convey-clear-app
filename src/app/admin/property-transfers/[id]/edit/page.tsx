import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole, clientDisplayName, STAFF_ROLES, type PropertyTransfer } from "@/types";
import TransferForm from "@/components/transfers/TransferForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Edit Property Transfer — ConveyClear Admin" };
export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
};

export default async function EditTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const [{ data: transfer }, { data: firms }, { data: clients }, { data: staff }] =
    await Promise.all([
      supabase.from("property_transfers").select("*").eq("id", id).maybeSingle(),
      supabase.from("firms").select("id, name").eq("active", true).order("name"),
      supabase
        .from("clients")
        .select("id, full_name, first_name, last_name, business_name")
        .order("created_at", { ascending: false })
        .limit(200),
      // 077 — ConveyClear staff, for the designated member. Active only:
      // naming someone who has left is worse than leaving it blank.
      supabase
        .from("users")
        .select("id, full_name, first_name, last_name, email, role")
        .in("role", STAFF_ROLES)
        .eq("active", true)
        .order("full_name"),
    ]);

  if (!transfer) notFound();

  const staffOptions = (
    (staff as
      | { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null }[]
      | null) ?? []
  ).map((u) => ({
    id: u.id,
    label:
      u.full_name ||
      [u.first_name, u.last_name].filter(Boolean).join(" ") ||
      u.email ||
      "Unnamed",
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href={`/admin/property-transfers/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to transfer
      </Link>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Edit transfer</h1>
        <p className="text-sm text-ink-3 mt-1">{(transfer as PropertyTransfer).reference}</p>
      </div>
      <TransferForm
        existing={transfer as PropertyTransfer}
        firms={((firms as { id: string; name: string }[] | null) ?? []).map((f) => ({ id: f.id, label: f.name }))}
        clients={((clients as ClientRow[] | null) ?? []).map((c) => ({ id: c.id, label: clientDisplayName(c) }))}
        staff={staffOptions}
      />
    </div>
  );
}
