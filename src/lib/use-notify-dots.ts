"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Unread-notification indicators for the left nav, split by section. A
// notification belongs to "matters" when it carries a matter_id and to
// "enquiries" when it carries an enquiry_id (note 2026-06-23).
//
// Live: subscribes to the user's notifications (event "*" so a new INSERT lights
// the dot and the bell's mark-all-read UPDATE clears it). The bell also fires a
// window "cc:notifs-read" event as a same-tab backup, since realtime UPDATE
// delivery can lag.
export type NotifyDots = { matters: boolean; enquiries: boolean };

export function useNotifyDots(): NotifyDots {
  const [dots, setDots] = useState<NotifyDots>({ matters: false, enquiries: false });

  useEffect(() => {
    const supabase = createClient();
    const uidRef = { current: null as string | null };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const refetch = async () => {
      const uid = uidRef.current;
      if (!uid) return;
      const { data } = await supabase
        .from("notifications")
        .select("matter_id, enquiry_id")
        .eq("user_id", uid)
        .is("read_at", null);
      const rows = data ?? [];
      setDots({
        matters: rows.some((r) => r.matter_id),
        enquiries: rows.some((r) => r.enquiry_id),
      });
    };

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: me } = await supabase.from("users").select("id").eq("auth_user_id", user.id).maybeSingle();
      if (!me || cancelled) return;
      uidRef.current = me.id;
      await refetch();
      // Unique channel name per mount — avoids reusing an already-subscribed
      // channel under React StrictMode (which throws on a late .on()).
      channel = supabase
        .channel(`notifdots-${me.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` },
          refetch
        )
        .subscribe();
    })();

    window.addEventListener("cc:notifs-read", refetch);
    return () => {
      cancelled = true;
      window.removeEventListener("cc:notifs-read", refetch);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return dots;
}
