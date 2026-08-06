"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import Card from "@/components/ui/Card";

/**
 * Staff raise an enquiry with a firm.
 *
 * The queue was read-only for staff: a question that arrived by phone or email
 * had nowhere to live, so the thread that answered it started outside the portal
 * and stayed there.
 */
export default function NewEnquiryButton({
  firms,
}: {
  firms: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firmId, setFirmId] = useState(firms[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const field =
    "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action";
  const lbl = "text-xs font-medium text-ink-2";

  async function save() {
    if (!subject.trim()) return toast.error("A subject is required.");
    if (!message.trim()) return toast.error("A message is required.");
    if (!firmId) return toast.error("Pick the firm this is with.");
    setSaving(true);
    try {
      const r = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firm_id: firmId, subject, message }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Could not create the enquiry");
      toast.success("Enquiry created");
      setOpen(false);
      setSubject("");
      setMessage("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the enquiry");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> New enquiry
      </button>
    );
  }

  return (
    <Card className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">New enquiry</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-3 hover:text-ink-2">
          Cancel
        </button>
      </div>

      <label className="block">
        <span className={lbl}>Firm</span>
        <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className={field}>
          {firms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={lbl}>Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Timeline for Erf 1234 clearance"
          className={field}
        />
      </label>

      <label className="block">
        <span className={lbl}>Message</span>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What was asked, and by whom…"
          className={field}
        />
      </label>

      <p className="text-[12px] text-ink-3">
        Raised by you, so it starts <strong className="text-ink-2">assigned to you</strong> rather
        than in the open queue — nobody else needs to claim it.
      </p>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-action-fill px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Creating…" : "Create enquiry"}
      </button>
    </Card>
  );
}
