import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import NewEnquiryForm from "@/components/partner/NewEnquiryForm";
import { formatDateTime } from "@/lib/utils";
import { ENQUIRY_STATUS_LABELS, type Enquiry, type EnquiryStatus } from "@/types";

export const metadata = { title: "Enquiries — ConveyClear Partner" };

function statusVariant(s: EnquiryStatus): "info" | "success" | "warning" | "gray" {
  return ({ open: "warning", assigned: "info", resolved: "success", closed: "gray" } as const)[s] ?? "gray";
}

export default async function PartnerEnquiries() {
  const supabase = await createClient();
  const [{ data: matterData }, { data: enquiryData }] = await Promise.all([
    supabase.from("matters").select("id, title").order("created_at", { ascending: false }).limit(100),
    supabase.from("enquiries").select("id, subject, status, matter_id, created_at, updated_at").order("updated_at", { ascending: false }),
  ]);
  const matters = (matterData as { id: string; title: string }[] | null) ?? [];
  const enquiries = (enquiryData as Enquiry[] | null) ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Enquiries</h1>
        <p className="text-sm text-gray-500 mt-1">Ask ConveyClear about a matter — the team is notified and will respond here.</p>
      </div>

      <NewEnquiryForm matters={matters} />

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Your enquiries</h2>
        <Card padding="none">
          <ul className="divide-y divide-gray-100">
            {enquiries.map((e) => (
              <li key={e.id}>
                <Link href={`/partner/enquiries/${e.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{e.subject}</p>
                    <p className="text-xs text-gray-400">Updated {formatDateTime(e.updated_at)}</p>
                  </div>
                  <Badge label={ENQUIRY_STATUS_LABELS[e.status]} variant={statusVariant(e.status)} />
                </Link>
              </li>
            ))}
            {enquiries.length === 0 && <li className="px-5 py-10 text-center text-gray-400">No enquiries yet</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
