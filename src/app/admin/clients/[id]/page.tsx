import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import {
  isStaffRole,
  isAdminRole,
  clientDisplayName,
  MATTER_STATUS_LABELS,
  PHASE_LABELS,
  type Client,
  type ClientDocument,
  type Matter,
  type MatterPhase,
  type MatterStatus,
} from "@/types";
import { ArrowLeft, Briefcase } from "lucide-react";
import ClientVault from "@/components/clients/ClientVault";
import ClientDetailsForm from "@/components/clients/ClientDetailsForm";
import { signedDocUrls } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const [{ data: clientData }, { data: mattersData }, { data: vaultData }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("matters")
      .select("id, title, current_phase, current_stage, status, priority, deadline, municipality, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_documents")
      .select(
        "id, client_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, uploaded_by, created_at, status, expiry_date, verified, verified_at, verified_by, supersedes_id, notes"
      )
      .eq("client_id", id)
      // Superseded versions are history — the vault shows what's live and what's
      // been archived, not every file ever uploaded (migration 032).
      .neq("status", "superseded")
      .order("created_at", { ascending: false }),
  ]);

  const client = clientData as Client | null;
  if (!client) notFound();

  const matters = (mattersData as Matter[] | null) ?? [];

  // FICA vault docs + short-lived signed URLs (signed server-side via admin).
  const vaultDocs = (vaultData as ClientDocument[] | null) ?? [];
  const vaultUrls = vaultDocs.length > 0 ? await signedDocUrls(createAdminClient(), vaultDocs) : {};
  const vaultWithUrls = vaultDocs.map((d) => ({ ...d, url: d.storage_path ? vaultUrls[d.storage_path] : undefined }));

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

      {/* Details — read-only until Edit. The field set is shared with the matter's
          in-place FICA form (lib/fica.ts), so the two can't ask for different things. */}
      <ClientDetailsForm client={client} />

      {/* Reusable FICA document vault (migration 025, extended by 032) */}
      <ClientVault
        clientId={id}
        entityType={client.entity_type}
        docs={vaultWithUrls}
        canDelete={isAdminRole(session.profile?.role)}
      />

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
