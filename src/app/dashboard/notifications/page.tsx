import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import NotificationsPageBody from "@/components/notifications/NotificationsPageBody";

export const metadata = { title: "Notifications — ConveyClear" };
export const dynamic = "force-dynamic";

// §5.1 — the client's own notifications. Same body as the other two portals.
//
// No role check beyond "signed in": RLS scopes notifications to their owner, so
// this page can only ever show the caller their own. A staff member who lands
// here sees their own notifications, which is correct rather than a leak.
export default async function ClientNotificationsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");
  const meId = session.profile?.id;
  if (!meId) redirect("/auth/login");

  return <NotificationsPageBody userId={meId} base="/dashboard" searchParams={searchParams} />;
}
