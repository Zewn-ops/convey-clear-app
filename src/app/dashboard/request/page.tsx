import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import RequestServiceForm from "@/components/dashboard/RequestServiceForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Request a Service — ConveyClear" };

export default async function RequestServicePage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");

  const supabase = await createClient();
  const { data: services } = await supabase.from("services").select("id, code, name").order("name");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-[#1B2E6B]">Request a service</h1>
        <p className="text-sm text-gray-500 mt-1">Tell us what you need and we&apos;ll get started.</p>
      </div>
      <RequestServiceForm services={(services as { id: string; code: string; name: string }[] | null) ?? []} />
    </div>
  );
}
