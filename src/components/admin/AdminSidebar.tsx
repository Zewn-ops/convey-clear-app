"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useNotifyDots } from "@/lib/use-notify-dots";
import type { UserRole } from "@/types";
import { BASE_NAV, toolsNavForRole } from "@/components/admin/admin-nav";
import { LogOut, ShieldCheck, Wrench, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function AdminSidebar({ role }: { role?: UserRole | null }) {
  const toolsItems = toolsNavForRole(role);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const dots = useNotifyDots();
  const toolsActive = toolsItems.some((item) => pathname.startsWith(item.href));
  const [toolsOpen, setToolsOpen] = useState(toolsActive);

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

      <nav className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-1">
        {BASE_NAV.map((item) => {
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

        <button
          type="button"
          onClick={() => setToolsOpen((v) => !v)}
          aria-expanded={toolsOpen}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            toolsActive
              ? "bg-white/15 text-white"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          )}
        >
          <Wrench className="h-4 w-4 shrink-0" />
          Admin Tools
          <ChevronDown
            className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", toolsOpen && "rotate-180")}
          />
        </button>
        {toolsOpen && (
          <div className="ml-3 space-y-1 border-l border-white/10 pl-3">
            {toolsItems.map((item) => {
              const active = pathname.startsWith(item.href);
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
          </div>
        )}
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
      <div className="border-t border-white/10 px-4 pb-4 pt-3">
        <ThemeToggle variant="row" />
      </div>
    </aside>
  );
}
