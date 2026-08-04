import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isAdminRole, type Firm } from "@/types";
import FirmForm from "@/components/firms/FirmForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Edit Firm — ConveyClear Admin" };
export const dynamic = "force-dynamic";

export default async function EditFirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isAdminRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase.from("firms").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href={`/admin/firms/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to firm
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit firm</h1>
      </div>
      <FirmForm existing={data as Firm} />
    </div>
  );
}
