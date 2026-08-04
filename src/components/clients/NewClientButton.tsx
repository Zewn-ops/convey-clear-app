"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import Card from "@/components/ui/Card";

// "New client" — create a standalone client entity from the Clients tab (no
// matter needed). On success, jump to the new client's page where staff can
// provision a login. Staff-only; the page it sits on is already staff-gated.
export default function NewClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entity_type: "natural_person" as "natural_person" | "business" | "trust",
    full_name: "",
    business_name: "",
    primary_email: "",
    primary_cell: "",
  });

  const isPerson = form.entity_type === "natural_person";
  const input = "rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = isPerson ? form.full_name.trim() : form.business_name.trim();
    if (!name) return toast.error(isPerson ? "A full name is required" : "A business/trust name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not create the client");
      toast.success("Client created");
      router.push(`/admin/clients/${json.client_id}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 transition-colors shrink-0"
      >
        <Plus className="h-4 w-4" /> New client
      </button>
    );
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs text-ink-3">Type</label>
          <select
            value={form.entity_type}
            onChange={(e) => setForm({ ...form, entity_type: e.target.value as typeof form.entity_type })}
            className={`${input} w-full mt-1`}
          >
            <option value="natural_person">Individual</option>
            <option value="business">Business</option>
            <option value="trust">Trust</option>
          </select>
        </div>
        {isPerson ? (
          <div className="sm:col-span-2">
            <label className="text-xs text-ink-3">Full name *</label>
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className="text-xs text-ink-3">{form.entity_type === "trust" ? "Trust" : "Business"} name *</label>
            <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
        )}
        <div>
          <label className="text-xs text-ink-3">Email</label>
          <input type="email" value={form.primary_email} onChange={(e) => setForm({ ...form, primary_email: e.target.value })} className={`${input} w-full mt-1`} placeholder="Needed to create a login later" />
        </div>
        <div>
          <label className="text-xs text-ink-3">Cell</label>
          <input value={form.primary_cell} onChange={(e) => setForm({ ...form, primary_cell: e.target.value })} className={`${input} w-full mt-1`} />
        </div>
        <div className="sm:col-span-2 flex gap-2 pt-1">
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50">
            {saving ? "Creating…" : "Create client"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-ink-3 hover:text-ink">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
