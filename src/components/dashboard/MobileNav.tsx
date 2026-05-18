"use client";

import { useState } from "react";
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
  Menu,
  X,
  PlusCircle,
} from "lucide-react";
import toast from "react-hot-toast";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/requests", label: "Requests", icon: ClipboardList },
  { href: "/dashboard/documents", label: "Documents", icon: FolderOpen },
  { href: "/dashboard/profile", label: "Profile", icon: UserCircle },
];

export default function MobileNav() {
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
      <header className="flex items-center justify-between bg-[#1B2E6B] px-4 py-4 md:hidden">
        <Link href="/dashboard" className="flex items-center">
          <img src="/conveyclear-logo.png" alt="ConveyClear" className="h-7 w-auto brightness-0 invert" />
        </Link>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-white p-1 rounded"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {open && (
        <nav className="md:hidden bg-[#1B2E6B] border-t border-white/10 px-4 pb-4 space-y-1">
          <Link
            href="/dashboard/requests/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full rounded-lg bg-[#E8521A] px-4 py-2.5 text-sm font-medium text-white mt-3 mb-2"
          >
            <PlusCircle className="h-4 w-4" />
            New Request
          </Link>
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
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:text-white mt-2 border-t border-white/10 pt-4"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </nav>
      )}
    </>
  );
}
