import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import RequestCard from "@/components/dashboard/RequestCard";
import Button from "@/components/ui/Button";
import type { ServiceRequest } from "@/types";
import { ClipboardList, PlusCircle } from "lucide-react";

export const metadata = { title: "My Requests — ConveyClear" };

export default async function RequestsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: requests } = await supabase
    .from("service_requests")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2E6B]">My Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track the status of your service requests
          </p>
        </div>
        <Link href="/dashboard/requests/new">
          <Button variant="secondary" size="sm">
            <PlusCircle className="h-4 w-4" />
            New request
          </Button>
        </Link>
      </div>

      {requests && requests.length > 0 ? (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard key={req.id} request={req as ServiceRequest} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-14 w-14 text-gray-200 mb-4" />
          <h3 className="font-semibold text-gray-700">No requests yet</h3>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Submit your first service request to get started
          </p>
          <Link href="/dashboard/requests/new">
            <Button variant="primary">Submit a request</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
