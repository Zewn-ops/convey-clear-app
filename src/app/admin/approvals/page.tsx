import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ReviewDocActions from "@/components/admin/ReviewDocActions";
import { formatDateTime } from "@/lib/utils";
import { isAdminRole } from "@/types";

export const metadata = { title: "Document Approvals — ConveyClear Admin" };
export const dynamic = "force-dynamic";

// The review queue for Jukka's requirement (2026-07-22): a document uploaded by
// ConveyClear ops / services / a runner is invisible to clients and business
// partners until an admin confirms the right file went up.
//
// Reads with the SERVICE ROLE deliberately. Once migration 043 is applied the
// read policies hide unapproved rows from non-staff — but this page must show
// exactly those rows, and doing it through the caller's client would depend on
// the staff FOR ALL policy continuing to overlap the gate. Reading past RLS here
// is safe because the page itself is admin-gated one line below.

type PendingMatterDoc = {
  id: string;
  file_name: string | null;
  document_type: string | null;
  created_at: string;
  matter_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  matters?: { title: string | null } | null;
  users?: { full_name: string | null; email: string | null; role: string | null } | null;
};

type PendingTransferDoc = {
  id: string;
  file_name: string | null;
  document_type: string | null;
  created_at: string;
  transfer_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  property_transfers?: { reference: string | null } | null;
  users?: { full_name: string | null; email: string | null; role: string | null } | null;
};

export default async function AdminApprovalsPage() {
  const session = await getSessionProfile();
  if (!session || !isAdminRole(session.profile?.role)) redirect("/admin");

  const admin = createAdminClient();

  // Both queries tolerate the columns not existing yet (migration 042 not
  // applied): PostgREST answers 42703 and returns no rows, so the page renders
  // an empty queue instead of a 500. That keeps the app deployable ahead of the
  // migration, which is the whole point of the two-step rollout.
  const [
    { data: matterDocs, error: matterErr },
    { data: transferDocs, error: transferErr },
  ] = await Promise.all([
    admin
      .from("documents")
      .select(
        "id, file_name, document_type, created_at, matter_id, storage_bucket, storage_path, matters(title), users!documents_uploaded_by_user_id_fkey(full_name, email, role)"
      )
      .is("approved_at", null)
      // 044: a disapproved doc also has approved_at NULL but is decided, not
      // pending — keep it out of the review queue.
      .is("disapproved_at", null)
      .order("created_at", { ascending: true }),
    admin
      .from("transfer_documents")
      .select(
        "id, file_name, document_type, created_at, transfer_id, storage_bucket, storage_path, property_transfers(reference), users!transfer_documents_uploaded_by_fkey(full_name, email, role)"
      )
      .is("approved_at", null)
      .is("disapproved_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const matterRows = (matterDocs as PendingMatterDoc[] | null) ?? [];
  // A mirrored matter upload appears in BOTH tables while pending. Approving the
  // matter row propagates to its mirror (042's trigger), so listing the mirror
  // separately would show the reviewer two rows for one decision. Transfer rows
  // are only listed when they carry their own uploader — i.e. someone uploaded
  // straight onto the transfer and there is no matter row to approve instead.
  const transferRows = ((transferDocs as PendingTransferDoc[] | null) ?? []).filter(
    (r) => r.users
  );
  const total = matterRows.length + transferRows.length;

  // Signed URLs so the reviewer can open the file before deciding — the whole
  // point of a review queue. Service role, short-lived (5 min). Keyed by doc id.
  const viewUrls: Record<string, string> = {};
  await Promise.all(
    [
      ...matterRows.map((d) => ({ id: d.id, bucket: d.storage_bucket ?? "matter-documents", path: d.storage_path })),
      ...transferRows.map((d) => ({ id: d.id, bucket: d.storage_bucket ?? "transfer-documents", path: d.storage_path })),
    ].map(async ({ id, bucket, path }) => {
      if (!path) return;
      const { data } = await admin.storage.from(bucket).createSignedUrl(path, 300);
      if (data?.signedUrl) viewUrls[id] = data.signedUrl;
    })
  );

  // ⚠️ An empty queue and a BROKEN queue look identical unless we say so.
  // If either query errors — a mistyped embed hint, or migration 042 not applied
  // so approved_at does not exist — `data` comes back null and this page would
  // otherwise render a confident "nothing waiting" while documents sit pending
  // and invisible to the client. On a review screen that silence is the one
  // failure that must never be quiet, so a load failure is shown, not swallowed.
  const loadError = matterErr ?? transferErr;

  function uploaderLabel(u: PendingMatterDoc["users"]) {
    if (!u) return "Unknown";
    return u.full_name || u.email || "Unknown";
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Document Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">
          {loadError
            ? "The queue could not be loaded."
            : total === 0
              ? "Nothing waiting — every uploaded document has been released."
              : `${total} document${total === 1 ? "" : "s"} waiting for review.`}{" "}
          Uploads by ConveyClear services, ops and delivery staff stay hidden from
          clients and partner firms until approved here.
        </p>
      </div>

      {loadError ? (
        <Card className="border-2 !border-red-500">
          <h2 className="text-sm font-semibold text-red-700">
            This queue could not be loaded — do not read it as empty
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Pending documents may exist and are currently hidden from clients and
            partner firms with no way to release them. Most likely migration 042
            has not been applied yet.
          </p>
          <p className="mt-2 font-mono text-xs text-gray-500">{loadError.message}</p>
        </Card>
      ) : total === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">
            Nothing to review. Documents uploaded by admins, clients and partner
            firms are released automatically and never appear in this queue.
          </p>
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Where</th>
                  <th className="px-4 py-3">Uploaded by</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matterRows.map((d) => (
                  <tr key={`m-${d.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {d.file_name || d.document_type || "Untitled"}
                      </div>
                      <Badge variant="gray" label="Matter" />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/matters/${d.matter_id}`}
                        className="text-[#1B2E6B] hover:underline"
                      >
                        {d.matters?.title || "Open matter"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{uploaderLabel(d.users)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(d.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <ReviewDocActions id={d.id} kind="matter" viewUrl={viewUrls[d.id]} />
                    </td>
                  </tr>
                ))}
                {transferRows.map((d) => (
                  <tr key={`t-${d.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {d.file_name || d.document_type || "Untitled"}
                      </div>
                      <Badge variant="info" label="Property transfer" />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/property-transfers/${d.transfer_id}`}
                        className="text-[#1B2E6B] hover:underline"
                      >
                        {d.property_transfers?.reference || "Open transfer"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{uploaderLabel(d.users)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(d.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <ReviewDocActions id={d.id} kind="transfer" viewUrl={viewUrls[d.id]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs text-gray-400">
        To reject a document instead, open the matter and remove it — removal
        already distinguishes a file the matter owns from one it reuses.
      </p>
    </div>
  );
}
