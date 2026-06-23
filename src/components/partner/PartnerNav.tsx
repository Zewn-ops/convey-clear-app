"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useNotifyDots } from "@/lib/use-notify-dots";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  PlusCircle,
  MessageSquare,
  LogOut,
  Scale,
  UserCircle,
  Menu,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

const navItems = [
  { href: "/partner", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/partner/matters", label: "Matters", icon: Briefcase },
  { href: "/partner/clients", label: "Clients", icon: Users },
  { href: "/partner/enquiries", label: "Enquiries", icon: MessageSquare },
  { href: "/partner/refer", label: "Refer a matter", icon: PlusCircle },
];

export default function PartnerNav({
  firmName,
  variant,
}: {
  firmName: string;
  variant: "desktop" | "mobile";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const dots = useNotifyDots();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/auth/login");
  };

  const links = (onClick?: () => void) =>
    navItems.map((item) => {
      const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
          {((item.href === "/partner/matters" && dots.matters) ||
            (item.href === "/partner/enquiries" && dots.enquiries)) && (
            <span className="ml-auto h-2 w-2 rounded-full bg-[#E8521A]" title="New activity" />
          )}
        </Link>
      );
    });

  if (variant === "desktop") {
    return (
      <aside className="flex flex-col h-full w-64 bg-[#1B2E6B] text-white">
        <div className="flex flex-col px-6 py-4 border-b border-white/10 gap-1.5">
          <img src="/conveyclear-logo-white.png" alt="ConveyClear" className="h-10 w-auto self-start" />
          <div className="flex items-center gap-1 text-xs text-white/60">
            <Scale className="h-3 w-3" />
            {firmName}
          </div>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1">{links()}</nav>
        <div className="px-4 pb-4 border-t border-white/10 pt-4 space-y-1">
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <UserCircle className="h-4 w-4 shrink-0" />
            Account
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
    );
  }

  return (
    <>
      <header className="flex items-center justify-between bg-[#1B2E6B] px-4 py-4 md:hidden">
        <Link href="/partner" className="flex items-center gap-2">
          <img src="/conveyclear-logo-white.png" alt="ConveyClear" className="h-8 w-auto" />
          <span className="text-white/60 text-xs">{firmName}</span>
        </Link>
        <button onClick={() => setOpen((o) => !o)} className="text-white p-1 rounded">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>
      {open && (
        <nav className="md:hidden bg-[#1B2E6B] border-t border-white/10 px-4 pb-4 space-y-1 pt-3">
          {links(() => setOpen(false))}
          <button
            onClick={signOut}
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
