import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase Storage — private bucket for matter documents (replaces Google Drive).
// Path convention: "<matterId>/<uuid>-<sanitized filename>" — the leading matter
// UUID is what the storage RLS policy (migration 015) scopes reads against.
export const MATTER_DOCS_BUCKET = "matter-documents";
// Reusable per-client FICA docs (migration 025). Path "<clientId>/<uuid>-<file>";
// the leading client UUID is what the storage RLS scopes reads against.
export const CLIENT_DOCS_BUCKET = "client-documents";
// Transfer-level docs (migration 034) — one deed search / transfer letter /
// clearance figure for the whole transaction, reused by each matter inside it.
// Path "<transferId>/<uuid>-<file>"; scoped by can_access_transfer.
export const TRANSFER_DOCS_BUCKET = "transfer-documents";
// Firm-level documents (migration 073) — what the councils ask OF THE FIRM
// once, rather than per transaction: bank confirmation letter, fidelity fund
// certificate, PoA (attorneys), PoA (address), SLA, POPIA. Path
// "<firmId>/<uuid>-<file>"; the leading firm UUID is what the storage RLS
// scopes reads against, exactly as the client vault does.
export const FIRM_DOCS_BUCKET = "firm-documents";

function safeName(fileName: string): string {
  return (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export function matterObjectPath(matterId: string, fileName: string): string {
  return `${matterId}/${randomUUID()}-${safeName(fileName)}`;
}

export function clientObjectPath(clientId: string, fileName: string): string {
  return `${clientId}/${randomUUID()}-${safeName(fileName)}`;
}

export function transferObjectPath(transferId: string, fileName: string): string {
  return `${transferId}/${randomUUID()}-${safeName(fileName)}`;
}

export function firmObjectPath(firmId: string, fileName: string): string {
  return `${firmId}/${randomUUID()}-${safeName(fileName)}`;
}

// Short-lived signed download URL (default 5 min). Returns null if it can't sign.
export async function signedDownloadUrl(
  client: SupabaseClient,
  path: string,
  expiresIn = 300,
  bucket: string = MATTER_DOCS_BUCKET
): Promise<string | null> {
  const { data } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

// Batch-sign many object paths in ONE bucket → map of path → signed URL.
export async function signedDownloadUrls(
  client: SupabaseClient,
  paths: string[],
  expiresIn = 300,
  bucket: string = MATTER_DOCS_BUCKET
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data } = await client.storage.from(bucket).createSignedUrls(unique, expiresIn);
  const out: Record<string, string> = {};
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  }
  return out;
}

// Bucket-aware batch signing for a mixed document list: a matter's docs can now
// include REUSED client-vault docs (storage_bucket 'client-documents') alongside
// normal matter docs. Groups by bucket, signs each, returns one path → URL map.
export async function signedDocUrls(
  client: SupabaseClient,
  docs: { storage_bucket?: string | null; storage_path?: string | null }[],
  expiresIn = 300
): Promise<Record<string, string>> {
  const byBucket: Record<string, string[]> = {};
  for (const d of docs) {
    if (!d.storage_path) continue;
    const bucket = d.storage_bucket || MATTER_DOCS_BUCKET;
    (byBucket[bucket] ??= []).push(d.storage_path);
  }
  const out: Record<string, string> = {};
  for (const [bucket, paths] of Object.entries(byBucket)) {
    Object.assign(out, await signedDownloadUrls(client, paths, expiresIn, bucket));
  }
  return out;
}
