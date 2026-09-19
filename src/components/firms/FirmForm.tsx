"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  PARTNER_TYPES,
  PARTNER_TYPE_LABELS,
  type Firm,
  type PartnerType,
} from "@/types";
import { isValidFirmCode, suggestFirmCode } from "@/lib/firm-reference";

// Create OR edit a partner firm. `existing` switches it to edit mode (PATCH
// instead of POST) and pre-fills every field.
export default function FirmForm({ existing }: { existing?: Firm }) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(existing?.abbreviation ?? "");
  // 100 — the code is now the prefix on every transfer reference this firm
  // issues, so a NEW firm should not be able to leave it blank by inattention.
  // Suggested from the name while the field is untouched; an EXISTING firm is
  // never overwritten, because its code is already embedded in references that
  // have been issued and changing it does not re-qualify them.
  const [codeTouched, setCodeTouched] = useState(Boolean(existing?.abbreviation));
  const [type, setType] = useState<PartnerType>(existing?.partner_type ?? "law_firm");
  const [email, setEmail] = useState(existing?.primary_email ?? "");
  const [cell, setCell] = useState(existing?.primary_cell ?? "");
  const [address, setAddress] = useState(existing?.physical_address ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [loading, setLoading] = useState(false);

  // Shown in the field until someone types their own. Not written anywhere
  // until save, so a firm created without touching it still gets a real code.
  const code = codeTouched ? abbreviation : suggestFirmCode(name);

  const submit = async () => {
    if (!name.trim()) return toast.error("A firm name is required");
    // The API and the CHECK both refuse this too; catching it here is what
    // turns a rejected save into a correctable field.
    if (code.trim() && !isValidFirmCode(code)) {
      return toast.error("The firm code must be 2 to 6 letters or digits — for example BSI.");
    }

    setLoading(true);
    const res = await fetch("/api/admin/partners", {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: existing?.id,
        name,
        abbreviation: code,
        partner_type: type,
        primary_email: email,
        primary_cell: cell,
        physical_address: address,
        notes,
        ...(existing ? { active } : {}),
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not save the firm");

    toast.success(existing ? "Firm updated" : "Firm created");
    router.push(`/admin/firms/${json.partner.id}`);
    router.refresh();
  };

  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Firm name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bert Smith Inc"
        />
        <Input
          label="Firm code"
          value={code}
          onChange={(e) => {
            setCodeTouched(true);
            setAbbreviation(e.target.value.toUpperCase());
          }}
          placeholder="BSI"
          maxLength={6}
          hint="2–6 letters or digits, unique to this firm. It prefixes every transfer reference they send (BSI_5600), which is what lets two firms both run a file numbered 5600."
        />
        <Select
          label="Firm type"
          value={type}
          onChange={(e) => setType(e.target.value as PartnerType)}
          options={PARTNER_TYPES.map((t) => ({ value: t, label: PARTNER_TYPE_LABELS[t] }))}
        />
        <Input
          label="Primary email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@firm.co.za"
        />
        <Input
          label="Primary cell"
          value={cell}
          onChange={(e) => setCell(e.target.value)}
          placeholder="082 000 0000"
        />
        <Input
          label="Physical address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Church Street, Pretoria"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="firm-notes" className="text-sm font-medium text-ink-2">Notes</label>
        <textarea
          id="firm-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent"
        />
      </div>

      {existing && (
        <div className="pt-2 border-t border-line">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line text-action focus:ring-action"
            />
            <span>
              <span className="text-sm font-medium text-ink-2">Active</span>
              <p className="text-xs text-ink-3 mt-0.5">
                Deactivating hides the firm from the pickers on new matters and transfers. Existing
                matters, users and transfers keep their link to it — firms are never deleted.
              </p>
            </span>
          </label>
        </div>
      )}

      <Button onClick={submit} loading={loading} size="lg">
        {existing ? "Save changes" : "Create firm"}
      </Button>
    </Card>
  );
}
