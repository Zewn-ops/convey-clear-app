import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge, { statusVariantMap } from "@/components/ui/Badge";
import { formatDate, formatBytes, getInitials } from "@/lib/utils";
import {
  SERVICE_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@/types";
import { ArrowLeft, FileText } from "lucide-react";

export const metadata = { title: "Client Details — ConveyClear Admin" };

export default async function AdminClientDetailPage({
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

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "admin") redirect("/dashboard");

  const { data: client } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!client) notFound();

  const { data: requests } = await supabase
    .from("service_requests")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/clients"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to clients
        </Link>
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-[#1B2E6B] flex items-center justify-center text-white text-lg font-bold">
            {getInitials(client.full_name)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {client.full_name}
            </h1>
            <p className="text-sm text-gray-500">
              Registered {formatDate(client.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Profile details */}
      <Card>
        <h2 className="font-semibold text-gray-900 mb-4">Personal Details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">Phone</dt>
            <dd className="font-medium mt-0.5">{client.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">SA ID Number</dt>
            <dd className="font-medium mt-0.5">{client.id_number ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      {/* Requests */}
      <Card>
        <h2 className="font-semibold text-gray-900 mb-4">
          Service Requests ({requests?.length ?? 0})
        </h2>
        {requests && requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 p-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {SERVICE_TYPE_LABELS[req.service_type as keyof typeof SERVICE_TYPE_LABELS]}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {req.property_address} · {formatDate(req.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    label={REQUEST_STATUS_LABELS[req.status as keyof typeof REQUEST_STATUS_LABELS]}
                    variant={statusVariantMap[req.status as keyof typeof statusVariantMap]}
                  />
                  <Link
                    href={`/admin/requests/${req.id}`}
                    className="text-xs text-[#E8521A] hover:underline"
                  >
                    Manage
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No requests.</p>
        )}
      </Card>

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
                <div>
                  <p className="text-sm font-medium text-gray-800">
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
