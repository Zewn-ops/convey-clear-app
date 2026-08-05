import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import EmptyState from "@/components/ui/EmptyState";
import NewEnquiryForm from "@/components/partner/NewEnquiryForm";
import { formatDateTime } from "@/lib/utils";
import { ENQUIRY_STATUS_LABELS, type Enquiry, type EnquiryStatus } from "@/types";
import { MessageSquare } from "lucide-react";

export const metadata = { title: "Enquiries — ConveyClear Partner" };

// open = ConveyClear has not picked it up yet, which from the firm's side is
// waiting on someone else. Resolved is the only "done" state.
const STATUS_TONE: Record<string, StatusTone> = {
  open: "waiting",
  assigned: "action",
  resolved: "ok",
  closed: "neutral",
};

export default async function PartnerEnquiries() {
  const supabase = await createClient();
  const [{ data: matterData }, { data: enquiryData }] = await Promise.all([
    supabase.from("matters").select("id, title").order("created_at", { ascending: false }).limit(100),
    supabase.from("enquiries").select("id, subject, status, matter_id, created_at, updated_at").order("updated_at", { ascending: false }),
  ]);
  const matters = (matterData as { id: string; title: string }[] | null) ?? [];
  const enquiries = (enquiryData as Enquiry[] | null) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Enquiries</h1>
        <p className="mt-2.5 text-[15px] font-medium text-ink-3">Ask ConveyClear about a matter — the team is notified and will respond here.</p>
      </div>

      <NewEnquiryForm matters={matters} />

      <div>
        <h2 className="mb-3 text-[19px] font-semibold tracking-[-0.015em] text-ink">Your enquiries</h2>
        {enquiries.length === 0 ? (
          <EmptyState title="No enquiries yet" icon={<MessageSquare className="h-6 w-6" />}>
            Ask about a matter above. ConveyClear is notified and answers in the same thread, so the
            question and its answer stay attached to the matter.
          </EmptyState>
        ) : (
          <ul className="space-y-2.5">
            {enquiries.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/partner/enquiries/${e.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg bg-surface px-5 py-4 shadow-sm transition-shadow duration-200 ease-out hover:shadow dark:ring-1 dark:ring-line"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-ink">{e.subject}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      Updated {formatDateTime(e.updated_at)}
                    </p>
                  </div>
                  <StatusPill tone={STATUS_TONE[e.status] ?? "neutral"}>
                    {ENQUIRY_STATUS_LABELS[e.status as EnquiryStatus] ?? e.status}
                  </StatusPill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
