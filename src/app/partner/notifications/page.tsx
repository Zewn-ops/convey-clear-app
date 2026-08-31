import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/partner";
import NotificationsPageBody from "@/components/notifications/NotificationsPageBody";

export const metadata = { title: "Notifications — ConveyClear Partner" };
export const dynamic = "force-dynamic";

// §5.1 — the bell has always rendered in this portal and NotificationList has
// always linked to `/partner/notifications`; the page simply never existed, so
// following its own tab links 404'd. Same body as admin and the client
// dashboard, mounted with this portal's gate and base.
export default async function PartnerNotificationsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const auth = await requirePartner();
  if ("error" in auth) redirect("/partner");

  return <NotificationsPageBody userId={auth.userId} base="/partner" searchParams={searchParams} />;
}
