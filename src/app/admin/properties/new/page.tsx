import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole, clientDisplayName } from "@/types";
import PropertyForm from "@/components/properties/PropertyForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "New Property — ConveyClear Admin" };
export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, full_name, first_name, last_name, business_name")
    .order("created_at", { ascending: false })
    .limit(300);

  const entities = ((clientRows as Parameters<typeof clientDisplayName>[0][] | null) ?? []).map((c) => ({
    id: (c as { id: string }).id,
    label: clientDisplayName(c),
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/properties" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to properties
      </Link>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">New property</h1>
        <p className="text-sm text-ink-3 mt-1">Only the name is required — fill the rest as you learn it.</p>
      </div>
      <PropertyForm entities={entities} />
    </div>
  );
}
