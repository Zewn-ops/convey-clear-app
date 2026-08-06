"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EnquiryReply from "@/components/enquiries/EnquiryReply";
import { formatDateTime } from "@/lib/utils";
import { MessageSquare, Plus, Lock } from "lucide-react";

export interface MatterEnquiryMessage {
  id: string;
  author_label: string | null;
  body: string;
  created_at: string;
}

export interface MatterEnquiryThread {
  id: string;
  subject: string;
  message: string;
  status: string;
  visibility: string;
  created_at: string;
  messages: MatterEnquiryMessage[];
}

function statusVariant(s: string): "info" | "success" | "warning" | "gray" {
  return ({ open: "info", assigned: "warning", resolved: "success", closed: "gray" } as const)[s] ?? "gray";
}

// The SHARED enquiry thread on a matter (A&A #3) — ConveyClear, the partner firm,
// and the client all read and post here. Distinct from the activity feed, which
// stays internal to staff.
//
// RLS has already filtered `threads` for the viewer, so nothing is hidden here:
// a client is simply never handed a 'partner'-visibility row.
export default function MatterEnquiries({
  matterId,
  threads,
  audience,
}: {
  matterId: string;
  threads: MatterEnquiryThread[];
  audience: "staff" | "partner" | "client";
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!subject.trim()) return toast.error("Add a subject");
    if (!message.trim()) return toast.error("Add a message");
    setLoading(true);
    const res = await fetch("/api/enquiries/matter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId, subject: subject.trim(), message: message.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not start the enquiry");
    toast.success("Enquiry sent");
    setSubject("");
    setMessage("");
    setComposing(false);
    router.refresh();
  };

  return (
    <Card accent="client" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {/* "Matter Enquiries", not "Enquiries" (Jukka, meeting 1): a matter page
            carries two threads, and the names have to say which one the partner
            firm and the client can see. Its twin is the Internal Activity Feed. */}
        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" /> Matter Enquiries · {threads.length}
        </p>
        <button
          onClick={() => setComposing((c) => !c)}
          className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> {composing ? "Cancel" : "New enquiry"}
        </button>
      </div>

      <p className="text-xs text-ink-3 -mt-1">
        {audience === "staff"
          ? "Shared with the client and the referring firm. Internal notes belong on the Internal Activity Feed below."
          : "A direct line to the ConveyClear team about this matter."}
      </p>

      {composing && (
        <div className="space-y-2 rounded-lg bg-raised shadow-sm dark:ring-1 dark:ring-line p-3">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject — e.g. Clearance figures query"
            className="w-full rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What do you need?"
            className="w-full rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action resize-none"
          />
          <button
            onClick={create}
            disabled={loading || !subject.trim() || !message.trim()}
            className="px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send enquiry"}
          </button>
        </div>
      )}

      {threads.length === 0 && !composing && (
        <p className="text-sm text-ink-3">No enquiries on this matter yet.</p>
      )}

      <div className="space-y-2">
        {threads.map((t) => (
          <details key={t.id} className="group overflow-hidden rounded-lg shadow-sm dark:ring-1 dark:ring-line">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 list-none">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-sm text-ink truncate">{t.subject}</span>
                  {audience === "staff" && t.visibility !== "shared" && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-3 bg-raised rounded-full px-2 py-0.5 shrink-0"
                      title="Firm channel — the client cannot see this thread"
                    >
                      <Lock className="h-2.5 w-2.5" /> Not client-visible
                    </span>
                  )}
                </span>
                <span className="block text-xs text-ink-3 mt-0.5">
                  {formatDateTime(t.created_at)} · {t.messages.length} repl{t.messages.length === 1 ? "y" : "ies"}
                </span>
              </span>
              <Badge label={t.status} variant={statusVariant(t.status)} />
            </summary>

            <div className="border-t border-line px-3 py-3 space-y-3">
              <div>
                <p className="text-xs text-ink-3 mb-1">Opened · {formatDateTime(t.created_at)}</p>
                <p className="text-sm text-ink whitespace-pre-wrap">{t.message}</p>
              </div>

              {t.messages.map((m) => (
                <div key={m.id} className="border-t border-line pt-3">
                  <p className="text-xs text-ink-3 mb-1">
                    {m.author_label || "ConveyClear"} · {formatDateTime(m.created_at)}
                  </p>
                  <p className="text-sm text-ink whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}

              <div className="pt-1">
                <EnquiryReply enquiryId={t.id} />
              </div>

              {audience === "staff" && (
                <Link href={`/admin/enquiries/${t.id}`} className="inline-block text-xs font-medium text-action hover:underline">
                  Open full enquiry (assign, change status) →
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}
