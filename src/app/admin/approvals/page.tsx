import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ReviewDocActions from "@/components/admin/ReviewDocActions";
import { formatDateTime } from "@/lib/utils";
import { isAdminRole, isStaffRole } from "@/types";
import {
  fetchReviewDocs,
  parseReviewTab,
  HISTORY_LIMIT,
  type ReviewDoc,
  type ReviewTab,
} from "@/lib/approvals";

export const metadata = { title: "Document Approvals — ConveyClear" };
export const dynamic = "force-dynamic";

// One route, two audiences (Zewn, 2026-07-28: "a central point").
//
//   ADMIN — the review queue plus the decided history. Approving your own team's
//           uploads is the one thing staff must not do for themselves (042), so
//           the Approve/Disapprove controls render for admins only.
//   STAFF — the same screen scoped to their OWN uploads, read-only. This is where
//           a ConveyClear member finds out a file was disapproved and why, which
//           is the other half of the notification they receive.
//
// Decided documents no longer vanish. A queue that empties on decision gives the
// uploader nowhere to look and the reviewer no record of what they released, so
// approved rows stay green, disapproved rows stay red with the reason on the row
// (not on hover — the reason is the actionable part, and hover does not exist on
// the phones these get read on).

const TABS: { key: ReviewTab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "disapproved", label: "Not approved" },
  { key: "all", label: "All" },
];

const ROW_TINT: Record<ReviewDoc["state"], string> = {
  pending: "bg-white hover:bg-gray-50",
  approved: "bg-green-50/70 hover:bg-green-50",
  disapproved: "bg-red-50/70 hover:bg-red-50",
};

export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");
  const isAdmin = isAdminRole(session.profile?.role);
  const meId = session.profile?.id ?? null;

  const tab = parseReviewTab(searchParams?.tab);

  // Admin reads past RLS (that is the point of a review queue); staff read
  // through it, restricted to their own uploads. See lib/approvals.ts.
  const client = isAdmin ? createAdminClient() : await createClient();
  const { docs, error, truncated } = await fetchReviewDocs(
    client,
    tab,
    isAdmin ? null : meId
  );

  // Signed URLs so a reviewer can open the file before deciding — a review queue
  // you cannot open the file from is not a review queue. Admin only: minting a
  // service-role URL for a staff member would hand out a link that outlives their
  // own permissions.
  const viewUrls: Record<string, string> = {};
  if (isAdmin) {
    const admin = client;
    await Promise.all(
      docs.map(async (d) => {
        if (!d.storagePath) return;
        const { data } = await admin.storage.from(d.storageBucket).createSignedUrl(d.storagePath, 300);
        if (data?.signedUrl) viewUrls[d.id] = data.signedUrl;
      })
    );
  }

  const pendingCount = tab === "pending" ? docs.length : null;

  function tabHref(t: ReviewTab) {
    return t === "pending" ? "/admin/approvals" : `/admin/approvals?tab=${t}`;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Document Approvals</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin ? (
            <>
              Uploads by ConveyClear services, ops and delivery staff are held for
              review here before clients and partner firms can see them.
            </>
          ) : (
            <>
              The documents you have uploaded, and what an admin decided about
              each. Green means released to the client and partner firm; red means
              it was not approved — the reason is on the row.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={
                active
                  ? "-mb-px border-b-2 border-[#E8521A] px-3 py-2 text-sm font-semibold text-[#E8521A]"
                  : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {t.label}
              {t.key === "pending" && pendingCount ? (
                <span className="ml-1.5 rounded-full bg-[#E8521A] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/* ⚠️ An empty queue and a BROKEN queue look identical unless we say so.
          If the query errors, `data` comes back null and this page would
          otherwise render a confident "nothing waiting" while documents sit
          pending and invisible. On a review screen that silence is the one
          failure that must never be quiet. */}
      {error ? (
        <Card className="border-2 !border-red-500">
          <h2 className="text-sm font-semibold text-red-700">
            This queue could not be loaded — do not read it as empty
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Pending documents may exist with no way to release them. Check that
            migrations 042 and 044 are applied.
          </p>
          <p className="mt-2 font-mono text-xs text-gray-500">{error.message}</p>
        </Card>
      ) : docs.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">
            {tab === "pending"
              ? isAdmin
                ? "Nothing waiting. Documents uploaded by admins, clients and partner firms are released automatically and never appear here."
                : "None of your uploads are waiting for review."
              : tab === "approved"
                ? "No approved documents yet."
                : tab === "disapproved"
                  ? "No documents have been turned down."
                  : isAdmin
                    ? "No documents have been uploaded yet."
                    : "You have not uploaded any documents yet."}
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
                  {isAdmin && <th className="px-4 py-3">Uploaded by</th>}
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">{isAdmin ? "Action" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((d) => (
                  <tr key={`${d.kind}-${d.id}`} className={ROW_TINT[d.state]}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{d.fileName}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={d.kind === "matter" ? "gray" : "info"}
                          label={d.kind === "matter" ? "Matter" : "Property transfer"}
                        />
                        {d.state === "approved" && <Badge variant="success" label="Approved" />}
                        {d.state === "disapproved" && <Badge variant="danger" label="Not approved" />}
                      </div>
                      {/* The reason is the actionable part of a disapproval — the
                          uploader needs it to know what to re-upload. It reads on
                          the row, not behind a hover title. */}
                      {d.state === "disapproved" && d.reason && (
                        <p className="mt-1.5 text-xs text-red-700">
                          <span className="font-semibold">Reason:</span> {d.reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={d.parentHref} className="text-[#1B2E6B] hover:underline">
                        {d.parentLabel}
                      </Link>
                    </td>
                    {isAdmin && <td className="px-4 py-3 text-gray-700">{d.uploader}</td>}
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(d.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {d.state === "pending" ? (
                        isAdmin ? (
                          <ReviewDocActions id={d.id} kind={d.kind} viewUrl={viewUrls[d.id]} />
                        ) : (
                          <span className="text-xs font-medium text-amber-700">Awaiting review</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-500">
                          {d.state === "approved" ? "Released" : "Held"}
                          {d.decidedAt && (
                            <span className="block text-gray-400">{formatDateTime(d.decidedAt)}</span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {truncated && (
        <p className="text-xs text-gray-400">
          Showing the most recent {HISTORY_LIMIT}. Older documents are still on
          their matter or transfer.
        </p>
      )}

      {isAdmin && (
        <p className="text-xs text-gray-400">
          Disapproving keeps the document and its reason as the audit trail and
          tells the uploader what to replace. To remove a file entirely, open the
          matter and remove it there.
        </p>
      )}
    </div>
  );
}
