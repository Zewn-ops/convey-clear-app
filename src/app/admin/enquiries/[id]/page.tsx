import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EnquiryReply from "@/components/enquiries/EnquiryReply";
import { formatDateTime } from "@/lib/utils";
import { isStaffRole, ENQUIRY_STATUS_LABELS, type Enquiry, type EnquiryMessage, type EnquiryStatus } from "@/types";
import { ArrowLeft, Phone } from "lucide-react";

export const dynamic = "force-dynamic";

function statusVariant(s: EnquiryStatus): "info" | "success" | "warning" | "gray" {
  return ({ open: "warning", assigned: "info", resolved: "success", closed: "gray" } as const)[s] ?? "gray";
}

type EnquiryRow = Enquiry & { business_partners?: { name: string } | null };

export default async function AdminEnquiryDetail({ params }: { params: { id: string } }) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");
  const id = params.id;

  async function claim() {
    "use server";
    const supabase = await createClient();
    const s = await getSessionProfile();
    await supabase.from("enquiries").update({ assigned_to: s?.profile?.id ?? null, status: "assigned" }).eq("id", id);
    revalidatePath(`/admin/enquiries/${id}`);
  }
  async function setStatus(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const status = String(formData.get("status") ?? "");
    if (!status) return;
    await supabase.from("enquiries").update({ status }).eq("id", id);
    revalidatePath(`/admin/enquiries/${id}`);
  }

  const supabase = await createClient();
  const { data: eData } = await supabase
    .from("enquiries")
    .select("id, subject, message, status, matter_id, assigned_to, created_at, business_partner_id, business_partners(name)")
    .eq("id", id)
    .maybeSingle();
  if (!eData) notFound();
  const enquiry = eData as unknown as EnquiryRow;

  const [{ data: msgData }, assignee, matterRow] = await Promise.all([
    supabase.from("enquiry_messages").select("id, author_label, body, created_at").eq("enquiry_id", id).order("created_at", { ascending: true }),
    enquiry.assigned_to
      ? supabase.from("users").select("full_name, phone").eq("id", enquiry.assigned_to).maybeSingle()
      : Promise.resolve({ data: null }),
    enquiry.matter_id
      ? supabase.from("matters").select("title").eq("id", enquiry.matter_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const messages = (msgData as EnquiryMessage[] | null) ?? [];
  const assigneeRow = assignee?.data as { full_name: string | null; phone: string | null } | null;
  const assigneeName = assigneeRow?.full_name ?? null;
  const assigneePhone = assigneeRow?.phone ?? null;
  const matterTitle = (matterRow?.data as { title: string | null } | null)?.title ?? null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/enquiries" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> All enquiries
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{enquiry.subject}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {enquiry.business_partners?.name ?? "—"}
            {enquiry.matter_id ? (
              <>
                {" · Re: "}
                <Link href={`/admin/matters/${enquiry.matter_id}`} className="text-[#E8521A] hover:underline">{matterTitle || "View matter"}</Link>
              </>
            ) : null}
          </p>
        </div>
        <Badge label={ENQUIRY_STATUS_LABELS[enquiry.status]} variant={statusVariant(enquiry.status)} />
      </div>

      {/* Assignment + status controls */}
      <Card className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600">
          {assigneeName ? <>Assigned to <strong>{assigneeName}</strong></> : "Unassigned"}
        </span>
        <form action={claim}>
          <button className="text-xs px-3 py-1.5 rounded-lg border border-[#1B2E6B] text-[#1B2E6B] font-medium hover:bg-[#1B2E6B]/5">
            Claim (assign to me)
          </button>
        </form>
        {assigneePhone && (
          <a
            href={`tel:${assigneePhone}`}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 inline-flex items-center gap-1"
          >
            <Phone className="h-3.5 w-3.5" /> Call {assigneeName ?? "assignee"}
          </a>
        )}
        <div className="flex-1" />
        {(["open", "assigned", "resolved", "closed"] as EnquiryStatus[]).map((st) => (
          <form key={st} action={setStatus}>
            <input type="hidden" name="status" value={st} />
            <button
              disabled={enquiry.status === st}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${
                enquiry.status === st ? "bg-gray-100 text-gray-400 cursor-default" : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {ENQUIRY_STATUS_LABELS[st]}
            </button>
          </form>
        ))}
      </Card>

      <Card className="space-y-4">
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
          <p className="text-xs text-gray-400 mb-1">{enquiry.business_partners?.name ?? "Partner"} · {formatDateTime(enquiry.created_at)}</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{enquiry.message}</p>
        </div>
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg border border-gray-100 p-3">
            <p className="text-xs text-gray-400 mb-1">{m.author_label || "ConveyClear"} · {formatDateTime(m.created_at)}</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        <EnquiryReply enquiryId={enquiry.id} />
      </Card>
    </div>
  );
}
