"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Pencil, ShieldAlert } from "lucide-react";
import Card from "@/components/ui/Card";
import DetailFields, { type DetailField } from "@/components/ui/DetailFields";
import { ficaFields } from "@/lib/fica";
import type { Client } from "@/types";

const ENTITY_OPTIONS = [
  { value: "natural_person", label: "Individual" },
  { value: "business", label: "Business" },
  { value: "trust", label: "Trust" },
];

// The client profile's Details card — read-only until you click Edit.
//
// The field set comes from ficaFields(), the same definition the in-place FICA
// form on a matter uses, so the two can't drift into asking for different things.
// Changing the entity type re-renders the form immediately, because it decides
// which fields exist AND which documents the vault will require.
export default function ClientDetailsForm({ client }: { client: Client }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entity, setEntity] = useState(client.entity_type as string);

  const seed = (e: string) => {
    const out: Record<string, string> = {};
    for (const f of ficaFields(e)) {
      const v = (client as unknown as Record<string, unknown>)[f.key];
      out[f.key] = v == null ? "" : String(v);
    }
    if (e === "natural_person") out.id_number = client.id_number ?? "";
    return out;
  };

  const [form, setForm] = useState<Record<string, string>>(() => seed(client.entity_type as string));

  const fields = ficaFields(entity);
  const showIdNumber = entity === "natural_person";

  function cancel() {
    setEntity(client.entity_type as string);
    setForm(seed(client.entity_type as string));
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entity, details: form }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not save");
      toast.success("Client updated");
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------------ read -- */
  if (!editing) {
    const valueOf = (key: string) =>
      key === "municipal_password"
        ? client.municipal_password
          ? "••••••••"
          : null
        : ((client as unknown as Record<string, unknown>)[key] as string | null);

    const toDetail = (f: (typeof fields)[number]): DetailField => ({
      label: f.label,
      value: valueOf(f.key),
      wide: f.type === "textarea",
      required: f.required,
    });

    // Who they are and how to reach them stays open. Everything else — address,
    // industry, designation, the council credentials — sits behind the toggle,
    // INCLUDING when blank: the previous card dropped empty optional fields
    // entirely, so a half-captured record was indistinguishable from a complete
    // one. Now the toggle counts what is still missing.
    const primary = fields.filter((f) => f.required).map(toDetail);
    const extra = fields.filter((f) => !f.required).map(toDetail);

    // ID number is a required field for a person and already in `fields`; for a
    // business or trust it is not asked for at all, so nothing is added here.
    if (showIdNumber && !fields.some((f) => f.key === "id_number")) {
      primary.unshift({ label: "ID number", value: client.id_number, required: true });
    }

    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Details</h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>

        <DetailFields primary={primary} extra={extra} />
      </Card>
    );
  }

  /* ------------------------------------------------------------------ edit -- */
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-ink">Edit details</h2>
        <button type="button" onClick={cancel} className="text-xs text-ink-3 hover:text-ink-2">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-ink-3 sm:col-span-2">
          Client type
          <select
            value={entity}
            onChange={(e) => {
              // Keep whatever the user has already typed for fields the new type
              // still has; seed the rest from the record.
              const next = e.target.value;
              setForm((cur) => ({ ...seed(next), ...cur }));
              setEntity(next);
            }}
            className="mt-1 w-full rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
          >
            {ENTITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-ink-3">
            Changes which documents the FICA vault asks for.
          </span>
        </label>

        {showIdNumber && (
          <label className="text-xs font-medium text-ink-3">
            <span className="flex items-center gap-1">
              ID number <span className="text-action">*</span>
            </span>
            <input
              value={form.id_number ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, id_number: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
            />
          </label>
        )}

        {fields.map((f) => (
          <label
            key={f.key}
            className={
              f.type === "textarea"
                ? "text-xs font-medium text-ink-3 sm:col-span-2"
                : "text-xs font-medium text-ink-3"
            }
          >
            <span className="flex items-center gap-1">
              {f.label}
              {f.required && <span className="text-action">*</span>}
              {f.sensitive && <ShieldAlert className="h-3 w-3 text-amber-500" aria-label="Sensitive" />}
            </span>
            {f.type === "textarea" ? (
              <textarea
                rows={2}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder={f.hint}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              />
            ) : (
              <input
                type={f.key === "municipal_password" ? "password" : (f.type ?? "text")}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder={f.hint}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={cancel} className="px-2 text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:bg-action-fill/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Card>
  );
}

