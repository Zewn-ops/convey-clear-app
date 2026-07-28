// Shared data layer for the document-review screens.
//
// Two audiences read the same underlying rows and must NOT read them the same way:
//
//   ADMIN  — the review queue. Reads with the service role deliberately, because
//            once 043 is applied the read policies hide unapproved rows and this
//            screen exists precisely to show them. Safe only because the page is
//            admin-gated before this is called.
//   STAFF  — "what happened to the files I uploaded". Reads with the CALLER's
//            client (normal RLS) and is additionally scoped to their own uploads.
//            043 leaves staff able to see pending rows via the separate
//            documents_staff_all FOR ALL policy, so RLS is sufficient here —
//            reaching for the service role would turn a status page into an
//            RLS bypass for every document in the system.
//
// Matter and transfer documents live in two tables with the same shape and
// different uploader columns (documents.uploaded_by_user_id is a user; the text
// transfer_documents.uploaded_by is a *uuid* here but a category on the matter
// side — the 042 lesson). They are normalised to one row type at this boundary
// so the screens never branch on it again.

export type ReviewState = "pending" | "approved" | "disapproved";
export type ReviewTab = ReviewState | "all";

export interface ReviewDoc {
  id: string;
  kind: "matter" | "transfer";
  fileName: string;
  createdAt: string;
  parentHref: string;
  parentLabel: string;
  uploader: string;
  uploaderRole: string | null;
  state: ReviewState;
  decidedAt: string | null;
  reason: string | null;
  storageBucket: string;
  storagePath: string | null;
}

export function reviewState(row: { approved_at?: string | null; disapproved_at?: string | null }): ReviewState {
  if (row.disapproved_at) return "disapproved";
  if (row.approved_at) return "approved";
  return "pending";
}

export function parseReviewTab(v: string | string[] | undefined): ReviewTab {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "approved" || s === "disapproved" || s === "all" ? s : "pending";
}

// Decided rows accumulate forever; the queue must not. History is capped so an
// old portal still renders, and the cap is surfaced in the UI rather than
// silently truncating the list.
export const HISTORY_LIMIT = 100;

type MatterDocRow = {
  id: string;
  file_name: string | null;
  document_type: string | null;
  created_at: string;
  matter_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  approved_at: string | null;
  disapproved_at: string | null;
  disapproval_reason: string | null;
  matters?: { title: string | null } | null;
  users?: { full_name: string | null; email: string | null; role: string | null } | null;
};

type TransferDocRow = {
  id: string;
  file_name: string | null;
  document_type: string | null;
  created_at: string;
  transfer_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  approved_at: string | null;
  disapproved_at: string | null;
  disapproval_reason: string | null;
  property_transfers?: { reference: string | null } | null;
  users?: { full_name: string | null; email: string | null; role: string | null } | null;
};

const MATTER_SELECT =
  "id, file_name, document_type, created_at, matter_id, storage_bucket, storage_path, approved_at, disapproved_at, disapproval_reason, matters(title), users!documents_uploaded_by_user_id_fkey(full_name, email, role)";
const TRANSFER_SELECT =
  "id, file_name, document_type, created_at, transfer_id, storage_bucket, storage_path, approved_at, disapproved_at, disapproval_reason, property_transfers(reference), users!transfer_documents_uploaded_by_fkey(full_name, email, role)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyTab(query: any, tab: ReviewTab): any {
  if (tab === "pending") return query.is("approved_at", null).is("disapproved_at", null);
  if (tab === "approved") return query.not("approved_at", "is", null);
  if (tab === "disapproved") return query.not("disapproved_at", "is", null);
  return query;
}

function uploaderLabel(u: MatterDocRow["users"]): string {
  if (!u) return "Unknown";
  return u.full_name || u.email || "Unknown";
}

/**
 * Fetch review rows for a tab.
 * @param client  service-role client for admin, RLS client for staff
 * @param ownUploaderId  when set, restricts to that user's own uploads (staff view)
 */
export async function fetchReviewDocs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  tab: ReviewTab,
  ownUploaderId?: string | null
): Promise<{ docs: ReviewDoc[]; error: { message: string } | null; truncated: boolean }> {
  let matterQ = applyTab(client.from("documents").select(MATTER_SELECT), tab);
  let transferQ = applyTab(client.from("transfer_documents").select(TRANSFER_SELECT), tab);
  if (ownUploaderId) {
    matterQ = matterQ.eq("uploaded_by_user_id", ownUploaderId);
    transferQ = transferQ.eq("uploaded_by", ownUploaderId);
  }

  // Pending is oldest-first (a review queue is a to-do list, and the oldest wait
  // is the most urgent). History is newest-first — the last decision matters most.
  const asc = tab === "pending";
  const [{ data: mData, error: mErr }, { data: tData, error: tErr }] = await Promise.all([
    matterQ.order("created_at", { ascending: asc }).limit(HISTORY_LIMIT + 1),
    transferQ.order("created_at", { ascending: asc }).limit(HISTORY_LIMIT + 1),
  ]);

  const matterRows = (mData as MatterDocRow[] | null) ?? [];
  // A mirrored matter upload appears in BOTH tables. Approving the matter row
  // propagates to its mirror (042/044 triggers), so listing the mirror separately
  // would show two rows for one decision. Transfer rows are only listed when they
  // carry their own uploader — i.e. someone uploaded straight onto the transfer.
  const transferRows = ((tData as TransferDocRow[] | null) ?? []).filter((r) => r.users);

  const docs: ReviewDoc[] = [
    ...matterRows.map((d) => ({
      id: d.id,
      kind: "matter" as const,
      fileName: d.file_name || d.document_type || "Untitled",
      createdAt: d.created_at,
      parentHref: `/admin/matters/${d.matter_id}`,
      parentLabel: d.matters?.title || "Open matter",
      uploader: uploaderLabel(d.users),
      uploaderRole: d.users?.role ?? null,
      state: reviewState(d),
      decidedAt: d.disapproved_at ?? d.approved_at,
      reason: d.disapproval_reason,
      storageBucket: d.storage_bucket ?? "matter-documents",
      storagePath: d.storage_path,
    })),
    ...transferRows.map((d) => ({
      id: d.id,
      kind: "transfer" as const,
      fileName: d.file_name || d.document_type || "Untitled",
      createdAt: d.created_at,
      parentHref: `/admin/property-transfers/${d.transfer_id}`,
      parentLabel: d.property_transfers?.reference || "Open transfer",
      uploader: uploaderLabel(d.users),
      uploaderRole: d.users?.role ?? null,
      state: reviewState(d),
      decidedAt: d.disapproved_at ?? d.approved_at,
      reason: d.disapproval_reason,
      storageBucket: d.storage_bucket ?? "transfer-documents",
      storagePath: d.storage_path,
    })),
  ].sort((a, b) =>
    asc ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)
  );

  const truncated = docs.length > HISTORY_LIMIT;
  return {
    docs: truncated ? docs.slice(0, HISTORY_LIMIT) : docs,
    error: mErr ?? tErr ?? null,
    truncated,
  };
}
