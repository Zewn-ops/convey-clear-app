import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TransferCard from "@/components/transfers/TransferCard";
import EmptyState from "@/components/ui/EmptyState";
import { TRANSFER_STATUS_LABELS, type PropertyTransfer } from "@/types";
import { Plus, Building2, FileEdit, Inbox } from "lucide-react";
import FilterBar from "@/components/ui/FilterBar";
import { type Facet } from "@/components/ui/FilterRail";
import {
  parseListFilters,
  applyTextSearch,
  startOfMonthISO,
  periodFacet,
  applyPaging,
} from "@/lib/list-filters";
import Pagination from "@/components/ui/Pagination";
import {
  TRANSFER_PROGRESS_SELECT,
  transferProgressById,
  type TransferProgress,
} from "@/lib/transfer-service-progress";

export const metadata = { title: "Property Transfers — ConveyClear Partner" };
export const dynamic = "force-dynamic";

// Read-only. RLS (property_transfers_read_scoped) already limits these rows to
// the caller's own firm — no extra filter needed here, and none of the facets
// below can widen that: they only ever narrow what RLS already returned.
export default async function PartnerTransfersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createClient();

  const filters = parseListFilters(searchParams, Object.keys(TRANSFER_STATUS_LABELS));
  const get = (k: string) => {
    const v = searchParams?.[k];
    return Array.isArray(v) ? v[0] : v;
  };

  // Councils come from the transfers this firm can actually see, not from the
  // municipalities table: offering a firm a council it has no work in is a
  // filter that can only ever return nothing. RLS scopes this read too.
  const { data: muniRows } = await supabase
    .from("property_transfers")
    .select("municipality")
    .not("municipality", "is", null);
  const municipalities = Array.from(
    new Set(((muniRows as { municipality: string | null }[] | null) ?? []).map((r) => r.municipality!))
  ).sort();
  const muni = municipalities.includes(get("municipality") ?? "") ? get("municipality")! : "";

  // 078 — this firm's unfinished requests. RLS scopes it: a draft is readable
  // only by the firm that owns it, and is invisible to ConveyClear entirely
  // until it is sent. Unfiltered by the facets below on purpose — a draft is
  // not a transfer and does not belong in that count.
  const { data: draftRows } = await supabase
    .from("transfer_requests")
    .select("id, property_description, suggested_reference, updated_at")
    .eq("status", "draft")
    .order("updated_at", { ascending: false });
  const drafts =
    (draftRows as
      | { id: string; property_description: string | null; suggested_reference: string | null; updated_at: string }[]
      | null) ?? [];

  let query = supabase
    .from("property_transfers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  // 🔒 084 — the firm does not see an ARCHIVED transfer. It means the transfer
  // should never have existed, so showing the attorney a transaction we have
  // written off as a mistake invites them to work it.
  //
  // Filtered here rather than in RLS, deliberately: the firm's access grant
  // (052) is not revoked, because revoking it would erase the fact that they
  // once had access. A firm holding the URL can still open it, exactly as with
  // a cancelled one. If that ever needs to be a real boundary it belongs in
  // RLS, not in a list filter — recorded in 084's header too.
  //
  // CANCELLED stays visible: it is their transaction and their client's, and a
  // sale that collapsed is something they need to see, with our reason on it.
  query = query.neq("status", "archived");
  if (filters.type) query = query.eq("status", filters.type);
  if (muni) query = query.eq("municipality", muni);
  if (filters.scope === "month") query = query.gte("created_at", startOfMonthISO());
  // No erf_number on property_transfers — the erf lives inside the free-text
  // property_description, which is why that column is searched instead.
  query = applyTextSearch(query, filters.q, ["reference", "property_description"]);

  const { data, count } = await applyPaging(query, filters);
  const transfers = (data as PropertyTransfer[] | null) ?? [];
  const total = count ?? 0;
  const filtering = Boolean(filters.q || filters.type || muni) || filters.scope !== "all";

  const facets: Facet[] = [
    {
      key: "type",
      label: "Status",
      defaultValue: "",
      options: [
        { value: "", label: "Any status" },
        ...Object.entries(TRANSFER_STATUS_LABELS).map(([value, label]) => ({
          value,
          label: String(label),
        })),
      ],
    },
    // Only worth a control when there is a choice to make.
    ...(municipalities.length > 1
      ? [
          {
            key: "municipality",
            label: "Council",
            defaultValue: "",
            options: [
              { value: "", label: "Any council" },
              ...municipalities.map((m) => ({ value: m, label: m })),
            ],
          } as Facet,
        ]
      : []),
    periodFacet() as Facet,
  ];

  let progressById = new Map<string, TransferProgress>();
  if (transfers.length) {
    const ids = transfers.map((t) => t.id);
    // One query for the whole page, not one per card. RLS scopes it.
    //
    // The matter-count query that stood beside this one is GONE along with the
    // chip it fed (2026-09-02): a firm reads a transfer through its service
    // lines, so counting matters here bought a number nobody reads.
    const { data: svcRows } = await supabase
      .from("transfer_services")
      .select(TRANSFER_PROGRESS_SELECT)
      .in("transfer_id", ids);
    progressById = transferProgressById(svcRows, ids);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Property transfers</h1>
          {/* The TOTAL, not the page — `transfers.length` caps at the page size. */}
          <p className="mt-2.5 text-[15px] font-medium text-ink-3">
            {total} transfer{total === 1 ? "" : "s"} · every matter in one transaction, together
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* §5.10 — where a request went, and why one was declined. Its own
              page rather than a section here: this list is transfers that
              EXIST, and a declined request is precisely one that does not. */}
          <Link
            href="/partner/transfers/requests"
            className="inline-flex items-center gap-1.5 rounded border border-line px-3.5 py-2 text-sm font-semibold text-ink-2 transition-colors duration-150 ease-out hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <Inbox className="h-4 w-4" /> Requests
          </Link>
          <Link
            href="/partner/transfers/new"
            className="inline-flex items-center gap-1.5 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <Plus className="h-4 w-4" /> Request a transfer
          </Link>
        </div>
      </div>

      {/* Unfinished requests, above the transfers they will become. Zewn,
          2026-08-31: "if they get halfway with a request and want to return
          later they can draft it and finish it later on" — which only works if
          a draft is findable again, so it sits on the page they land on rather
          than behind the request form. */}
      {drafts.length > 0 && (
        <div className="rounded-lg border border-line bg-raised/60 p-4">
          <p className="mono text-[10px] font-bold uppercase tracking-[0.11em] text-ink-3">
            Unfinished requests
          </p>
          <p className="mt-0.5 text-xs text-ink-3">
            Only your firm can see these. ConveyClear is not told about a draft
            until you send it.{" "}
            <Link href="/partner/transfers/requests" className="font-medium text-action hover:underline">
              See all requests
            </Link>
            .
          </p>
          <ul className="mt-3 space-y-2">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/partner/transfers/new?draft=${d.id}`}
                  className="flex items-center justify-between gap-3 rounded border border-line bg-surface px-3 py-2 hover:bg-raised"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileEdit className="h-4 w-4 shrink-0 text-ink-3" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {d.property_description?.trim() ||
                          d.suggested_reference?.trim() ||
                          "Untitled request"}
                      </span>
                      <span className="block text-xs text-ink-3">
                        Saved {new Date(d.updated_at).toLocaleDateString("en-ZA")}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-action">Finish</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters sit FIRST in the DOM so keyboard and screen-reader order reaches
          them before the rows they filter, but render to the right of the list.
          Same arrangement as the admin lists. */}
      <div className="flex flex-col gap-6 lg:flex-row-reverse lg:items-start">
        <aside className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
          <FilterBar orientation="vertical" facets={facets} searchPlaceholder="Search ref, erf, property…" />
        </aside>
        <div className="min-w-0 flex-1">
          {transfers.length === 0 ? (
            filtering ? (
              <EmptyState title="Nothing matches these filters" icon={<Building2 className="h-6 w-6" />}>
                Clear them to see the rest of your transfers.
              </EmptyState>
            ) : (
              <EmptyState
                title="No property transfers yet"
                icon={<Building2 className="h-6 w-6" />}
                action={
                  <Link href="/partner/transfers/new" className="text-[12.5px] font-bold text-action hover:underline">
                    Request one
                  </Link>
                }
              >
                A transfer groups every matter in one transaction, so the clearance, the change of ownership
                and the refund sit together instead of side by side in a list.
              </EmptyState>
            )
          ) : (
            <ul className="space-y-4">
              {transfers.map((t) => (
                <TransferCard
                  key={t.id}
                  transfer={t}
                  href={`/partner/transfers/${t.id}`}
                  progress={progressById.get(t.id)}
                />
              ))}
            </ul>
          )}

          <div className="mt-6">
            <Pagination page={filters.page} pageSize={filters.perPage} total={total} noun="transfers" />
          </div>
        </div>
      </div>
    </div>
  );
}
