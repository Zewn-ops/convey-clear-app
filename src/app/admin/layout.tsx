import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminMobileNav from "@/components/admin/AdminMobileNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0">
        <AdminSidebar />
      </div>

      <div className="flex flex-col flex-1 md:ml-64">
        <AdminMobileNav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
