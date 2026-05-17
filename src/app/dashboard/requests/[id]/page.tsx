import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge, { statusVariantMap } from "@/components/ui/Badge";
import FileUpload from "@/components/dashboard/FileUpload";
import { formatDate, formatBytes } from "@/lib/utils";
import {
  SERVICE_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  type ServiceType,
  type RequestStatus,
} from "@/types";
import { ArrowLeft, MapPin, FileText } from "lucide-react";

export const metadata = { title: "Request Details — ConveyClear" };

export default async function RequestDetailPage({
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

  const { data: request } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .eq("client_id", user.id)
    .single();

  if (!request) notFound();

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/dashboard/requests"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#1B2E6B] mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to requests
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1B2E6B]">
              {SERVICE_TYPE_LABELS[request.service_type as ServiceType]}
            </h1>
            <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
              <MapPin className="h-4 w-4 shrink-0" />
              {request.property_address}
            </div>
          </div>
          <Badge
            label={REQUEST_STATUS_LABELS[request.status as RequestStatus]}
            variant={statusVariantMap[request.status as RequestStatus]}
          />
        </div>
      </div>

      <Card>
        <h2 className="font-semibold text-gray-900 mb-4">Request Details</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Service</dt>
            <dd className="font-medium text-gray-900">
              {SERVICE_TYPE_LABELS[request.service_type as ServiceType]}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Submitted</dt>
            <dd className="font-medium text-gray-900">
              {formatDate(request.created_at)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Last updated</dt>
            <dd className="font-medium text-gray-900">
              {formatDate(request.updated_at)}
            </dd>
          </div>
          {request.notes && (
            <div>
              <dt className="text-gray-500 mb-1">Your notes</dt>
              <dd className="text-gray-700 bg-gray-50 rounded-lg p-3">
                {request.notes}
              </dd>
            </div>
          )}
          {request.admin_notes && (
            <div>
              <dt className="text-gray-500 mb-1">Note from ConveyClear</dt>
              <dd className="text-[#1B2E6B] bg-[#1B2E6B]/5 border border-[#1B2E6B]/15 rounded-lg p-3">
                {request.admin_notes}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Documents for this request */}
      <Card>
        <h2 className="font-semibold text-gray-900 mb-4">Documents</h2>
        {documents && documents.length > 0 ? (
          <ul className="divide-y divide-gray-100 mb-6">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-3">
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
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
          <p className="text-sm text-gray-400 mb-4">No documents uploaded yet.</p>
        )}
        <FileUpload requestId={request.id} />
      </Card>
    </div>
  );
}
