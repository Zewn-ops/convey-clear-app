"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { MessageSquare, Link2, FileText, Settings2, Send, History, Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";
import type { EnquiryThread } from "@/lib/enquiries";

export interface MatterActivity {
  id: string;
  activity_type: string;
  body: string | null;
  author_label: string | null;
  created_at: string;
  users?: { full_name: string | null } | null;
}

export type MatterAudience = "staff" | "partner" | "client";

/**
 * The matter's conversation and history, in the shape the property-transfer page
 * uses.
 *
 * Zewn, 2026-09-01: "remove the matter enquiries and copy the prop trfs chat and
 * activity feed section to matters."
 *
 * WHAT THIS REPLACES. A matter had TWO stacked sections: `MatterEnquiries` (a
 * ticket list — subject, status badge, a reply box per thread) and the Internal
 * Activity Feed below it. The transfer page had already been through this on
 * 08-27 and come out as one card with two tabs, because a conversation you have
 * to open a ticket to start is not one anybody uses.
 *
 * 🔴 THE TWO TABS READ DIFFERENT TABLES, AND THAT IS DELIBERATE.
 *
 * On a transfer both tabs are one table, because a transfer's audience is staff
 * plus the attorney firm and nobody else. A MATTER is not like that:
 *
 *   · Conversation → `enquiries` + `enquiry_messages`. SHARED — ConveyClear, the
 *     owning firm and the client all read and post. RLS decides who sees what.
 *   · Activity → `matter_activity`. INTERNAL — staff only, and it is where the
 *     system records phase moves and uploads.
 *
 * Backing the Conversation tab with matter_activity would have been the smaller
 * change and it would have been wrong: those rows are unreadable to the client
 * and the firm, so every message sent from here would have looked delivered and
 * reached nobody. The tabs look the same; the wires underneath are not.
 *
 * The ticket shape is gone from the surface but not from the data: a message
 * posts into the matter's most recent shared thread, and the first message of
 * all opens one. So the enquiry list elsewhere in the portal keeps working, and
 * a matter that already has threads shows their messages here in order.
 */
export default function MatterFeed({
  matterId,
  threads,
  activities = [],
  canPost = true,
  audience,
  firmName = null,
}: {
  matterId: string;
  /** Shared enquiry threads, already RLS-filtered for this viewer. */
  threads: EnquiryThread[];
  /** Internal activity. Empty for any audience that may not see it. */
  activities?: MatterActivity[];
  canPost?: boolean;
  audience: MatterAudience;
  /** The attorney firm's name, for saying who the other side is. */
  firmName?: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"chat" | "all">("chat");

  // Every shared thread flattened into ONE chronological conversation. The
  // opening `message` of a thread is a message like any other — it was only ever
  // separated because the ticket UI displayed it as the subject's body.
  const thread = threads
    .flatMap((t) => [
      { id: t.id, author_label: null as string | null, body: t.message, created_at: t.created_at, subject: t.subject },
      ...t.messages.map((m) => ({ ...m, subject: null as string | null })),
    ])
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const staffSide = audience === "staff";
  const otherSide = staffSide ? firmName || "the firm and the client" : "ConveyClear";
  const showActivity = activities.length > 0 || staffSide;

  async function post() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      // Reply into the newest existing thread; open one if there is none. The
      // subject is not asked for — this is a chat — so a generated one is used
      // for the places that still list enquiries by subject.
      const existing = threads[0]?.id ?? null;
      const res = existing
        ? await fetch("/api/enquiries/reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enquiry_id: existing, body }),
          })
        : await fetch("/api/enquiries/matter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matter_id: matterId, subject: "Matter conversation", message: body }),
          });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "Could not send");
      setText("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card accent="firm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <MessageSquare className="h-4 w-4 text-action" />
        <h2 className="font-semibold text-ink">Matter conversation</h2>
        {showActivity && (
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-raised p-0.5 text-xs">
            <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
              Conversation{thread.length > 0 ? ` (${thread.length})` : ""}
            </TabButton>
            <TabButton active={tab === "all"} onClick={() => setTab("all")}>
              <History className="mr-1 inline h-3 w-3" />
              Activity
            </TabButton>
          </div>
        )}
      </div>
      <p className="mb-4 text-xs text-ink-3">
        {tab === "chat" ? (
          staffSide ? (
            <>Shared with the client and {firmName || "the referring firm"}. Internal notes belong on the Activity tab.</>
          ) : (
            <>The direct line to ConveyClear on this matter.</>
          )
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            ConveyClear only. Nothing here is shown to the client or the firm.
          </span>
        )}
      </p>

      {tab === "chat" ? (
        <>
          {thread.length === 0 ? (
            <p className="mb-4 text-sm text-ink-3">
              No messages yet. Anything you write here reaches {otherSide}.
            </p>
          ) : (
            <ul className="mb-4 space-y-2.5">
              {thread.map((m) => {
                // author_label is written by the reply route ("ConveyClear",
                // "Partner", the client's name). A thread's opening message
                // predates the label, so it takes no side rather than guessing.
                const mine =
                  (staffSide && m.author_label === "ConveyClear") ||
                  (audience === "partner" && m.author_label === "Partner") ||
                  (audience === "client" && m.author_label === "Client");
                return (
                  <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={"max-w-[80%] rounded-xl px-3 py-2 " + (mine ? "bg-action-tint" : "bg-raised")}>
                      <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.body}</p>
                      <p className="mt-1 text-[11px] text-ink-3">
                        {m.author_label || "System"} · {formatDate(m.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canPost && (
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Ctrl/Cmd+Enter sends; plain Enter keeps its newline, as on
                  // the transfer feed.
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (!busy && text.trim()) post();
                  }
                }}
                placeholder={`Message ${otherSide}…`}
                className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              />
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={post}
                className="inline-flex items-center gap-1.5 rounded-lg bg-action-fill px-3 py-2 text-sm font-medium text-white hover:bg-action-fill/90 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {busy ? "…" : "Send"}
              </button>
            </div>
          )}
        </>
      ) : activities.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing recorded on this matter yet.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="flex gap-2.5">
              <Icon type={a.activity_type} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{a.body}</p>
                <p className="text-xs text-ink-3">
                  {a.users?.full_name || a.author_label || "System"} · {formatDate(a.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-2.5 py-1 font-medium transition-colors " +
        (active ? "bg-surface text-ink shadow-chip" : "text-ink-3 hover:text-ink-2")
      }
    >
      {children}
    </button>
  );
}

function Icon({ type }: { type: string }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0";
  if (type === "phase_transition" || type === "status_change") return <Settings2 className={`${cls} text-ink-3`} />;
  if (type === "document_upload") return <FileText className={`${cls} text-ink-3`} />;
  if (type === "matter_linked" || type === "matter_unlinked") return <Link2 className={`${cls} text-action`} />;
  return <MessageSquare className={`${cls} text-action`} />;
}
