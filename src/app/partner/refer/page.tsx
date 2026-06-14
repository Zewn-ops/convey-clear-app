import { createClient } from "@/lib/supabase/server";
import ReferForm from "@/components/partner/ReferForm";

export const metadata = { title: "Refer a matter — ConveyClear Partner" };

export default async function PartnerReferPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("id, code, name")
    .order("name");
  const services = (data as { id: string; code: string; name: string }[] | null) ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Refer a matter</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create a new client matter. ConveyClear takes it from here — you can complete the FICA upload now or later.
        </p>
      </div>
      <ReferForm services={services} />
    </div>
  );
}
