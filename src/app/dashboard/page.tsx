import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge, { statusVariantMap } from "@/components/ui/Badge";
import RequestCard from "@/components/dashboard/RequestCard";
import { formatDate } from "@/lib/utils";
import type { ServiceRequest, Document } from "@/types";
import {
  REQUEST_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@/types";
import { ClipboardList, FolderOpen, Clock, CheckCircle } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Dashboard — ConveyClear" };

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: requests } = await supabase
    .from("service_requests")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const activeCount =
    requests?.filter((r) =>
      ["pending", "in_review", "in_progress", "documents_required"].includes(r.status)
    ).length ?? 0;
  const completedCount =
    requests?.filter((r) => r.status === "completed").length ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-[#1B2E6B]">
          Welcome back, {profile?.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Here&apos;s a summary of your property transactions.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-[#1B2E6B]/10 p-2.5">
            <ClipboardList className="h-5 w-5 text-[#1B2E6B]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#1B2E6B]">
              {requests?.length ?? 0}
            </p>
            <p className="text-xs text-gray-500">Total requests</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2.5">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">{activeCount}</p>
            <p className="text-xs text-gray-500">Active</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-green-100 p-2.5">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{completedCount}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-[#E8521A]/10 p-2.5">
            <FolderOpen className="h-5 w-5 text-[#E8521A]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#E8521A]">
              {documents?.length ?? 0}
            </p>
            <p className="text-xs text-gray-500">Documents</p>
          </div>
        </Card>
      </div>

      {/* Recent requests */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Recent Requests</h2>
          <Link
            href="/dashboard/requests"
            className="text-sm text-[#E8521A] hover:underline"
          >
            View all
          </Link>
        </div>
        {requests && requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((req) => (
              <RequestCard key={req.id} request={req as ServiceRequest} />
            ))}
          </div>
        ) : (
          <Card className="text-center py-10">
            <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No requests yet</p>
            <Link
              href="/dashboard/requests/new"
              className="mt-2 inline-block text-sm text-[#E8521A] font-medium hover:underline"
            >
              Submit your first request
            </Link>
          </Card>
        )}
      </div>

      {/* Recent documents */}
      {documents && documents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Recent Documents</h2>
            <Link
              href="/dashboard/documents"
              className="text-sm text-[#E8521A] hover:underline"
            >
              View all
            </Link>
          </div>
          <Card padding="none">
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <FolderOpen className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {doc.file_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof DOCUMENT_TYPE_LABELS]} ·{" "}
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
