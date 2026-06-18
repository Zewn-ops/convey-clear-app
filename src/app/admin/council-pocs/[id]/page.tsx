import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import CouncilPocCard from "@/components/admin/CouncilPocCard";
import { formatDate } from "@/lib/utils";
import {
  isStaffRole,
  councilPocName,
  MATTER_STATUS_LABELS,
  type CouncilPoc,
  type MatterStatus,
} from "@/types";
import { ArrowLeft, Briefcase } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Council POC — ConveyClear Admin" };

function statusVariant(status: string): "info" | "success" | "danger" | "warning" | "gray" {
  const map: Record<string, "info" | "success" | "danger" | "warning" | "gray"> = {
    new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning",
  };
  return map[status] ?? "gray";
}

interface LinkedMatter {
  matters: { id: string; title: string | null; municipality: string | null; status: string | null } | null;
}

export default async function AdminCouncilPocDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const [{ data: pocData }, { data: linkData }] = await Promise.all([
    supabase.from("council_pocs").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("matter_council_pocs")
      .select("matters(id, title, municipality, status)")
      .eq("council_poc_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const poc = pocData as CouncilPoc | null;
  if (!poc) notFound();

  const linkedMatters = ((linkData as LinkedMatter[] | null) ?? [])
    .map((l) => l.matters)
    .filter((m): m is NonNullable<LinkedMatter["matters"]> => Boolean(m));

  const name = councilPocName(poc);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin/council-pocs" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4" /> All council POCs
        </Link>
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-[#1B2E6B] flex items-center justify-center text-white text-lg font-bold shrink-0">
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
            <p className="text-sm text-gray-500">
              {[poc.council, poc.department].filter(Boolean).join(" · ") || "Council contact"} · added {formatDate(poc.created_at)}
            </p>
          </div>
        </div>
      </div>

      <CouncilPocCard poc={poc} />

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Linked matters ({linkedMatters.length})</h2>
        {linkedMatters.length > 0 ? (
          <div className="space-y-3">
            {linkedMatters.map((m) => (
              <Link key={m.id} href={`/admin/matters/${m.id}`}>
                <Card className="hover:border-[#1B2E6B]/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Briefcase className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{m.title || "Untitled matter"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{m.municipality || "—"}</p>
                      </div>
                    </div>
                    {m.status && (
                      <Badge label={MATTER_STATUS_LABELS[m.status as MatterStatus] ?? m.status} variant={statusVariant(m.status)} />
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center py-8">
            <p className="text-sm text-gray-400">Not linked to any matter yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}
