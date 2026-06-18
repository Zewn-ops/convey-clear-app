"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

// Reply box for an enquiry thread — used by both the partner and staff views.
export default function EnquiryReply({ enquiryId }: { enquiryId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!body.trim()) return;
    setLoading(true);
    const res = await fetch("/api/enquiries/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enquiry_id: enquiryId, body: body.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not send reply");
    setBody("");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Write a reply…"
        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] resize-none"
      />
      <button
        type="button"
        onClick={send}
        disabled={loading || !body.trim()}
        className="self-end px-4 py-2 text-sm font-medium bg-[#E8521A] text-white rounded-lg hover:bg-[#E8521A]/90 disabled:opacity-50"
      >
        {loading ? "Sending…" : "Reply"}
      </button>
    </div>
  );
}
