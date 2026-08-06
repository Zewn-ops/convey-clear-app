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
  type Client,
  type ClientDocument,
  type Matter,
  type MatterStatus,
} from "@/types";
import { matterPhaseLabel } from "@/lib/phase-label";
import { getPipeline, stageLabel } from "@/lib/pipelines";
import { ArrowLeft, Briefcase } from "lucide-react";
import ClientVault from "@/components/clients/ClientVault";
import ClientDetailsForm from "@/components/clients/ClientDetailsForm";
import CreateLoginButton from "@/components/clients/CreateLoginButton";
import { signedDocUrls } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import EntityMembers, { type MemberRow, type CandidateUser } from "@/components/clients/EntityMembers";

export const metadata = { title: "Client Details — ConveyClear Admin" };

// Matter models neither the services relation nor service_subtype, both of which
// getPipeline needs to resolve a stage slug into its real name.
type MatterRow = Matter & {
  service_subtype?: string | null;
  services?: { code?: string | null } | null;
};

/** current_stage holds a pipeline slug, so rendering it raw showed "inquiry". */
function matterStageLabel(m: MatterRow): string {
  if (!m.current_stage) return "No stage set";
  const pl = getPipeline(m.services?.code, m.municipality, m.service_subtype);
  return pl ? stageLabel(pl, m.current_stage) : m.current_stage;
}

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
      .select("id, title, current_phase, current_stage, status, priority, deadline, municipality, service_subtype, created_at, services(code)")
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

  const matters = (mattersData as MatterRow[] | null) ?? [];

  // FICA vault docs + short-lived signed URLs (signed server-side via admin).
  const vaultDocs = (vaultData as ClientDocument[] | null) ?? [];
  const vaultUrls = vaultDocs.length > 0 ? await signedDocUrls(createAdminClient(), vaultDocs) : {};
  const vaultWithUrls = vaultDocs.map((d) => ({ ...d, url: d.storage_path ? vaultUrls[d.storage_path] : undefined }));

  const displayName = clientDisplayName(client);

  // Does this client already have a portal login? Read past RLS with the admin
  // client (the page is staff-gated) — a client's user row is not otherwise
  // readable by staff. Drives the "Create login" / "Login active" card.
  const { data: loginRow } = await createAdminClient()
    .from("users")
    .select("email")
    .eq("client_id", id)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  const hasLogin = !!loginRow;
  const loginEmail = (loginRow as { email: string | null } | null)?.email ?? null;

  // Membership: who may act for this entity. Read past RLS with the admin
  // client for the same reason as the login lookup above — the page is
  // staff-gated, but a client's user rows are not staff-readable.
  const admin = createAdminClient();
  const { data: memberRows } = await admin
    .from("client_members")
    .select("id, role, is_default, users(id, full_name, email)")
    .eq("client_id", id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  type RawMember = {
    id: string;
    role: "owner" | "member";
    is_default: boolean;
    users: { id: string; full_name: string | null; email: string | null } | null;
  };
  const members: MemberRow[] = ((memberRows as RawMember[] | null) ?? [])
    .filter((r) => r.users)
    .map((r) => ({
      id: r.id,
      role: r.role,
      isDefault: r.is_default,
      userId: r.users!.id,
      userName: r.users!.full_name?.trim() || r.users!.email || "Unnamed",
      userEmail: r.users!.email ?? "—",
    }));

  // Only client-role logins can be attached. Staff and partner users reach
  // matters through their own routes; giving them a membership as well would
  // create a second, quieter path to the same data.
  const { data: candidateRows } = await admin
    .from("users")
    .select("id, full_name, email")
    .eq("role", "client")
    .eq("active", true)
    .not("auth_user_id", "is", null)
    .order("full_name", { ascending: true })
    .limit(200);
  const candidates: CandidateUser[] = ((candidateRows as { id: string; full_name: string | null; email: string | null }[] | null) ?? []).map((u) => ({
    id: u.id,
    name: u.full_name?.trim() || u.email || "Unnamed",
    email: u.email ?? "—",
  }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin/clients" className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to clients
        </Link>
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-action-fill flex items-center justify-center text-white text-lg font-bold shrink-0">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">{displayName}</h1>
            <p className="text-sm text-ink-3">
              {entityLabels[client.entity_type] ?? client.entity_type} · Added {formatDate(client.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Details — read-only until Edit. The field set is shared with the matter's
          in-place FICA form (lib/fica.ts), so the two can't ask for different things. */}
      <ClientDetailsForm client={client} />

      {/* Portal access — provision a login for this client entity (no matter
          required). Part of the legacy-matter backfill workflow. */}
      <CreateLoginButton
        clientId={id}
        hasLogin={hasLogin}
        loginEmail={loginEmail}
        clientEmail={client.primary_email}
      />

      {/* Reusable FICA document vault (migration 025, extended by 032) */}
      <ClientVault
        clientId={id}
        entityType={client.entity_type}
        docs={vaultWithUrls}
        canDelete={isAdminRole(session.profile?.role)}
      />

      <Card>
        <EntityMembers clientId={id} members={members} candidates={candidates} />
      </Card>

      <div>
        <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink mb-4">
          Matters ({matters.length})
        </h2>
        {matters.length > 0 ? (
          <div className="space-y-3">
            {matters.map((m) => (
              <Link key={m.id} href={`/admin/matters/${m.id}`} className="block">
                <Card className="transition-shadow duration-200 ease-out hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Briefcase className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">
                          {m.title || "Untitled matter"}
                        </p>
                        <p className="text-xs text-ink-3 mt-0.5">
                          {m.municipality ? `${m.municipality} · ` : ""}
                          {matterStageLabel(m)} · opened {formatDate(m.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {m.current_phase && (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-action-fill/10 text-action">
                          {matterPhaseLabel(m.current_phase)}
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
            <p className="text-sm text-ink-3">No matters yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}
