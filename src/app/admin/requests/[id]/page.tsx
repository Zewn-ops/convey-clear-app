import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge, { statusVariantMap } from "@/components/ui/Badge";
import StatusUpdateForm from "@/components/admin/StatusUpdateForm";
import { formatDate, formatBytes } from "@/lib/utils";
import {
  SERVICE_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@/types";
import type { ServiceRequest } from "@/types";
import { ArrowLeft, MapPin, FileText, User } from "lucide-react";

export const metadata = { title: "Request Details — ConveyClear Admin" };

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: request } = await supabase
    .from("service_requests")
    .select("*, profiles!client_id(id, full_name, phone, id_number, created_at)")
    .eq("id", id)
    .single();

  if (!request) notFound();

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false });

  const clientProfile = (request as any).profiles;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/requests"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to requests
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {SERVICE_TYPE_LABELS[request.service_type as keyof typeof SERVICE_TYPE_LABELS]}
            </h1>
            <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
              <MapPin className="h-4 w-4 shrink-0" />
              {request.property_address}
            </div>
          </div>
          <Badge
            label={REQUEST_STATUS_LABELS[request.status as keyof typeof REQUEST_STATUS_LABELS]}
            variant={statusVariantMap[request.status as keyof typeof statusVariantMap]}
          />
        </div>
      </div>

      {/* Client info */}
      {clientProfile && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Client</h2>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500 text-xs">Name</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {clientProfile.full_name}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs">Phone</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {clientProfile.phone ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs">ID Number</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {clientProfile.id_number ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs">Client since</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {formatDate(clientProfile.created_at)}
              </dd>
            </div>
          </dl>
          <Link
            href={`/admin/clients/${clientProfile.id}`}
            className="mt-3 inline-block text-xs text-[#E8521A] hover:underline"
          >
            View full client profile →
          </Link>
        </Card>
      )}

      {/* Request details + status update */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-semibold text-gray-900 mb-4">Request Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Submitted</dt>
              <dd>{formatDate(request.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Updated</dt>
              <dd>{formatDate(request.updated_at)}</dd>
            </div>
            {request.notes && (
              <div>
                <dt className="text-gray-500 mb-1">Client notes</dt>
                <dd className="bg-gray-50 rounded-lg p-3 text-gray-700">
                  {request.notes}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-900 mb-4">Update Status</h2>
          <StatusUpdateForm request={request as ServiceRequest} />
        </Card>
      </div>

      {/* Documents */}
      <Card>
        <h2 className="font-semibold text-gray-900 mb-4">
          Documents ({documents?.length ?? 0})
        </h2>
        {documents && documents.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-3">
                <div className="rounded-lg bg-gray-100 p-2 shrink-0">
                  <FileText className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {doc.file_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof DOCUMENT_TYPE_LABELS]}
                    {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ""}
                    {" · "}
                    {formatDate(doc.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No documents uploaded.</p>
        )}
      </Card>
    </div>
  );
}
