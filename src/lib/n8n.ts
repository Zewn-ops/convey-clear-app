// Thin client for portal → n8n calls. Kept best-effort: an n8n outage must never
// break a portal action, so callers await this but it swallows all errors and
// just returns the drive_folder_id (or null).

const N8N_URL = process.env.N8N_WEBHOOK_URL ?? "https://n8n.conveyclear.co.za";

// #6 portal-intake: ask n8n to create the matter's Google Drive folder and write
// matters.drive_folder_id back (n8n has direct Postgres access). Used when a
// matter is originated in the portal (no Pipedrive stage-53 intake to make the
// folder), so subsequent FICA uploads have somewhere to land.
export async function firePortalIntake(
  matterId: string,
  title: string
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${N8N_URL}/webhook/portal-intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId, title }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { drive_folder_id?: string } | null;
    return j?.drive_folder_id ?? null;
  } catch {
    return null;
  }
}
