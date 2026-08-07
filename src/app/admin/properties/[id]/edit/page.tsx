import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole, clientDisplayName } from "@/types";
import PropertyForm, { type PropertyInitial } from "@/components/properties/PropertyForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Edit Property — ConveyClear Admin" };
export const dynamic = "force-dynamic";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const [{ data: property }, { data: clientRows }] = await Promise.all([
    supabase.from("properties").select("*").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id, full_name, first_name, last_name, business_name")
      .order("created_at", { ascending: false }).limit(300),
  ]);
  if (!property) notFound();

  const entities = ((clientRows as Parameters<typeof clientDisplayName>[0][] | null) ?? []).map((c) => ({
    id: (c as { id: string }).id,
    label: clientDisplayName(c),
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href={`/admin/properties/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to property
      </Link>
      <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Edit property</h1>
      <PropertyForm initial={property as PropertyInitial} entities={entities} />
    </div>
  );
}
