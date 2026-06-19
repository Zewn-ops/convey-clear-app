import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminMobileNav from "@/components/admin/AdminMobileNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import { getSessionProfile } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  const role = session?.profile?.role ?? null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0">
        <AdminSidebar role={role} />
      </div>

      <div className="flex flex-col flex-1 md:ml-64">
        <AdminMobileNav role={role} />
        <NotificationBell base="/admin" />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
