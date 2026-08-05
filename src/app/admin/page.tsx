import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { isStaffRole, type Matter } from "@/types";
import { COUNCIL_WAIT_STAGE_KEYS } from "@/lib/pipelines";
import MatterCard, { type MatterCardRow } from "@/components/matters/MatterCard";
import { ArrowRight, Landmark, Inbox, FileCheck2 } from "lucide-react";

export const metadata = { title: "Admin Overview — ConveyClear" };

type Row = Matter &
  MatterCardRow & {
    service_subtype?: string | null;
    services?: { code: string | null; name: string | null } | null;
  };

const CARD_SELECT =
  "id, title, current_phase, current_stage, status, priority, municipality, service_subtype, created_at, updated_at, clients(full_name, business_name), services(code, name)";

const ACTIVE = ["new", "open", "on_hold"];

export default async function AdminPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const councilList = `(${COUNCIL_WAIT_STAGE_KEYS.join(",")})`;

  // The page answers one question: what needs us today. Not "how many matters
  // exist" — that number never changes what anyone does next, which is why the
  // four-tile row this replaced was decoration rather than information.
  const [{ data: queueData }, { count: oursCount }, { count: councilCount }, { count: pendingDocs }] =
    await Promise.all([
      supabase
        .from("matters")
        .select(CARD_SELECT)
        .in("status", ACTIVE)
        .or(`current_stage.is.null,current_stage.not.in.${councilList}`)
        .order("updated_at", { ascending: true, nullsFirst: true })
        .limit(6),
      supabase
        .from("matters")
        .select("id", { count: "exact", head: true })
        .in("status", ACTIVE)
        .or(`current_stage.is.null,current_stage.not.in.${councilList}`),
      supabase
        .from("matters")
        .select("id", { count: "exact", head: true })
        .in("status", ACTIVE)
        .in("current_stage", COUNCIL_WAIT_STAGE_KEYS),
      supabase.from("documents").select("id", { count: "exact", head: true }).is("approved_at", null),
    ]);

  const queue = (queueData as Row[] | null) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Today</h1>
        <p className="mt-1 text-sm text-ink-3">
          {oursCount ?? 0} {oursCount === 1 ? "matter needs" : "matters need"} ConveyClear · {councilCount ?? 0} with
          the council
        </p>
      </div>

      {/* Three routes into work, each a live count and a destination. Not stat
          tiles: every one of these is a link to the list it describes. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/matters?queue=ours"
          className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-action/40"
        >
          <Inbox className="h-5 w-5 text-action" />
          <p className="mt-3 text-[26px] font-semibold tabular-nums tracking-[-0.025em] text-ink">{oursCount ?? 0}</p>
          <p className="mt-0.5 text-sm text-ink-2">Needs us</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3 group-hover:text-action">
            Open queue <ArrowRight className="h-3 w-3" />
          </p>
        </Link>

        <Link
          href="/admin/matters?queue=council"
          className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-action/40"
        >
          <Landmark className="h-5 w-5 text-ink-3" />
          <p className="mt-3 text-[26px] font-semibold tabular-nums tracking-[-0.025em] text-ink">
            {councilCount ?? 0}
          </p>
          <p className="mt-0.5 text-sm text-ink-2">With council</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3 group-hover:text-action">
            Awaiting response <ArrowRight className="h-3 w-3" />
          </p>
        </Link>

        <Link
          href="/admin/approvals"
          className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-action/40"
        >
          <FileCheck2 className="h-5 w-5 text-ink-3" />
          <p className="mt-3 text-[26px] font-semibold tabular-nums tracking-[-0.025em] text-ink">{pendingDocs ?? 0}</p>
          <p className="mt-0.5 text-sm text-ink-2">Documents to review</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3 group-hover:text-action">
            Open approvals <ArrowRight className="h-3 w-3" />
          </p>
        </Link>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">Oldest without movement</h2>
          <Link href="/admin/matters?queue=ours" className="text-sm text-action hover:underline">
            View all
          </Link>
        </div>

        {queue.length > 0 ? (
          <div className="space-y-4">
            {queue.map((m) => (
              <MatterCard key={m.id} matter={m} href={`/admin/matters/${m.id}`} showStage />
            ))}
          </div>
        ) : (
          <Card className="py-12 text-center">
            <p className="font-medium text-ink">Nothing waiting on us</p>
            <p className="mt-1 text-sm text-ink-3">
              Every active matter is with the council.{" "}
              <Link href="/admin/matters?queue=council" className="text-action hover:underline">
                See what they are holding
              </Link>
              .
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
