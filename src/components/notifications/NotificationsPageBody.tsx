import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import FilterBar from "@/components/ui/FilterBar";
import NotificationList, { type NotificationRow } from "./NotificationList";

/**
 * The durable notifications page — one implementation, three portals.
 *
 * §5.1, Zewn 2026-08-31: "we need to make sure the new notification and chat
 * features are properly fleshed out and the same accross the board. currently
 * the notifications sidebar is different from the notifications tab."
 *
 * 🔴 THE DRIFT WAS STRUCTURAL, NOT COSMETIC. The bell renders in all three
 * portals (`/admin`, `/partner`, `/dashboard` layouts each mount it), but the
 * PAGE existed only under /admin. `NotificationList` has always built its own
 * tab links as `${base}/notifications` for whatever base it is handed — so the
 * shared component already assumed a page per portal, and two of the three were
 * never built. Following those links from a partner session would have 404'd.
 *
 * So this is the page body, extracted rather than copied. Three thin routes
 * mount it with their own auth gate and their own `base`; there is one place to
 * change, which is what "the same across the board" has to mean if it is to
 * stay true. Copying it twice is how the admin and partner matters blocks ended
 * up different shapes one commit apart.
 *
 * The bell is a transient popup capped at 20 that marks everything read the
 * moment it opens — fine for "something happened", useless for "what was I told
 * last week". This page deliberately does NOT auto-mark-read: marking is an
 * explicit act, so opening the list to look something up cannot silently
 * destroy the unread state someone is using as a to-do list.
 *
 * Read through the caller's own client — RLS scopes notifications to their
 * owner, so the page cannot show one person another's.
 */

/** The `type` values migration 020 defines. */
const NOTIFICATION_TYPES = [
  { value: "enquiry", label: "Enquiries" },
  { value: "enquiry_reply", label: "Enquiry replies" },
  { value: "referral", label: "Referrals" },
  { value: "document", label: "Documents" },
  { value: "status", label: "Status changes" },
  { value: "phase", label: "Phase changes" },
] as const;

const PAGE_SIZE = 100;

export default async function NotificationsPageBody({
  userId,
  base,
  searchParams,
}: {
  userId: string;
  /** The role's path root — "/admin" | "/partner" | "/dashboard". */
  base: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams?.filter;
  const filter = (Array.isArray(raw) ? raw[0] : raw) === "unread" ? "unread" : "all";

  // Type facet. The vocabulary is fixed by migration 020's `type` column, so it
  // is listed rather than read from the rows — a facet that only offers what you
  // already have cannot narrow to "none of these", which is the useful answer
  // when you are checking whether anything arrived at all.
  const rawType = searchParams?.type;
  const typeParam = Array.isArray(rawType) ? rawType[0] : rawType;
  const type = NOTIFICATION_TYPES.some((t) => t.value === typeParam) ? typeParam! : "";

  // FilterBar always renders a search box, so the page has to mean it — an input
  // that silently does nothing is worse than no input.
  const rawQ = searchParams?.q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ ?? "").trim().slice(0, 100);

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, type, title, body, link, matter_id, enquiry_id, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (filter === "unread") query = query.is("read_at", null);
  if (type) query = query.eq("type", type);
  if (q) {
    // Strip PostgREST's or-syntax characters before interpolating free text.
    const safe = q.replace(/[,()%*]/g, " ").trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  const items = (data as NotificationRow[] | null) ?? [];
  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          Notifications
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {filter === "unread"
            ? `${items.length} unread`
            : `Your last ${Math.min(items.length, PAGE_SIZE)} notification${items.length === 1 ? "" : "s"}`}
          {filter === "all" && unreadCount > 0 && ` · ${unreadCount} unread`}
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row-reverse lg:items-start">
        <aside className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
          <FilterBar
            orientation="vertical"
            searchPlaceholder="Search notifications…"
            facets={[
              {
                key: "type",
                label: "Kind",
                defaultValue: "",
                options: [
                  { value: "", label: "Anything" },
                  ...NOTIFICATION_TYPES.map((t) => ({ value: t.value, label: t.label })),
                ],
              },
            ]}
          />
        </aside>
        <div className="min-w-0 flex-1">
          {error ? (
            <Card className="border-2 !border-red-500">
              <h2 className="text-sm font-semibold text-red-700">
                Notifications could not be loaded
              </h2>
              <p className="mt-2 font-mono text-xs text-ink-3">{error.message}</p>
            </Card>
          ) : (
            <NotificationList items={items} filter={filter} base={base} />
          )}
        </div>
      </div>
    </div>
  );
}
