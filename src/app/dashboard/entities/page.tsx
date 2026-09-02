import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntityContext } from "@/lib/entity";
import { entityKind } from "@/lib/entity-display";
import { getSessionProfile } from "@/lib/auth";
import { signedDocUrls } from "@/lib/storage";
import ClientVault from "@/components/clients/ClientVault";
import DetailFields, { type DetailField } from "@/components/ui/DetailFields";
import { ficaFields } from "@/lib/fica";
import { vaultGated } from "@/lib/vault-gate";
import VaultPaywall from "@/components/dashboard/VaultPaywall";
import { clientDisplayName, type Client, type ClientDocument } from "@/types";
import { User, Building2, Landmark } from "lucide-react";

export const metadata = { title: "My entities — ConveyClear" };
export const dynamic = "force-dynamic";

/**
 * Everything a client is, in one place.
 *
 * A person acting for themselves AND for their company has two entities, each
 * its own `clients` row with its own FICA vault — which is correct, but until
 * now the only way to see either was to switch context and read a matter. The
 * documents in particular had no home of their own: they were reachable through
 * whichever matter happened to have asked for them.
 *
 * FICA is per ENTITY, not per person: a director's certified ID belongs to the
 * company's vault, and uploading it against their personal entity does not
 * satisfy the company's requirement. Showing the vaults side by side is what
 * makes that visible rather than something to be explained.
 */
export default async function EntitiesPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");

  const { memberships } = await getEntityContext();
  const supabase = await createClient();

  const ids = memberships.map((m) => m.clientId);
  if (ids.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          My entities
        </h1>
        <Card className="py-12 text-center">
          <User className="mx-auto mb-3 h-10 w-10 text-ink-3" />
          <p className="font-medium text-ink">No entities yet</p>
          <p className="mt-1 text-sm text-ink-3">
            An entity is created when ConveyClear opens your first matter.
          </p>
        </Card>
      </div>
    );
  }

  // Read through the caller's own RLS: client_members already limits this to
  // entities they belong to, so there is no way for this to return someone
  // else's record even though the ids come from the same place.
  const [{ data: clientRows }, { data: vaultRows }] = await Promise.all([
    supabase.from("clients").select("*").in("id", ids),
    supabase
      .from("client_documents")
      .select(
        "id, client_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, uploaded_by, created_at, status, expiry_date, verified, verified_at, verified_by, supersedes_id, notes"
      )
      .in("client_id", ids)
      // Superseded versions are history, not the vault (migration 032).
      .neq("status", "superseded")
      .order("created_at", { ascending: false }),
  ]);

  const clients = (clientRows as Client[] | null) ?? [];

  // This is the client portal, so the viewer is never staff — but the rule is
  // passed explicitly anyway, so a staff surface cannot acquire a paywall by
  // copying this page. Off entirely unless NEXT_PUBLIC_VAULT_PAYWALL=on.
  const gated = vaultGated({ isStaff: false });
  const docs = (vaultRows as ClientDocument[] | null) ?? [];

  // Signed server-side with the admin client, the same way the staff client page
  // does it — the URLs are short-lived and never reach the browser unsigned.
  const urls = docs.length ? await signedDocUrls(createAdminClient(), docs) : {};
  const docsFor = (clientId: string) =>
    docs
      .filter((d) => d.client_id === clientId)
      .map((d) => ({ ...d, url: d.storage_path ? urls[d.storage_path] : undefined }));

  const icon = (t: string) =>
    t === "trust" ? Landmark : t === "business" ? Building2 : User;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          My entities
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {clients.length === 1
            ? "Your details and documents."
            : `${clients.length} entities — each with its own details and FICA documents.`}
        </p>
      </div>

      {memberships.map((m) => {
        const c = clients.find((x) => x.id === m.clientId);
        if (!c) return null;
        const Icon = icon(c.entity_type);
        const fields = ficaFields(c.entity_type);
        const valueOf = (k: string) =>
          (c as unknown as Record<string, unknown>)[k] as string | null;

        // Municipal-portal credentials are the client's OWN council login and are
        // staff-only elsewhere in the app. They are the client's to see here, but
        // the password is still masked — a rendered password is a screenshot risk
        // for no benefit, since they cannot change it from this page.
        const toDetail = (f: (typeof fields)[number]): DetailField => ({
          label: f.label,
          value: f.key === "municipal_password" ? (valueOf(f.key) ? "••••••••" : null) : valueOf(f.key),
          wide: f.type === "textarea",
          required: f.required,
        });

        return (
          <div key={m.clientId} className="space-y-4">
            <Card accent="client">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-action-fill/10 p-2.5">
                    <Icon className="h-5 w-5 text-action" />
                  </span>
                  <div>
                    <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
                      {clientDisplayName(c)}
                    </h2>
                    <p className="text-[12.5px] text-ink-3">
                      {entityKind(m)}
                      {m.role === "owner" ? " · you are the owner" : " · member"}
                    </p>
                  </div>
                </div>
                {/* Editing goes through the people who are accountable for the
                    record. A client changing their own ID number after FICA
                    verification would silently invalidate the verification, so
                    this is deliberately a request rather than a form. */}
                <Link
                  href={`/dashboard/request?entity=${m.clientId}`}
                  className="shrink-0 text-xs font-medium text-action hover:underline"
                >
                  Request a change
                </Link>
              </div>

              <DetailFields
                primary={fields.filter((f) => f.required).map(toDetail)}
                extra={fields.filter((f) => !f.required).map(toDetail)}
              />
            </Card>

            {/* The paywall EXPLORATION (lib/vault-gate.ts). Off unless
                NEXT_PUBLIC_VAULT_PAYWALL=on, so this branch is unreachable in
                every deployment that has not deliberately turned it on. */}
            {gated ? (
              <VaultPaywall entityName={clientDisplayName(c)} />
            ) : (
              /* readOnly: the client-documents write routes are staff-only, so an
                 editable vault here would render buttons that 403. Reading is the
                 ask — one place to see what is on file per entity. */
              <ClientVault
                clientId={m.clientId}
                entityType={c.entity_type}
                docs={docsFor(m.clientId)}
                readOnly
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
