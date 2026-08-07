import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole, clientDisplayName } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import SignupRequestActions from "@/components/admin/SignupRequestActions";
import { formatDateTime } from "@/lib/utils";
import { UserPlus } from "lucide-react";

export const metadata = { title: "Signup Requests — ConveyClear Admin" };
export const dynamic = "force-dynamic";

// People who tried to self-register on an email that is already a contact card
// (Meeting 2 §80, migration 057). The account was refused; this is the queue
// where staff verify who they are and create the login for them.
interface Row {
  id: string;
  email: string;
  full_name: string | null;
  status: "pending" | "actioned" | "dismissed";
  notes: string | null;
  created_at: string;
  matched_client_id: string | null;
  clients?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
  } | null;
}

export default async function SignupRequestsPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("signup_requests")
    .select("id, email, full_name, status, notes, created_at, matched_client_id, clients(id, full_name, first_name, last_name, business_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data as Row[] | null) ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          Signup requests
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          Someone tried to register on an email we already hold as a contact. Their account was
          refused — verify who they are, then create the login from Users &amp; Access.
        </p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <UserPlus className="h-8 w-8 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-3">Nothing waiting.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((r) => (
            <Card key={r.id} className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink">{r.full_name || r.email}</p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    {r.email} · tried {formatDateTime(r.created_at)}
                  </p>
                </div>
                <Badge label="Pending" variant="warning" />
              </div>

              <div className="pt-3 border-t border-line">
                <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">
                  Matches this contact
                </p>
                {r.clients ? (
                  <Link
                    href={`/admin/clients/${r.clients.id}`}
                    className="text-sm text-action hover:underline"
                  >
                    {clientDisplayName(r.clients)}
                  </Link>
                ) : (
                  // The card can be deleted after the attempt — say so rather
                  // than rendering a blank where a link belongs.
                  <p className="text-sm text-ink-3 italic">
                    The matching contact no longer exists.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-line flex items-center justify-between gap-4">
                <Link href="/admin/users" className="text-xs text-action hover:underline">
                  Create their login in Users &amp; Access →
                </Link>
                <SignupRequestActions requestId={r.id} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <Card className="space-y-3">
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Handled</p>
          <div className="divide-y divide-line">
            {decided.map((r) => (
              <div key={r.id} className="py-2.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{r.full_name || r.email}</p>
                  <p className="text-xs text-ink-3">{r.email} · {formatDateTime(r.created_at)}</p>
                </div>
                <Badge
                  label={r.status === "actioned" ? "Actioned" : "Dismissed"}
                  variant={r.status === "actioned" ? "success" : "gray"}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
