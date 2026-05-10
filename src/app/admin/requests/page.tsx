import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge, { statusVariantMap } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { SERVICE_TYPE_LABELS, REQUEST_STATUS_LABELS } from "@/types";

export const metadata = { title: "All Requests — ConveyClear Admin" };

export default async function AdminRequestsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: requests } = await supabase
    .from("service_requests")
    .select("*, profiles!client_id(id, full_name, phone, id_number)")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Requests</h1>
        <p className="text-sm text-gray-500 mt-1">
          {requests?.length ?? 0} total service requests
        </p>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Client
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Service
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                  Property
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                  Submitted
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requests?.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">
                      {(req as any).profiles?.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {(req as any).profiles?.phone ?? ""}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {SERVICE_TYPE_LABELS[req.service_type as keyof typeof SERVICE_TYPE_LABELS]}
                  </td>
                  <td className="px-5 py-3 text-gray-500 max-w-xs truncate hidden md:table-cell">
                    {req.property_address}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">
                    {formatDate(req.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      label={REQUEST_STATUS_LABELS[req.status as keyof typeof REQUEST_STATUS_LABELS]}
                      variant={statusVariantMap[req.status as keyof typeof statusVariantMap]}
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/requests/${req.id}`}
                      className="text-[#E8521A] hover:underline text-xs font-medium"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {(!requests || requests.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-gray-400"
                  >
                    No requests yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
