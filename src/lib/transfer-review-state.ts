import type { StatusTone } from "@/components/ui/StatusPill";
import { TRANSFER_STATUS_LABELS, type TransferStatus } from "@/types";

/**
 * What a DRAFT transfer's request says about it — and therefore what its chip
 * should read.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 *
 * Since 083 a firm's request builds its property transfer immediately, in
 * `draft`, so the firm can start uploading before ConveyClear has agreed to work
 * it. Reviewing the REQUEST then decides what happens: approve flips the
 * transfer to `open`, "return" asks the firm for a correction (089), and
 * "reject" ends it.
 *
 * Only the first of those three reaches the transfer. A rejected or returned
 * request leaves its transfer sitting in the firm's list still reading "Draft —
 * awaiting approval", which by then is false — nobody is waiting, or the person
 * waiting is the attorney.
 *
 * Zewn, 2026-09-11: *"if a transfer is declined we have the draft - waiting for
 * approval change to red and display 'Declined' … dont remove or hide the prop
 * trf … declined is like a temporary state until the attorneys can fix what they
 * need to fix."*
 *
 * ── 🔴 DERIVED FROM THE REQUEST. NO NEW TRANSFER STATUS. ────────────────────
 *
 * The thing that was rejected is the request, and the request already stores
 * both the decision and the reason. Adding a `rejected` value to
 * property_transfers.status would mean editing a CHECK constraint, which is
 * exactly what broke submission on 089 and send-back on 090 — twice in one
 * migration series. A derived chip cannot break a write path.
 *
 * ⚠️ AND THE STORED VALUE STAYS `declined`. "Reject" replaces "decline" as the
 * product's word everywhere it faces a person; the column, the status value and
 * `decline_reason` keep their names. The vocabulary is a label map.
 *
 * ── Why `changes_requested` is here too ─────────────────────────────────────
 *
 * Zewn's "temporary until the attorneys fix it" is a better description of 089's
 * `changes_requested` than of `declined`: a returned request is alive, the firm
 * edits it in place and resubmits, and only that path has a route back. A
 * rejected one is terminal — the firm would have to start again.
 *
 * They are two different mechanisms and both leave a stale "awaiting approval"
 * chip, so both are answered here rather than collapsed into one. The distinction
 * is the useful part: one chip says "we are not doing this", the other says "fix
 * this and send it back", and only the second is worth an attorney's next hour.
 */
export type TransferReviewState = "rejected" | "changes_requested";

export interface TransferReview {
  state: TransferReviewState;
  /** Stored in `decline_reason`, shown as the reason for either outcome. */
  reason: string | null;
}

/** The columns a page must select from `transfer_requests` for the below. */
export const TRANSFER_REVIEW_SELECT = "transfer_id, status, decline_reason";

interface ReviewSelectRow {
  transfer_id: string | null;
  status: string | null;
  decline_reason: string | null;
}

/**
 * Index one query's worth of request rows by the transfer they created.
 *
 * Takes rows rather than a client, like transferProgressById, so the caller owns
 * the query and its RLS context. Requests that ended in any other state —
 * approved, pending, still a draft — are absent from the map: the transfer's own
 * status is already right for those.
 */
export function transferReviewById(rows: unknown): Map<string, TransferReview> {
  const out = new Map<string, TransferReview>();
  for (const raw of (rows as ReviewSelectRow[] | null) ?? []) {
    if (!raw.transfer_id) continue;
    const state: TransferReviewState | null =
      raw.status === "declined"
        ? "rejected"
        : raw.status === "changes_requested"
          ? "changes_requested"
          : null;
    if (!state) continue;
    out.set(raw.transfer_id, { state, reason: raw.decline_reason?.trim() || null });
  }
  return out;
}

/**
 * The chip for a transfer, given what its request decided.
 *
 * The review only speaks for a DRAFT. Once a transfer is open, registered or
 * cancelled its own status is the truth — a transfer that was returned for
 * correction, fixed and approved must not keep wearing the correction chip.
 */
export function transferChip(
  status: string,
  review?: TransferReview | null
): { label: string; tone: StatusTone; variant: BadgeVariant } {
  if (status === "draft" && review) {
    return review.state === "rejected"
      ? { label: "Rejected", tone: "danger", variant: "danger" }
      : { label: "Needs your correction", tone: "required", variant: "warning" };
  }
  const tone = TRANSFER_STATUS_TONE[status] ?? "neutral";
  return {
    label: TRANSFER_STATUS_LABELS[status as TransferStatus] ?? status,
    tone,
    variant: BADGE_FOR_TONE[tone],
  };
}

/**
 * The admin pages draw chips with `Badge`, the portal with `StatusPill`, and the
 * two have different vocabularies. Both are returned above rather than left to
 * each caller to translate — the translation is where a rejected transfer would
 * come out red on one page and amber on another.
 */
type BadgeVariant = "info" | "success" | "danger" | "warning" | "gray";

const BADGE_FOR_TONE: Record<StatusTone, BadgeVariant> = {
  required: "warning",
  waiting: "warning",
  ok: "success",
  action: "info",
  danger: "danger",
  neutral: "gray",
};

/**
 * Tone per transfer status.
 *
 * Amber for draft, not the default grey: "Draft — awaiting approval" is a
 * transfer waiting on somebody, and a neutral pill read as a finished state on a
 * card that is anything but. Zewn, 2026-09-02: "make the bubble yellow to
 * indicate it more visually".
 *
 * Moved out of TransferCard so the cards and the detail pages cannot disagree
 * about what colour a status is — they already did, and a rejected transfer
 * showing red on the list and amber on its own page would be the same bug with
 * higher stakes.
 */
export const TRANSFER_STATUS_TONE: Record<string, StatusTone> = {
  draft: "waiting",
  open: "action",
  registered: "ok",
  cancelled: "danger",
  on_hold: "waiting",
  archived: "neutral",
};

/**
 * The coloured edge down the side of a card, from the same chip decision.
 *
 * ConveyClear Services, 2026-09-17: more visibility on "not taken on". A chip
 * only reads once you are already looking at the card; an edge reads while you
 * are scrolling past it, which is the actual complaint.
 *
 * Derived from transferChip rather than from `status` again, so the edge and
 * the chip can never disagree about what a transfer is — the pattern this file
 * exists to enforce (a rejected transfer came out red on one page and amber on
 * another when each caller decided for itself).
 *
 * Empty string for everything else. An edge on every card is wallpaper, and
 * then the two that mean something stop meaning anything.
 */
export function reviewEdgeClass(status: string, review?: TransferReview | null): string {
  const { tone } = transferChip(status, review);
  if (status !== "draft") return "";
  if (tone === "danger") return "border-l-4 border-danger-fill";
  if (tone === "required" || tone === "waiting") return "border-l-4 border-waiting-fill";
  return "";
}
