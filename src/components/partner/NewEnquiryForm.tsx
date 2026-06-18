"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

// Partner raises a new matter enquiry → central ConveyClear inbox.
export default function NewEnquiryForm({ matters }: { matters: { id: string; title: string }[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [matterId, setMatterId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!subject.trim()) return toast.error("Add a subject");
    if (!message.trim()) return toast.error("Add a message");
    setLoading(true);
    const res = await fetch("/api/partner/enquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message, matter_id: matterId || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not send the enquiry");
    toast.success("Enquiry sent to ConveyClear");
    setSubject("");
    setMatterId("");
    setMessage("");
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold text-gray-900">New matter enquiry</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Clearance figures query" />
        <Select
          label="Related matter (optional)"
          value={matterId}
          onChange={(e) => setMatterId(e.target.value)}
          options={[{ value: "", label: "— None —" }, ...matters.map((m) => ({ value: m.id, label: m.title || m.id }))]}
        />
      </div>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="How can ConveyClear help?"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] resize-none"
        />
      </label>
      <Button onClick={submit} loading={loading} className="w-full sm:w-auto" size="lg">
        Send enquiry
      </Button>
    </Card>
  );
}
