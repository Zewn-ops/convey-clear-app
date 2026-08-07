/**
 * The tutorials shown on /training.
 *
 * Decision, Meeting 2 (2026-08-06): short (~2 minute) step-by-step videos in a
 * dedicated tab. Zewn's 2026-08-07 call: EMBED from Vimeo rather than host —
 * Supabase Pro's 100 GB is sized for scanned FICA documents, and video is a
 * different order of magnitude.
 *
 * ⚠️ ADDING A VIDEO IS A CODE EDIT TODAY. That is deliberate for now: there are
 * no recordings yet, and a staff-managed table plus CRUD screens is a real piece
 * of work to build for a list that may end up being five items that never
 * change. If ConveyClear want to add these themselves, say so and it becomes a
 * `training_videos` table with an admin editor.
 *
 * `vimeoId` is the numeric id from the share URL (vimeo.com/123456789 →
 * "123456789"). Unlisted videos also carry a hash (vimeo.com/123456789/abcdef)
 * — put that in `hash` or the embed 404s for anyone not signed in to Vimeo.
 *
 * `audience` decides who sees it: the portal serves three different jobs and a
 * client does not need the staff pipeline walkthrough.
 */
export type TrainingAudience = "staff" | "partner" | "client";

export interface TrainingVideo {
  slug: string;
  title: string;
  description: string;
  vimeoId: string;
  /** Required for unlisted videos — the second path segment of the share URL. */
  hash?: string;
  audience: TrainingAudience[];
  /** Roughly how long, shown so people can judge before clicking. */
  duration?: string;
}

export const TRAINING_VIDEOS: TrainingVideo[] = [
  // Recordings pending — the group agreed to produce these (Meeting 2 next
  // steps): creating a client contact card, and creating a property transfer.
  //
  // {
  //   slug: "create-contact-card",
  //   title: "Creating a client contact card",
  //   description: "Capturing a new client so their details are reusable across matters.",
  //   vimeoId: "123456789",
  //   hash: "abcdef1234",
  //   audience: ["staff", "partner"],
  //   duration: "2 min",
  // },
];

export function videosFor(audience: TrainingAudience): TrainingVideo[] {
  return TRAINING_VIDEOS.filter((v) => v.audience.includes(audience));
}

/**
 * Player URL for an embed.
 *
 * `dnt=1` asks Vimeo not to track the viewer — the portal handles FICA data and
 * there is no reason a training clip should set third-party cookies on a client.
 */
export function vimeoEmbedUrl(v: TrainingVideo): string {
  const base = `https://player.vimeo.com/video/${encodeURIComponent(v.vimeoId)}`;
  const params = new URLSearchParams({ dnt: "1", title: "0", byline: "0", portrait: "0" });
  if (v.hash) params.set("h", v.hash);
  return `${base}?${params.toString()}`;
}
