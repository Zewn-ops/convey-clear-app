import { isStaffRole, isPartnerRole, type UserRole } from "@/types";
import type { createClient } from "@/lib/supabase/server";

// SERVER-ONLY. Enquiries are the SHARED thread on a matter (staff / partner /
// client); matter_activities remains the internal channel.

// Who a message is attributed to in the thread. Before migration 027 only staff
// and partners could post, and the label was a two-way `role === "business_partner"`
// check — which would have stamped a client's reply "ConveyClear".
export function enquiryAuthorLabel(role?: UserRole | null): string {
  if (isStaffRole(role)) return "ConveyClear";
  if (isPartnerRole(role)) return "Partner";
  return "Client";
}

export interface EnquiryThreadMessage {
  id: string;
  author_label: string | null;
  body: string;
  created_at: string;
}

export interface EnquiryThread {
  id: string;
  subject: string;
  message: string;
  status: string;
  visibility: string;
  created_at: string;
  messages: EnquiryThreadMessage[];
}

// Every enquiry on a matter that the CALLER may see, newest first, each with its
// reply thread. Pass a request-scoped (user) client — RLS does the filtering:
// staff see all, the owning firm sees its own, the client sees only 'shared'.
export async function getMatterEnquiries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matterId: string
): Promise<EnquiryThread[]> {
  const { data: enquiryRows } = await supabase
    .from("enquiries")
    .select("id, subject, message, status, visibility, created_at")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: false });

  const enquiries = (enquiryRows as Omit<EnquiryThread, "messages">[] | null) ?? [];
  if (enquiries.length === 0) return [];

  const { data: messageRows } = await supabase
    .from("enquiry_messages")
    .select("id, enquiry_id, author_label, body, created_at")
    .in("enquiry_id", enquiries.map((e) => e.id))
    .order("created_at", { ascending: true });

  const byEnquiry = new Map<string, EnquiryThreadMessage[]>();
  for (const m of (messageRows as (EnquiryThreadMessage & { enquiry_id: string })[] | null) ?? []) {
    const list = byEnquiry.get(m.enquiry_id) ?? [];
    list.push({ id: m.id, author_label: m.author_label, body: m.body, created_at: m.created_at });
    byEnquiry.set(m.enquiry_id, list);
  }

  return enquiries.map((e) => ({ ...e, messages: byEnquiry.get(e.id) ?? [] }));
}
