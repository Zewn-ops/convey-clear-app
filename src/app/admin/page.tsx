import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge, { statusVariantMap } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { ServiceRequest } from "@/types";
import {
  SERVICE_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
} from "@/types";
import {
  ClipboardList,
  Users,
  Clock,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

export const metadata = { title: "Admin Overview — ConveyClear" };

export default async function AdminPage() {
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
    .select("*, profiles!client_id(full_name, phone)")
    .order("created_at", { ascending: false })
    .limit(10);

  const { count: clientCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "client");

  const { count: pendingCount } = await supabase
    .from("service_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "documents_required", "in_review"]);

  const { count: completedCount } = await supabase
    .from("service_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed");

  const { count: totalCount } = await supabase
    .from("service_requests")
    .select("id", { count: "exact", head: true });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="text-sm text-gray-500 mt-1">
          ConveyClear client portal management
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-[#1B2E6B]/10 p-2.5">
            <ClipboardList className="h-5 w-5 text-[#1B2E6B]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#1B2E6B]">{totalCount ?? 0}</p>
            <p className="text-xs text-gray-500">Total requests</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2.5">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">{pendingCount ?? 0}</p>
            <p className="text-xs text-gray-500">Needs action</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-green-100 p-2.5">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{completedCount ?? 0}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-[#E8521A]/10 p-2.5">
            <Users className="h-5 w-5 text-[#E8521A]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#E8521A]">{clientCount ?? 0}</p>
            <p className="text-xs text-gray-500">Clients</p>
          </div>
        </Card>
      </div>

      {/* Recent requests */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Recent Requests</h2>
          <Link
            href="/admin/requests"
            className="flex items-center gap-1 text-sm text-[#E8521A] hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Client
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Service
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {(req as any).profiles?.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {SERVICE_TYPE_LABELS[req.service_type as keyof typeof SERVICE_TYPE_LABELS]}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
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
                      colSpan={5}
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
    </div>
  );
}
