import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import {
  isStaffRole,
  clientDisplayName,
  MATTER_STATUS_LABELS,
  PHASE_LABELS,
  type Client,
  type Matter,
  type MatterPhase,
  type MatterStatus,
} from "@/types";
import { ArrowLeft, Briefcase } from "lucide-react";

export const metadata = { title: "Client Details — ConveyClear Admin" };

const entityLabels: Record<string, string> = {
  natural_person: "Individual",
  business: "Business",
  trust: "Trust",
};

function statusVariant(status: string): "info" | "success" | "danger" | "warning" | "gray" {
  const map: Record<string, "info" | "success" | "danger" | "warning" | "gray"> = {
    new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning",
  };
  return map[status] ?? "gray";
}

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();

  const [{ data: clientData }, { data: mattersData }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("matters")
      .select("id, title, current_phase, current_stage, status, priority, deadline, municipality, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const client = clientData as Client | null;
  if (!client) notFound();

  const matters = (mattersData as Matter[] | null) ?? [];

  const displayName = clientDisplayName(client);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin/clients" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to clients
        </Link>
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-[#1B2E6B] flex items-center justify-center text-white text-lg font-bold shrink-0">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-sm text-gray-500">
              {entityLabels[client.entity_type] ?? client.entity_type} · Added {formatDate(client.created_at)}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <h2 className="font-semibold text-gray-900 mb-4">Details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {client.full_name && (
            <div>
              <dt className="text-gray-400 text-xs">Full Name</dt>
              <dd className="font-medium mt-0.5">{client.full_name}</dd>
            </div>
          )}
          {client.business_name && (
            <div>
              <dt className="text-gray-400 text-xs">Business Name</dt>
              <dd className="font-medium mt-0.5">{client.business_name}</dd>
            </div>
          )}
          {client.registration_no && (
            <div>
              <dt className="text-gray-400 text-xs">Registration No.</dt>
              <dd className="font-medium mt-0.5">{client.registration_no}</dd>
            </div>
          )}
          {client.id_number && (
            <div>
              <dt className="text-gray-400 text-xs">ID Number</dt>
              <dd className="font-medium mt-0.5">{client.id_number}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-400 text-xs">Email</dt>
            <dd className="font-medium mt-0.5">{client.primary_email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs">Cell</dt>
            <dd className="font-medium mt-0.5">{client.primary_cell ?? "—"}</dd>
          </div>
          {client.physical_address && (
            <div className="col-span-2">
              <dt className="text-gray-400 text-xs">Address</dt>
              <dd className="font-medium mt-0.5">{client.physical_address}</dd>
            </div>
          )}
        </dl>
      </Card>

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">
          Matters ({matters.length})
        </h2>
        {matters.length > 0 ? (
          <div className="space-y-3">
            {matters.map((m) => (
              <Link key={m.id} href={`/admin/matters/${m.id}`}>
                <Card className="hover:border-[#1B2E6B]/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Briefcase className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {m.title || "Untitled matter"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {m.municipality ? `${m.municipality} · ` : ""}
                          {m.current_stage || "No stage set"} · opened {formatDate(m.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {m.current_phase && (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#1B2E6B]/10 text-[#1B2E6B]">
                          Phase {m.current_phase}: {PHASE_LABELS[m.current_phase as MatterPhase]}
                        </span>
                      )}
                      {m.status && (
                        <Badge
                          label={MATTER_STATUS_LABELS[m.status as MatterStatus]}
                          variant={statusVariant(m.status)}
                        />
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center py-8">
            <p className="text-sm text-gray-400">No matters yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}
