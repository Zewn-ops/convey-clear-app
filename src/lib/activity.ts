import type { SupabaseClient } from "@supabase/supabase-js";

// The ONLY way the app should write an activity-feed row (migration 036).
//
// WHY THIS EXISTS
//   The feed carried genuine duplicate rows in production — the same note twice
//   1.1s apart, the same reused document twice 0.7s apart, "not available" seven
//   times. Two separate causes:
//
//   1. A server action takes 1–2s and, with no pending state on the control,
//      looks like it did nothing. The user clicks again. Both requests race, and
//      a check-then-insert dedupe LOSES that race: both read "nothing there yet"
//      before either writes. Fixed here — the RPC takes a transaction-scoped
//      advisory lock on (matter, type, body) FIRST, so the second request waits
//      for the first to commit and then sees its row. (The disabled-in-flight
//      control — components/ui/SubmitButton — stops the honest double-click; this
//      stops the determined one, and it also covers non-UI writers.)
//
//   2. Two DIFFERENT controls writing the same thing (see the transfer-document
//      attach route) — not a race at all, and no client-side guard can catch it.
//
// WHY A WINDOW AND NOT A UNIQUE INDEX
//   "The same body twice" is only wrong when it happens within a few seconds. A
//   month later it is a legitimate repeat note, so the rule is inherently
//   time-boxed — and a time-boxed rule is not expressible as a unique index
//   (date_trunc over timestamptz is STABLE, not IMMUTABLE, so it cannot be
//   indexed). Hence an advisory lock around a windowed check.
//
// The guard is deliberately narrow: SAME matter, SAME activity_type, SAME body,
// inside the window. Two different notes posted a second apart are both kept.
//
// Errors are logged, never thrown: a lost feed entry must not fail the action it
// describes. But they are NOT swallowed — activity_type carries a CHECK
// constraint, and that is exactly how two activity types went missing for weeks
// until migration 035 legalised them.

/** How close together two identical entries have to be to count as a double-write. */
const DEFAULT_WINDOW_SECONDS = 5;

export interface ActivityResult {
  /** The row id — the EXISTING one when deduped. Null only when the write failed. */
  id: string | null;
  /**
   * True when an identical entry already existed, so nothing was written.
   *
   * Callers should treat this as "this action already happened" and skip whatever
   * they do BESIDES the feed row — above all the notification fan-out. A swallowed
   * duplicate row that still sends a second push is only half the bug fixed.
   */
  deduped: boolean;
}

interface ActivityRow {
  activity_id: string | null;
  deduped: boolean;
}

/** Both RPCs return a one-row table; PostgREST hands it back as an array. */
function firstRow(data: unknown): ActivityRow | null {
  if (Array.isArray(data)) return (data[0] as ActivityRow) ?? null;
  return (data as ActivityRow) ?? null;
}

/**
 * True when the RPC itself does not exist — i.e. this code is running against a
 * database where migration 036 has not been applied yet.
 *
 * PostgREST answers a missing function with PGRST202; Postgres with 42883.
 */
function rpcMissing(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    Boolean(error.message?.includes("Could not find the function"))
  );
}

/**
 * Write the row the old way, un-deduplicated.
 *
 * This exists ONLY to survive the window where the code is deployed and migration
 * 036 is not yet applied. Without it, EVERY rpc() call 404s and the activity feed
 * goes silent app-wide — the same class of failure as the matters-search `.or()`
 * (029) and the middleware's must_change_password select (031), and one that
 * neither tsc nor `next build` can see. The duplicate-post bug simply persists
 * until the migration lands, which is exactly the status quo and no worse.
 */
async function insertDirect(
  db: SupabaseClient,
  table: "matter_activities" | "transfer_activities",
  row: Record<string, unknown>,
  context: string
): Promise<ActivityResult> {
  console.warn(
    `[activity] ${context}: log RPC not found — migration 036 is not applied. ` +
      `Falling back to a direct insert (no de-duplication).`
  );
  const { data, error } = await db.from(table).insert(row).select("id").single();
  if (error) {
    console.error(`[activity] ${context} fallback insert failed: ${error.message}`);
    return { id: null, deduped: false };
  }
  return { id: (data as { id: string }).id, deduped: false };
}

export interface MatterActivityInput {
  matterId: string;
  activityType: string;
  body: string;
  authorId?: string | null;
  authorLabel?: string | null;
  /** Override the de-duplication window. 0 disables the guard entirely. */
  windowSeconds?: number;
}

/**
 * Append to a matter's activity feed, ignoring an identical entry written in the
 * last few seconds.
 *
 * Pass whichever client the caller already uses: the RPC is SECURITY INVOKER, so
 * a user-scoped client stays subject to RLS exactly as a direct insert was, and a
 * service-role client still bypasses it.
 */
export async function logMatterActivity(
  db: SupabaseClient,
  input: MatterActivityInput
): Promise<ActivityResult> {
  const { data, error } = await db.rpc("log_matter_activity", {
    p_matter_id: input.matterId,
    p_activity_type: input.activityType,
    p_body: input.body,
    p_author_id: input.authorId ?? null,
    p_author_label: input.authorLabel ?? null,
    p_window_seconds: input.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
  });
  if (error) {
    if (rpcMissing(error)) {
      return insertDirect(
        db,
        "matter_activities",
        {
          matter_id: input.matterId,
          author_id: input.authorId ?? null,
          author_label: input.authorLabel ?? null,
          activity_type: input.activityType,
          body: input.body,
        },
        `matter ${input.matterId} (${input.activityType})`
      );
    }
    console.error(
      `[activity] matter ${input.matterId} (${input.activityType}) not logged: ${error.message}`
    );
    return { id: null, deduped: false };
  }
  const row = firstRow(data);
  return { id: row?.activity_id ?? null, deduped: Boolean(row?.deduped) };
}

export interface TransferActivityInput {
  transferId: string;
  activityType: string;
  body: string;
  authorId?: string | null;
  authorLabel?: string | null;
  windowSeconds?: number;
}

/** The same guard for a property transfer's feed (migration 035's table). */
export async function logTransferActivity(
  db: SupabaseClient,
  input: TransferActivityInput
): Promise<ActivityResult> {
  const { data, error } = await db.rpc("log_transfer_activity", {
    p_transfer_id: input.transferId,
    p_activity_type: input.activityType,
    p_body: input.body,
    p_author_id: input.authorId ?? null,
    p_author_label: input.authorLabel ?? null,
    p_window_seconds: input.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
  });
  if (error) {
    if (rpcMissing(error)) {
      return insertDirect(
        db,
        "transfer_activities",
        {
          transfer_id: input.transferId,
          author_id: input.authorId ?? null,
          author_label: input.authorLabel ?? null,
          activity_type: input.activityType,
          body: input.body,
        },
        `transfer ${input.transferId} (${input.activityType})`
      );
    }
    console.error(
      `[activity] transfer ${input.transferId} (${input.activityType}) not logged: ${error.message}`
    );
    return { id: null, deduped: false };
  }
  const row = firstRow(data);
  return { id: row?.activity_id ?? null, deduped: Boolean(row?.deduped) };
}
