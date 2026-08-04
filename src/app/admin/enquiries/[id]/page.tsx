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

type EnquiryRow = Enquiry & { firms?: { name: string } | null };

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
    .select("id, subject, message, status, matter_id, assigned_to, created_at, business_partner_id, firms(name)")
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
      <Link href="/admin/enquiries" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> All enquiries
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">{enquiry.subject}</h1>
          <p className="text-sm text-ink-3 mt-1">
            {enquiry.firms?.name ?? "—"}
            {enquiry.matter_id ? (
              <>
                {" · Re: "}
                <Link href={`/admin/matters/${enquiry.matter_id}`} className="text-action hover:underline">{matterTitle || "View matter"}</Link>
              </>
            ) : null}
          </p>
        </div>
        <Badge label={ENQUIRY_STATUS_LABELS[enquiry.status]} variant={statusVariant(enquiry.status)} />
      </div>

      {/* Assignment + status controls */}
      <Card className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-2">
          {assigneeName ? <>Assigned to <strong>{assigneeName}</strong></> : "Unassigned"}
        </span>
        <form action={claim}>
          <button className="text-xs px-3 py-1.5 rounded-lg border border-line text-action font-medium hover:bg-action-fill/5">
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
                enquiry.status === st ? "bg-raised text-ink-3 cursor-default" : "border-line text-ink-2 hover:border-line-strong"
              }`}
            >
              {ENQUIRY_STATUS_LABELS[st]}
            </button>
          </form>
        ))}
      </Card>

      <Card className="space-y-4">
        <div className="rounded-lg bg-raised border border-line p-3">
          <p className="text-xs text-ink-3 mb-1">{enquiry.firms?.name ?? "Partner"} · {formatDateTime(enquiry.created_at)}</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{enquiry.message}</p>
        </div>
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg border border-line p-3">
            <p className="text-xs text-ink-3 mb-1">{m.author_label || "ConveyClear"} · {formatDateTime(m.created_at)}</p>
            <p className="text-sm text-ink whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        <EnquiryReply enquiryId={enquiry.id} />
      </Card>
    </div>
  );
}
