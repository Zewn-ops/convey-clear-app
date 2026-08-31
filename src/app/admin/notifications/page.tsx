import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";
import NotificationsPageBody from "@/components/notifications/NotificationsPageBody";

export const metadata = { title: "Notifications — ConveyClear" };
export const dynamic = "force-dynamic";

// The page body lives in one place and all three portals mount it — see
// NotificationsPageBody for why (§5.1). This route is the staff gate and
// nothing else.
export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");
  const meId = session.profile?.id;
  if (!meId) redirect("/auth/login");

  return <NotificationsPageBody userId={meId} base="/admin" searchParams={searchParams} />;
}
