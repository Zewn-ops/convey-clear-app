"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { MessageSquare, Link2, FileText, Settings2, Send } from "lucide-react";
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

// The transaction's own feed (migration 035). A property transfer has a history
// and a conversation that belong to the deal, not to whichever matter inside it
// happens to be open — "seller signed the mandate", "bank guarantee is late".
//
// Staff and the owning attorney firm both post here. Clients cannot reach it:
// can_access_transfer excludes them, because a transfer spans BOTH sides of the
// deal and showing it to one party would leak the counterparty.
export default function TransferFeed({
  transferId,
  activities,
  canPost,
}: {
  transferId: string;
  activities: TransferActivity[];
  canPost: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

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
      <div className="mb-1 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-[#1B2E6B]" />
        <h2 className="font-semibold text-ink">Transfer feed</h2>
      </div>
      <p className="mb-4 text-xs text-ink-3">
        The transaction&apos;s own history and conversation — shared between ConveyClear and the attorney firm. Not
        visible to clients.
      </p>

      {canPost && (
        <div className="mb-4 flex items-end gap-2">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note about this transfer…"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
          />
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={post}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B2E6B] px-3 py-2 text-sm font-medium text-white hover:bg-[#1B2E6B]/90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> {busy ? "…" : "Post"}
          </button>
        </div>
      )}

      {activities.length === 0 ? (
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

function Icon({ type }: { type: string }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0";
  if (type === "matter_linked" || type === "matter_unlinked") return <Link2 className={`${cls} text-[#E8521A]`} />;
  if (type === "document_upload") return <FileText className={`${cls} text-ink-3`} />;
  if (type === "status_change") return <Settings2 className={`${cls} text-ink-3`} />;
  return <MessageSquare className={`${cls} text-[#1B2E6B]`} />;
}
