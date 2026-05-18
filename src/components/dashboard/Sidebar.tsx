"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  ClipboardList,
  UserCircle,
  LogOut,
  PlusCircle,
} from "lucide-react";
import toast from "react-hot-toast";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/requests", label: "My Requests", icon: ClipboardList },
  { href: "/dashboard/documents", label: "My Documents", icon: FolderOpen },
  { href: "/dashboard/profile", label: "Profile", icon: UserCircle },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/auth/login");
  };

  return (
    <aside className="flex flex-col h-full w-64 bg-[#1B2E6B] text-white">
      {/* Logo */}
      <div className="flex items-center px-6 py-4 border-b border-white/10">
        <img src="/conveyclear-logo.png" alt="ConveyClear" className="h-8 w-auto brightness-0 invert" />
      </div>

      {/* New request CTA */}
      <div className="px-4 pt-4">
        <Link
          href="/dashboard/requests/new"
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#E8521A] hover:bg-[#c94415] transition-colors px-4 py-2.5 text-sm font-medium"
        >
          <PlusCircle className="h-4 w-4" />
          New Request
        </Link>
      </div>

      {/* Nav */}
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
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-4 pb-4 border-t border-white/10 pt-4">
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
