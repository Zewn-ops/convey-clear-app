"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Bell, X, Star, Archive, ArchiveRestore, Check, Inbox } from "lucide-react";
import { playDing, unlockAudio, getStoredVolume } from "@/lib/notify-sound";

/**
 * The notification centre.
 *
 * Zewn, 2026-08-27: *"we also need to build out the notifications thing a lot
 * more, i think we should have a full slide out menu with better functionality
 * and features, read and unread as well as mark as important or archive."*
 *
 * 🔴 THE REAL CHANGE IS THAT OPENING THE PANEL NO LONGER MARKS EVERYTHING READ.
 * The previous version called markAllRead() from its toggle, so every
 * notification became read the instant anyone glanced at the bell — which meant
 * read/unread carried no information at all. Adding an unread FILTER on top of
 * that would have been theatre. Reading is now something you do to one
 * notification, by opening it, or to all of them, deliberately, with the button.
 *
 * THREE PIECES OF STATE, deliberately orthogonal (068):
 *   · read_at      — have I seen this
 *   · important_at — does this matter to me
 *   · archived_at  — am I done with this
 * A notification can be important and archived at once: dealt with, but worth
 * remembering. That is why they are three columns and not one status.
 *
 * `base` is the role's path root ("/admin" | "/partner" | "/dashboard"), used to
 * build links from matter_id / enquiry_id so each role lands on its own pages.
 */

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  matter_id: string | null;
  enquiry_id: string | null;
  read_at: string | null;
  important_at: string | null;
  archived_at: string | null;
  created_at: string;
}

type View = "all" | "unread" | "important" | "archived";

const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "important", label: "Important" },
  { key: "archived", label: "Archived" },
];

const PAGE = 25;

/** Only these reach the server; anything else would be a caller's bug. */
type Patch = Partial<Pick<Notif, "read_at" | "important_at" | "archived_at">>;

export default function NotificationBell({ base }: { base: string }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("all");
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const supabaseRef = useRef(createClient());
  const userIdRef = useRef<string | null>(null);
  const soundPrefRef = useRef(false);

  // The badge counts what is unread AND not archived. Archiving something
  // unread is a way of saying "I am not going to read this" — it should not go
  // on nagging from the bell afterwards.
  const unread = items.filter((n) => !n.read_at && !n.archived_at).length;

  // ---------------------------------------------------------------- loading

  const buildQuery = useCallback((uid: string, v: View, offset: number) => {
    let q = supabaseRef.current
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);

    // Archived is a view of its own rather than a filter on the others: every
    // other view is about live notifications, and mixing archived rows into
    // them would defeat the point of archiving.
    if (v === "archived") return q.not("archived_at", "is", null);
    q = q.is("archived_at", null);
    if (v === "unread") q = q.is("read_at", null);
    if (v === "important") q = q.not("important_at", "is", null);
    return q;
  }, []);

  const load = useCallback(
    async (v: View, offset: number) => {
      const uid = userIdRef.current;
      if (!uid) return;
      setLoading(true);
      try {
        const { data } = await buildQuery(uid, v, offset);
        const rows = (data as Notif[]) ?? [];
        setExhausted(rows.length < PAGE);
        setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  // ------------------------------------------------------------ realtime etc

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

      await load("all", 0);

      channel = supabase
        .channel(`notif-${me.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            const row = payload.new as Notif;
            // A new arrival is live and unread, so it belongs at the top of every
            // view except Archived and Important — neither of which it can be yet.
            setItems((prev) =>
              prev.some((n) => n.id === row.id) ? prev : [row, ...prev]
            );
            if (soundPrefRef.current) playDing(getStoredVolume());
          }
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabaseRef.current.removeChannel(channel);
    };
    // `load` is stable (useCallback with a stable dep), so this runs once.
  }, [load]);

  // ---------------------------------------------------------------- mutating

  /**
   * Optimistic by design: these are one-field flips on a row the user owns, and
   * the panel should feel instant. A failure leaves the local state ahead of the
   * server, which the next open corrects — acceptable for a flag, and far better
   * than a spinner on every star.
   */
  async function patch(id: string, changes: Patch) {
    const uid = userIdRef.current;
    if (!uid) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, ...changes } : n)));
    await supabaseRef.current.from("notifications").update(changes).eq("id", id).eq("user_id", uid);
    window.dispatchEvent(new Event("cc:notifs-read"));
  }

  async function markAllRead() {
    const uid = userIdRef.current;
    if (!uid) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabaseRef.current
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", uid)
      .is("read_at", null)
      .is("archived_at", null);
    window.dispatchEvent(new Event("cc:notifs-read"));
  }

  function switchView(v: View) {
    setView(v);
    setItems([]);
    setExhausted(false);
    load(v, 0);
  }

  function toggle() {
    unlockAudio(); // the click satisfies the browser autoplay gesture requirement
    const next = !open;
    setOpen(next);
    // Opening REFRESHES. It deliberately does not mark anything read — see the
    // note at the top of this file.
    if (next) {
      setItems([]);
      setExhausted(false);
      load(view, 0);
    }
  }

  function linkFor(n: Notif): string {
    if (n.link) return n.link;
    if (n.enquiry_id) return `${base}/enquiries/${n.enquiry_id}`;
    if (n.matter_id) return `${base}/matters/${n.matter_id}`;
    return base;
  }

  // Rows leave the list when they no longer match the view being shown, so
  // archiving from "All" visibly removes the row rather than leaving it sitting
  // there looking unchanged.
  const visible = items.filter((n) => {
    if (view === "archived") return Boolean(n.archived_at);
    if (n.archived_at) return false;
    if (view === "unread") return !n.read_at;
    if (view === "important") return Boolean(n.important_at);
    return true;
  });

  const emptyCopy: Record<View, string> = {
    all: "Nothing yet. Updates on your transfers and documents arrive here.",
    unread: "Nothing unread. You are up to date.",
    important: "Nothing flagged. Star a notification to keep it here.",
    archived: "Nothing archived yet.",
  };

  return (
    <>
      <div className="fixed top-3 right-16 z-40 md:right-4">
        <button
          onClick={toggle}
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface shadow-sm hover:bg-raised"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          aria-expanded={open}
        >
          <Bell className="h-4 w-4 text-ink-2" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-action-fill px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>

      {/* Scrim. Also the click-away — a panel this size must be dismissable
          without hunting for the X. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-line bg-surface shadow-2xl " +
          "transition-transform duration-200 ease-out " +
          (open ? "translate-x-0" : "pointer-events-none translate-x-full")
        }
        aria-label="Notifications"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <p className="text-[15px] font-semibold text-ink">Notifications</p>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="rounded px-2 py-1 text-xs font-medium text-action hover:bg-raised"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-raised"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4 text-ink-3" />
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-line px-3 py-2">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => switchView(v.key)}
              className={
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
                (view === v.key
                  ? "bg-action-fill text-white"
                  : "text-ink-3 hover:bg-raised hover:text-ink-2")
              }
            >
              {v.label}
              {v.key === "unread" && unread > 0 && ` (${unread})`}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Inbox className="mx-auto h-7 w-7 text-ink-3" />
              <p className="mt-3 text-sm text-ink-3">{emptyCopy[view]}</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((n) => (
                <li
                  key={n.id}
                  className={"group relative " + (n.read_at ? "" : "bg-action-tint")}
                >
                  <Link
                    href={linkFor(n)}
                    onClick={() => {
                      // Opening one IS reading it — the natural gesture, rather
                      // than a separate control nobody would press.
                      if (!n.read_at) patch(n.id, { read_at: new Date().toISOString() });
                      setOpen(false);
                    }}
                    className="block px-4 py-3 pr-16 hover:bg-raised"
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_at && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-action" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <p className={"text-sm " + (n.read_at ? "text-ink-2" : "font-semibold text-ink")}>
                          {n.title}
                        </p>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{n.body}</p>}
                        <p className="mt-1 text-[11px] text-ink-3">
                          {new Date(n.created_at).toLocaleString("en-ZA")}
                        </p>
                      </div>
                    </div>
                  </Link>

                  {/* Always present, not hover-revealed: PRODUCT.md §7 — hover
                      does not exist on a phone, and clients are frequently on
                      one. */}
                  <div className="absolute right-3 top-2.5 flex items-center gap-0.5">
                    <button
                      onClick={() =>
                        patch(n.id, { important_at: n.important_at ? null : new Date().toISOString() })
                      }
                      className="flex h-7 w-7 items-center justify-center rounded hover:bg-line"
                      aria-label={n.important_at ? "Remove importance" : "Mark as important"}
                      title={n.important_at ? "Remove importance" : "Mark as important"}
                    >
                      <Star
                        className={"h-3.5 w-3.5 " + (n.important_at ? "fill-waiting text-waiting" : "text-ink-3")}
                      />
                    </button>
                    <button
                      onClick={() =>
                        patch(n.id, {
                          archived_at: n.archived_at ? null : new Date().toISOString(),
                          // Archiving implies you dealt with it. Leaving it
                          // unread would mean the badge kept counting something
                          // the user has explicitly finished with.
                          ...(n.archived_at || n.read_at ? {} : { read_at: new Date().toISOString() }),
                        })
                      }
                      className="flex h-7 w-7 items-center justify-center rounded hover:bg-line"
                      aria-label={n.archived_at ? "Restore" : "Archive"}
                      title={n.archived_at ? "Restore" : "Archive"}
                    >
                      {n.archived_at ? (
                        <ArchiveRestore className="h-3.5 w-3.5 text-ink-3" />
                      ) : (
                        <Archive className="h-3.5 w-3.5 text-ink-3" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Explicit, not infinite scroll: the archive can be long, and a list
              that loads forever while you are looking for one thing is worse
              than a button. */}
          {!exhausted && visible.length > 0 && (
            <div className="p-3">
              <button
                onClick={() => load(view, items.length)}
                disabled={loading}
                className="w-full rounded-lg border border-line py-2 text-xs font-medium text-ink-2 hover:bg-raised disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load older"}
              </button>
            </div>
          )}
        </div>

        {unread === 0 && view === "all" && visible.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-2.5">
            <Check className="h-3.5 w-3.5 text-ok" />
            <span className="text-xs text-ink-3">You are up to date</span>
          </div>
        )}

        {/* §5.1 — the way from the panel to the page.
            The two have always been halves of one feature: the panel is capped
            and marks everything read the moment it opens, the page is the
            durable record that does not. Without this link the page was
            reachable only by typing the URL, which is most of what "the
            notifications sidebar is different from the notifications tab" was
            describing. `base` is already the portal's root, so this works in
            all three. */}
        <div className="border-t border-line px-4 py-2.5">
          <Link
            href={`${base}/notifications`}
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-semibold text-action hover:underline"
          >
            See all notifications
          </Link>
        </div>
      </aside>
    </>
  );
}
