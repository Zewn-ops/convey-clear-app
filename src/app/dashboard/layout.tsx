import Sidebar from "@/components/dashboard/Sidebar";
import MobileNav from "@/components/dashboard/MobileNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import { getEntityContext } from "@/lib/entity";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved on the server. The cookie is re-validated against real membership
  // here, so a stale or forged value can never reach the client.
  const { memberships, activeId } = await getEntityContext();

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0">
        <Sidebar memberships={memberships} activeId={activeId} />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 md:ml-64">
        {/* Mobile nav */}
        <MobileNav />
        <NotificationBell base="/dashboard" />

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
