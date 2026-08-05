"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, Inbox } from "lucide-react";
import toast from "react-hot-toast";

export interface NotificationRow {
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

// The list half of the notifications page. Marking read is explicit here (unlike
// the bell, which clears everything on open) — see the note on the page.
export default function NotificationList({
  items,
  filter,
  base,
}: {
  items: NotificationRow[];
  filter: "all" | "unread";
  base: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = items.filter((n) => !n.read_at).length;

  function linkFor(n: NotificationRow): string {
    if (n.link) return n.link;
    if (n.enquiry_id) return `${base}/enquiries/${n.enquiry_id}`;
    if (n.matter_id) return `${base}/matters/${n.matter_id}`;
    return base;
  }

  async function markRead(ids: string[]) {
    if (!ids.length || busy) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    setBusy(false);
    if (error) {
      toast.error("Could not mark as read");
      return;
    }
    // Clear the sidebar dots in this tab immediately — same event the bell fires.
    window.dispatchEvent(new Event("cc:notifs-read"));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <TabLink href={`${base}/notifications`} active={filter === "all"} label="All" />
          <TabLink
            href={`${base}/notifications?filter=unread`}
            active={filter === "unread"}
            label={unread > 0 ? `Unread (${unread})` : "Unread"}
          />
        </div>
        {unread > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-raised disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl bg-surface px-4 py-12 text-center shadow-sm dark:ring-1 dark:ring-line">
          <Inbox className="mx-auto h-8 w-8 text-ink-3" />
          <p className="mt-2 text-sm text-ink-3">
            {filter === "unread" ? "Nothing unread — you're all caught up." : "No notifications yet."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-sm dark:ring-1 dark:ring-line">
          {items.map((n) => (
            <li key={n.id} className={n.read_at ? "" : "bg-action-fill/5"}>
              <div className="flex items-start gap-3 px-4 py-3">
                <Link
                  href={linkFor(n)}
                  onClick={() => !n.read_at && markRead([n.id])}
                  className="min-w-0 flex-1"
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    {!n.read_at && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-action-fill" aria-label="Unread" />
                    )}
                    <span className="truncate">{n.title}</span>
                  </p>
                  {n.body && <p className="mt-0.5 text-xs text-ink-2">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-ink-3">
                    {new Date(n.created_at).toLocaleString("en-ZA")}
                  </p>
                </Link>
                {!n.read_at && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => markRead([n.id])}
                    className="shrink-0 text-xs font-medium text-ink-3 hover:text-action disabled:opacity-50"
                    aria-label={`Mark "${n.title}" as read`}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-lg bg-action-fill/10 px-3 py-1.5 text-sm font-semibold text-action"
          : "rounded-lg px-3 py-1.5 text-sm font-medium text-ink-3 hover:bg-raised"
      }
    >
      {label}
    </Link>
  );
}
