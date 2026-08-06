"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  PlusCircle,
  UserCircle,
  LogOut,
  IdCard,
} from "lucide-react";
import toast from "react-hot-toast";
import ThemeToggle from "@/components/ui/ThemeToggle";
import EntitySwitcher from "@/components/dashboard/EntitySwitcher";
import { entityLabel, entityKind } from "@/lib/entity-display";
import type { Membership } from "@/lib/entity";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/matters", label: "My Matters", icon: Briefcase, exact: false },
  { href: "/dashboard/entities", label: "My entities", icon: IdCard, exact: false },
  { href: "/dashboard/request", label: "Request a service", icon: PlusCircle, exact: false },
];

export default function Sidebar({
  memberships = [],
  activeId = null,
}: {
  memberships?: Membership[];
  activeId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/auth/login");
  };

  return (
    <aside className="flex flex-col h-full w-64 bg-chrome text-white">
      {/* Logo */}
      <div className="flex items-center px-6 py-4 border-b border-white/10">
        <img src="/conveyclear-logo-white.png" alt="ConveyClear" className="h-11 w-auto" />
      </div>

      {/* Which entity this session is looking at. Renders nothing on a single
          membership, which is every existing client on day one. */}
      {memberships.length > 1 && (
        <div className="border-b border-white/10 px-3 py-3">
          <EntitySwitcher
            memberships={memberships}
            activeId={activeId}
            label={entityLabel}
            kind={entityKind}
          />
        </div>
      )}

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

      {/* Account + Sign out */}
      <div className="px-4 pb-4 border-t border-white/10 pt-4 space-y-1">
        <Link
          href="/account"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <UserCircle className="h-4 w-4 shrink-0" />
          Account
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
      <div className="border-t border-white/10 px-4 pb-4 pt-3">
        <ThemeToggle variant="row" />
      </div>
    </aside>
  );
}
