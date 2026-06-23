import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EnquiryReply from "@/components/enquiries/EnquiryReply";
import { formatDateTime } from "@/lib/utils";
import { ENQUIRY_STATUS_LABELS, type Enquiry, type EnquiryMessage, type EnquiryStatus } from "@/types";
import { ArrowLeft, Phone } from "lucide-react";
import { CONVEYCLEAR_PHONE, telHref } from "@/lib/contact";

function statusVariant(s: EnquiryStatus): "info" | "success" | "warning" | "gray" {
  return ({ open: "warning", assigned: "info", resolved: "success", closed: "gray" } as const)[s] ?? "gray";
}

export default async function PartnerEnquiryDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: eData } = await supabase
    .from("enquiries")
    .select("id, subject, message, status, matter_id, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!eData) notFound();
  const enquiry = eData as Enquiry;

  const [{ data: msgData }, matterRow] = await Promise.all([
    supabase.from("enquiry_messages").select("id, author_label, body, created_at").eq("enquiry_id", params.id).order("created_at", { ascending: true }),
    enquiry.matter_id
      ? supabase.from("matters").select("title").eq("id", enquiry.matter_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const messages = (msgData as EnquiryMessage[] | null) ?? [];
  const matterTitle = (matterRow?.data as { title: string | null } | null)?.title ?? null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/partner/enquiries" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to enquiries
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{enquiry.subject}</h1>
          {enquiry.matter_id && (
            <p className="text-sm text-gray-500 mt-1">
              Re:{" "}
              <Link href={`/partner/matters/${enquiry.matter_id}`} className="text-[#E8521A] hover:underline">{matterTitle || "View matter"}</Link>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge label={ENQUIRY_STATUS_LABELS[enquiry.status]} variant={statusVariant(enquiry.status)} />
          <a
            href={telHref(CONVEYCLEAR_PHONE)}
            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            <Phone className="h-3.5 w-3.5" /> Call ConveyClear · {CONVEYCLEAR_PHONE}
          </a>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
          <p className="text-xs text-gray-400 mb-1">You · {formatDateTime(enquiry.created_at)}</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{enquiry.message}</p>
        </div>
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg border border-gray-100 p-3">
            <p className="text-xs text-gray-400 mb-1">{m.author_label || "ConveyClear"} · {formatDateTime(m.created_at)}</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        {enquiry.status !== "closed" && <EnquiryReply enquiryId={enquiry.id} />}
      </Card>
    </div>
  );
}
