import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase Storage — private bucket for matter documents (replaces Google Drive).
// Path convention: "<matterId>/<uuid>-<sanitized filename>" — the leading matter
// UUID is what the storage RLS policy (migration 015) scopes reads against.
export const MATTER_DOCS_BUCKET = "matter-documents";

export function matterObjectPath(matterId: string, fileName: string): string {
  const safe = (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `${matterId}/${randomUUID()}-${safe}`;
}

// Short-lived signed download URL (default 5 min). Returns null if it can't sign.
export async function signedDownloadUrl(
  client: SupabaseClient,
  path: string,
  expiresIn = 300
): Promise<string | null> {
  const { data } = await client.storage.from(MATTER_DOCS_BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

// Batch-sign many object paths → map of path → signed URL (for list rendering).
export async function signedDownloadUrls(
  client: SupabaseClient,
  paths: string[],
  expiresIn = 300
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data } = await client.storage.from(MATTER_DOCS_BUCKET).createSignedUrls(unique, expiresIn);
  const out: Record<string, string> = {};
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  }
  return out;
}
