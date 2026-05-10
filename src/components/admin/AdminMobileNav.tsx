"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  LogOut,
  Scale,
  Menu,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/requests", label: "Requests", icon: ClipboardList },
  { href: "/admin/clients", label: "Clients", icon: Users },
];

export default function AdminMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/auth/login");
  };

  return (
    <>
      <header className="flex items-center justify-between bg-gray-900 px-4 py-4 md:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-[#E8521A]" />
          <span className="text-white font-bold text-base">ConveyClear Admin</span>
        </Link>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-white p-1 rounded"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {open && (
        <nav className="md:hidden bg-gray-900 border-t border-white/10 px-4 pb-4 space-y-1 pt-3">
          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  active ? "bg-white/15 text-white" : "text-white/70"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 border-t border-white/10 mt-2 pt-4"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </nav>
      )}
    </>
  );
}
