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
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <h1 className="text-xl font-bold text-[#1B2E6B]">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 transition-colors">
          <Bell className="h-5 w-5" />
        </button>
        {profile && (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[#1B2E6B] flex items-center justify-center text-white text-sm font-semibold">
              {getInitials(profile.full_name)}
            </div>
            <div className="hidden sm:block text-sm">
              <p className="font-medium text-gray-900">{profile.full_name}</p>
              <p className="text-gray-500 text-xs capitalize">{profile.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
