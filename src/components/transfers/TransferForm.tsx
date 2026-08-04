"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SearchSelect from "@/components/ui/SearchSelect";
import {
  TRANSFER_STATUS_LABELS,
  type PropertyTransfer,
  type TransferStatus,
} from "@/types";

const MUNI = [
  { value: "", label: "— None —" },
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];
const STATUSES: TransferStatus[] = ["open", "registered", "cancelled", "on_hold"];

export interface TransferFormOption {
  id: string;
  label: string;
}

// Create OR edit a property transfer. `existing` switches it to edit mode
// (PATCH instead of POST) and pre-fills every field.
export default function TransferForm({
  firms,
  clients,
  existing,
}: {
  firms: TransferFormOption[];
  clients: TransferFormOption[];
  existing?: PropertyTransfer;
}) {
  const router = useRouter();
  const [reference, setReference] = useState(existing?.reference ?? "");
  const [property, setProperty] = useState(existing?.property_description ?? "");
  const [municipality, setMunicipality] = useState(existing?.municipality ?? "");
  const [status, setStatus] = useState<TransferStatus>(existing?.status ?? "open");
  const [attorneyId, setAttorneyId] = useState(existing?.business_partner_id ?? "");
  const [agentId, setAgentId] = useState(existing?.estate_agent_partner_id ?? "");
  const [sellerId, setSellerId] = useState(existing?.seller_client_id ?? "");
  const [buyerId, setBuyerId] = useState(existing?.buyer_client_id ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [loading, setLoading] = useState(false);

  // Searchable, not raw <select>: these carry every firm and every client in the
  // database, and a dropdown of 300 clients is a scroll, not a choice (Jukka).
  const firmOptions = firms.map((f) => ({ value: f.id, label: f.label }));
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.label }));

  const submit = async () => {
    if (!reference.trim()) return toast.error("A transfer reference is required");
    if (sellerId && sellerId === buyerId) return toast.error("Seller and buyer cannot be the same client");

    setLoading(true);
    const res = await fetch("/api/admin/property-transfers", {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: existing?.id,
        reference,
        property_description: property,
        municipality,
        status,
        business_partner_id: attorneyId,
        estate_agent_partner_id: agentId,
        seller_client_id: sellerId,
        buyer_client_id: buyerId,
        notes,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not save the transfer");

    toast.success(existing ? "Transfer updated" : "Transfer created");
    router.push(`/admin/property-transfers/${json.transfer.id}`);
    router.refresh();
  };

  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Transfer reference"
          required
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="AS1234"
          hint="The firm's reference for this transaction. Must be unique."
        />
        <Input
          label="Property description"
          value={property}
          onChange={(e) => setProperty(e.target.value)}
          placeholder="ERF 123 VALHALLA"
        />
        <Select label="Municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} options={MUNI} />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TransferStatus)}
          options={STATUSES.map((s) => ({ value: s, label: TRANSFER_STATUS_LABELS[s] }))}
        />
      </div>

      <div className="pt-2 border-t border-line">
        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-3">Parties</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchSelect
            label="Conveyancing attorney (firm)"
            value={attorneyId}
            onChange={setAttorneyId}
            options={firmOptions}
            placeholder="Search firms…"
          />
          <SearchSelect
            label="Estate agent (firm)"
            value={agentId}
            onChange={setAgentId}
            options={firmOptions}
            placeholder="Search firms…"
          />
          <SearchSelect
            label="Seller"
            value={sellerId}
            onChange={setSellerId}
            options={clientOptions}
            placeholder="Search clients…"
          />
          <SearchSelect
            label="Buyer"
            value={buyerId}
            onChange={setBuyerId}
            options={clientOptions}
            placeholder="Search clients…"
          />
        </div>
        <p className="text-xs text-ink-3 mt-2">
          The attorney firm controls who sees this transfer — its partner users get read access to the
          transfer and every matter linked under it.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="transfer-notes" className="text-sm font-medium text-ink-2">Notes</label>
        <textarea
          id="transfer-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent"
        />
      </div>

      <Button onClick={submit} loading={loading} size="lg">
        {existing ? "Save changes" : "Create transfer"}
      </Button>
    </Card>
  );
}
