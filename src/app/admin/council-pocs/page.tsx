import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import CouncilPocManager from "@/components/admin/CouncilPocManager";
import { isStaffRole, type CouncilPoc } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Council POCs — ConveyClear Admin" };

// B5 / Theme G — internal directory of council points-of-contact (staff only).
export default async function AdminCouncilPocsPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("council_pocs")
    .select("*")
    .order("council", { ascending: true })
    .order("first_name", { ascending: true });

  const pocs = (data as CouncilPoc[] | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Council POCs</h1>
        <p className="text-sm text-gray-500 mt-1">
          {pocs.length} council contact{pocs.length === 1 ? "" : "s"} · internal directory — not visible to partners or clients
        </p>
      </div>

      <CouncilPocManager initialPocs={pocs} />
    </div>
  );
}
