"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { isStaffRole, type AppUser } from "@/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const loadProfile = async (authUser: User | null) => {
      setUser(authUser);
      if (authUser) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", authUser.id)
          .maybeSingle();
        setProfile((data as AppUser) ?? null);
      } else {
        setProfile(null);
      }
    };

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await loadProfile(user);
      setLoading(false);
    };
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    user,
    profile,
    loading,
    isStaff: isStaffRole(profile?.role),
    isAdmin: profile?.role === "admin",
  };
}
