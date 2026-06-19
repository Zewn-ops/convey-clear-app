"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Bell } from "lucide-react";
import { playDing, unlockAudio, getStoredVolume } from "@/lib/notify-sound";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  matter_id: string | null;
  enquiry_id: string | null;
  read_at: string | null;
  created_at: string;
}

// In-portal notification bell (Theme I). Subscribes to the caller's own
// notifications via Supabase Realtime → live red dot + a short "ding". `base`
// is the role's path root ("/admin" | "/partner" | "/dashboard") used to build
// links from matter_id / enquiry_id so each role lands on its own pages.
export default function NotificationBell({ base }: { base: string }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const supabaseRef = useRef(createClient());
  const userIdRef = useRef<string | null>(null);
  const soundPrefRef = useRef(false);

  const unread = items.filter((n) => !n.read_at).length;

  // Unlock audio on the FIRST user gesture anywhere on the page, so a realtime
  // notification arriving later can chime without the user having clicked the
  // bell first (the previous behaviour, which left it silent in most sessions).
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("users")
        .select("id, notify_sound")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!me) return;
      userIdRef.current = me.id;
      soundPrefRef.current = (me as { notify_sound?: boolean }).notify_sound !== false;

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", me.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setItems((data as Notif[]) ?? []);

      channel = supabase
        .channel(`notif-${me.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            setItems((prev) => [payload.new as Notif, ...prev].slice(0, 30));
            if (soundPrefRef.current) playDing(getStoredVolume());
          }
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabaseRef.current.removeChannel(channel);
    };
  }, []);

  async function markAllRead() {
    const uid = userIdRef.current;
    if (!uid) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabaseRef.current.from("notifications").update({ read_at: now }).eq("user_id", uid).is("read_at", null);
  }

  function toggle() {
    unlockAudio(); // first click satisfies the browser autoplay gesture requirement
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markAllRead();
  }

  function linkFor(n: Notif): string {
    if (n.link) return n.link;
    if (n.enquiry_id) return `${base}/enquiries/${n.enquiry_id}`;
    if (n.matter_id) return `${base}/matters/${n.matter_id}`;
    return base;
  }

  return (
    <div className="fixed top-3 right-16 z-40 md:right-4">
      <button
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4 text-gray-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E8521A] text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-5rem)] max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg z-40">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={linkFor(n)}
                      onClick={() => setOpen(false)}
                      className={"block px-4 py-3 hover:bg-gray-50 " + (n.read_at ? "" : "bg-[#1B2E6B]/5")}
                    >
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString("en-ZA")}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
