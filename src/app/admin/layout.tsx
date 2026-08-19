import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminMobileNav from "@/components/admin/AdminMobileNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Staff-only, enforced once here (mirrors partner/layout.tsx) so a future
  // admin page added without its own guard is never silently open. Pages that
  // read via the service-role client still keep their own checks — this is the
  // outer fence, not a replacement for proximity-to-data guards.
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");
  const role = session.profile?.role ?? null;

  return (
    <div className="flex min-h-screen bg-canvas">
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
