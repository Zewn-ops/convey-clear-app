"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { Pencil } from "lucide-react";
import type { MatterParty } from "@/types";

// Inline edit of a captured party's details after matter creation (staff only,
// shown on the manage view of PartiesCard). PATCHes /api/admin/parties.
export default function EditPartyButton({ party }: { party: MatterParty }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entity_type: party.entity_type,
    full_name: party.full_name ?? "",
    business_name: party.business_name ?? "",
    registration_no: party.registration_no ?? "",
    id_number: party.id_number ?? "",
    email: party.email ?? "",
    cell: party.cell ?? "",
    physical_address: party.physical_address ?? "",
    contact_name: party.contact_name ?? "",
    contact_email: party.contact_email ?? "",
    contact_cell: party.contact_cell ?? "",
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const isPerson = form.entity_type === "natural_person";

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/parties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party_id: party.id, ...form }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not update party");
      toast.success("Party updated");
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-[#1B2E6B] hover:underline"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit details
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Entity type"
          value={form.entity_type}
          onChange={(e) => set({ entity_type: e.target.value as MatterParty["entity_type"] })}
          options={[
            { value: "natural_person", label: "Natural Person" },
            { value: "business", label: "Business" },
            { value: "trust", label: "Trust" },
          ]}
        />
        {isPerson ? (
          <Input label="Full name" value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
        ) : (
          <Input label="Business / Trust name" value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} />
        )}
        {!isPerson && (
          <Input label="Registration / IT no." value={form.registration_no} onChange={(e) => set({ registration_no: e.target.value })} />
        )}
        <Input label="ID number" value={form.id_number} onChange={(e) => set({ id_number: e.target.value })} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
        <Input label="Cell" value={form.cell} onChange={(e) => set({ cell: e.target.value })} />
      </div>
      <Input label="Physical address" value={form.physical_address} onChange={(e) => set({ physical_address: e.target.value })} />
      {!isPerson && (
        <div className="rounded-lg border border-gray-100 bg-white p-3 space-y-3">
          <p className="text-xs font-medium text-gray-600">Contact person</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
            <Input label="Email" type="email" value={form.contact_email} onChange={(e) => set({ contact_email: e.target.value })} />
            <Input label="Cell" value={form.contact_cell} onChange={(e) => set({ contact_cell: e.target.value })} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} loading={saving}>Save changes</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
