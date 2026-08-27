"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { MessageSquare, Link2, FileText, Settings2, Send, History } from "lucide-react";
import Card from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";

export interface TransferActivity {
  id: string;
  activity_type: string;
  body: string | null;
  author_label: string | null;
  created_at: string;
  users?: { full_name: string | null } | null;
}

export type TransferSide = "conveyclear" | "firm";

// The transaction's own feed (migration 035). A property transfer has a history
// and a conversation that belong to the deal, not to whichever matter inside it
// happens to be open — "seller signed the mandate", "bank guarantee is late".
//
// Staff and the owning attorney firm both post here. Clients cannot reach it:
// can_access_transfer excludes them, because a transfer spans BOTH sides of the
// deal and showing it to one party would leak the counterparty.
//
// SPLIT IN TWO ON 2026-08-27. The 08-24 meeting asked for a transfer chat between
// ConveyClear and the attorney, "to replace email". The channel already existed —
// this table, these two posting roles — but it was presented as one list with
// every document upload and matter link interleaved between the messages. A
// conversation you have to read past a filing record is not one you would choose
// over email, so the same rows are now read two ways: Conversation (what people
// said) and Activity (everything that happened). Deliberately NOT a second table:
// the 08-24 notes warn against building a third messaging system, and a message
// IS an event on the transfer.
export default function TransferFeed({
  transferId,
  activities,
  canPost,
  viewerSide,
  firmName = null,
}: {
  transferId: string;
  activities: TransferActivity[];
  canPost: boolean;
  /** Which side of the conversation the viewer is on — decides "us" and "them". */
  viewerSide: TransferSide;
  /** The attorney firm's name, for saying who the other side actually is. */
  firmName?: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"chat" | "all">("chat");

  // Posts are what someone said; everything else is what the system recorded.
  const messages = activities.filter((a) => a.activity_type === "post");
  // The query returns newest first (both pages, limit 50). A conversation reads
  // the other way round — oldest at the top, newest above the box you type in.
  const thread = [...messages].reverse();

  const otherSide = viewerSide === "conveyclear" ? firmName || "the attorney firm" : "ConveyClear";

  async function post() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await fetch("/api/transfers/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: transferId, body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not post");
      setText("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card accent="firm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <MessageSquare className="h-4 w-4 text-action" />
        <h2 className="font-semibold text-ink">Transfer conversation</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-raised p-0.5 text-xs">
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
            Conversation{messages.length > 0 ? ` (${messages.length})` : ""}
          </TabButton>
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            <History className="mr-1 inline h-3 w-3" />
            Activity
          </TabButton>
        </div>
      </div>
      <p className="mb-4 text-xs text-ink-3">
        {tab === "chat" ? (
          <>
            The direct line between ConveyClear and {firmName || "the attorney firm"} on this
            transaction — it replaces email. Not visible to the buyer or seller.
          </>
        ) : (
          <>Everything that has happened on this transfer, messages included. Not visible to the buyer or seller.</>
        )}
      </p>

      {tab === "chat" ? (
        <>
          {thread.length === 0 ? (
            <p className="mb-4 text-sm text-ink-3">
              No messages yet. Anything you write here reaches {otherSide} directly.
            </p>
          ) : (
            <ul className="mb-4 space-y-2.5">
              {thread.map((m) => {
                // author_label is set by the post route: "ConveyClear" or "Partner".
                // Older rows predate it, in which case the message still reads —
                // it simply does not take a side.
                const side: TransferSide | null =
                  m.author_label === "Partner" ? "firm" : m.author_label === "ConveyClear" ? "conveyclear" : null;
                const mine = side !== null && side === viewerSide;
                const who =
                  m.users?.full_name?.trim() ||
                  (side === "firm" ? firmName || "The attorney firm" : side === "conveyclear" ? "ConveyClear" : "System");
                return (
                  <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={
                        "max-w-[80%] rounded-xl px-3 py-2 " +
                        (mine ? "bg-action-tint" : "bg-raised")
                      }
                    >
                      <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.body}</p>
                      <p className="mt-1 text-[11px] text-ink-3">
                        {who}
                        {side === "firm" && m.users?.full_name ? ` · ${firmName || "attorney"}` : ""} ·{" "}
                        {formatDate(m.created_at)}
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
                  // Ctrl/Cmd+Enter sends; plain Enter keeps its newline. A message
                  // here is often several lines about a deal, so making Enter send
                  // would cut people off mid-thought.
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (!busy && text.trim()) post();
                  }
                }}
                placeholder={`Message ${otherSide}…`}
                className="flex-1 rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
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
        <p className="text-sm text-ink-3">Nothing on this transfer yet.</p>
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
  if (type === "matter_linked" || type === "matter_unlinked") return <Link2 className={`${cls} text-action`} />;
  if (type === "document_upload") return <FileText className={`${cls} text-ink-3`} />;
  if (type === "status_change") return <Settings2 className={`${cls} text-ink-3`} />;
  return <MessageSquare className={`${cls} text-action`} />;
}
