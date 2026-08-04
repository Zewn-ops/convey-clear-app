import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
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

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, type, title, body, link, matter_id, enquiry_id, read_at, created_at")
    .eq("user_id", meId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (filter === "unread") query = query.is("read_at", null);

  const { data, error } = await query;
  const items = (data as NotificationRow[] | null) ?? [];
  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Notifications</h1>
        <p className="mt-1 text-sm text-ink-3">
          {filter === "unread"
            ? `${items.length} unread`
            : `Your last ${Math.min(items.length, PAGE_SIZE)} notification${items.length === 1 ? "" : "s"}`}
          {filter === "all" && unreadCount > 0 && ` · ${unreadCount} unread`}
        </p>
      </div>

      {error ? (
        <Card className="border-2 !border-red-500">
          <h2 className="text-sm font-semibold text-red-700">Notifications could not be loaded</h2>
          <p className="mt-2 font-mono text-xs text-ink-3">{error.message}</p>
        </Card>
      ) : (
        <NotificationList items={items} filter={filter} base="/admin" />
      )}
    </div>
  );
}
