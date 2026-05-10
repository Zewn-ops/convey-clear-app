import Sidebar from "@/components/dashboard/Sidebar";
import MobileNav from "@/components/dashboard/MobileNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0">
        <Sidebar />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 md:ml-64">
        {/* Mobile nav */}
        <MobileNav />

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
