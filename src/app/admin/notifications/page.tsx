import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import FilterBar from "@/components/ui/FilterBar";

/** The `type` values migration 020 defines. */
const NOTIFICATION_TYPES = [
  { value: "enquiry", label: "Enquiries" },
  { value: "enquiry_reply", label: "Enquiry replies" },
  { value: "referral", label: "Referrals" },
  { value: "document", label: "Documents" },
  { value: "status", label: "Status changes" },
  { value: "phase", label: "Phase changes" },
] as const;
import NotificationList, { type NotificationRow } from "@/components/notifications/NotificationList";
import { isStaffRole } from "@/types";

export const metadata = { title: "Notifications — ConveyClear" };
export const dynamic = "force-dynamic";

// A dedicated home for notifications (Zewn, 2026-07-28). The bell is a transient
// popup capped at 20 and it marks everything read the moment it opens — fine for
// "something happened", useless for "what was I told last week". This page is the
// durable view, and it deliberately does NOT auto-mark-read: marking is an
// explicit act here, so opening the list to look something up cannot silently
// destroy the unread state you were using as a to-do list.
//
// Read through the caller's own client — RLS scopes notifications to their owner.

const PAGE_SIZE = 100;

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");
  const meId = session.profile?.id;
  if (!meId) redirect("/auth/login");

  const raw = searchParams?.filter;
  const filter = (Array.isArray(raw) ? raw[0] : raw) === "unread" ? "unread" : "all";

  // Type facet. The vocabulary is fixed by migration 020's `type` column, so it
  // is listed rather than read from the rows — a facet that only offers what you
  // already have cannot narrow to "none of these", which is the useful answer
  // when you are checking whether anything arrived at all.
  const rawType = searchParams?.type;
  const typeParam = Array.isArray(rawType) ? rawType[0] : rawType;
  const type = NOTIFICATION_TYPES.some((t) => t.value === typeParam) ? typeParam! : "";

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, type, title, body, link, matter_id, enquiry_id, read_at, created_at")
    .eq("user_id", meId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (filter === "unread") query = query.is("read_at", null);
  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  const items = (data as NotificationRow[] | null) ?? [];
  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Notifications</h1>
        <p className="mt-1 text-sm text-ink-3">
          {filter === "unread"
            ? `${items.length} unread`
            : `Your last ${Math.min(items.length, PAGE_SIZE)} notification${items.length === 1 ? "" : "s"}`}
          {filter === "all" && unreadCount > 0 && ` · ${unreadCount} unread`}
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row-reverse lg:items-start">
        <aside className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
          <FilterBar
            orientation="vertical"
            facets={[
              {
                key: "type",
                label: "Kind",
                defaultValue: "",
                options: [
                  { value: "", label: "Anything" },
                  ...NOTIFICATION_TYPES.map((t) => ({ value: t.value, label: t.label })),
                ],
              },
            ]}
          />
        </aside>
        <div className="min-w-0 flex-1">
      {error ? (
        <Card className="border-2 !border-red-500">
          <h2 className="text-sm font-semibold text-red-700">Notifications could not be loaded</h2>
          <p className="mt-2 font-mono text-xs text-ink-3">{error.message}</p>
        </Card>
      ) : (
        <NotificationList items={items} filter={filter} base="/admin" />
      )}
        </div>
      </div>
    </div>
  );
}
