import Link from "next/link";
import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  PHASE_LABELS,
  type Matter,
  type MatterPhase,
  type MatterStatus,
} from "@/types";
import { Briefcase } from "lucide-react";

export const metadata = { title: "Matters — ConveyClear" };

export default async function MattersPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("matters")
    .select(
      "id, title, current_phase, status, priority, deadline, created_at, municipality, clients(id, entity_type, full_name, business_name)"
    )
    .order("created_at", { ascending: false });
  const matters = (data as Matter[] | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1B2E6B]">Matters</h1>
        <p className="text-sm text-gray-500 mt-1">{matters.length} matter{matters.length === 1 ? "" : "s"}</p>
      </div>

      {matters.length > 0 ? (
        <div className="space-y-3">
          {matters.map((m) => (
            <Link key={m.id} href={`/dashboard/matters/${m.id}`}>
              <Card className="hover:border-[#1B2E6B]/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {m.title || clientDisplayName(m.clients) || "Untitled matter"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {clientDisplayName(m.clients)}
                      {m.municipality ? ` · ${m.municipality}` : ""} · opened {formatDate(m.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {m.current_phase && (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#1B2E6B]/10 text-[#1B2E6B]">
                        Phase {m.current_phase}: {PHASE_LABELS[m.current_phase as MatterPhase]}
                      </span>
                    )}
                    {m.status && (
                      <span className="text-xs text-gray-500">
                        {MATTER_STATUS_LABELS[m.status as MatterStatus]}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="text-center py-12">
          <Briefcase className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No matters to show</p>
        </Card>
      )}
    </div>
  );
}
