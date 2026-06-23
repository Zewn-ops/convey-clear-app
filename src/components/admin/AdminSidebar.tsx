"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useNotifyDots } from "@/lib/use-notify-dots";
import { isAdminRole, type UserRole } from "@/types";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  MessageSquare,
  UserCog,
  Landmark,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";

const baseNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/matters", label: "Matters", icon: Briefcase, exact: false },
  { href: "/admin/clients", label: "Clients", icon: Users, exact: false },
  { href: "/admin/council-pocs", label: "Council POCs", icon: Landmark, exact: false },
  { href: "/admin/enquiries", label: "Enquiries", icon: MessageSquare, exact: false },
];
const adminNav = [
  { href: "/admin/users", label: "Users & Access", icon: UserCog, exact: false },
];

export default function AdminSidebar({ role }: { role?: UserRole | null }) {
  const navItems = isAdminRole(role) ? [...baseNav, ...adminNav] : baseNav;
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const dots = useNotifyDots();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/auth/login");
  };

  return (
    <aside className="flex flex-col h-full w-64 bg-gray-900 text-white">
      <div className="flex flex-col px-6 py-4 border-b border-white/10 gap-1.5">
        <img src="/conveyclear-logo-white.png" alt="ConveyClear" className="h-10 w-auto self-start" />
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <ShieldCheck className="h-3 w-3" />
          Admin Panel
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {((item.href === "/admin/matters" && dots.matters) ||
                (item.href === "/admin/enquiries" && dots.enquiries)) && (
                <span className="ml-auto h-2 w-2 rounded-full bg-[#E8521A]" title="New activity" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pb-4 border-t border-white/10 pt-4">
        <Link
          href="/account"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors mb-1"
        >
          Account &amp; password
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
