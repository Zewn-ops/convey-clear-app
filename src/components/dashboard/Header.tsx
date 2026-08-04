"use client";

import { useAuth } from "@/hooks/useAuth";
import { getInitials } from "@/lib/utils";
import { Bell } from "lucide-react";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { profile } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
      <h1 className="text-xl font-bold text-action">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="relative rounded-full p-2 text-ink-3 hover:bg-raised transition-colors">
          <Bell className="h-5 w-5" />
        </button>
        {profile && (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-action-fill flex items-center justify-center text-white text-sm font-semibold">
              {getInitials(profile.full_name ?? profile.email)}
            </div>
            <div className="hidden sm:block text-sm">
              <p className="font-medium text-ink">{profile.full_name ?? profile.email}</p>
              <p className="text-ink-3 text-xs capitalize">{profile.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
