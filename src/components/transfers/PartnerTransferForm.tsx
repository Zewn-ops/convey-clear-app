"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SearchSelect from "@/components/ui/SearchSelect";
import { TRANSFER_STATUS_LABELS, type TransferStatus } from "@/types";

const MUNI = [
  { value: "", label: "— None —" },
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];
const STATUSES: TransferStatus[] = ["open", "registered", "cancelled", "on_hold"];

// A partner firm creates a transfer for its own transaction (Meeting 2). Leaner
// than the staff TransferForm: the attorney firm is implicitly the caller's own
// (never shown — they can't create one for anyone else), and the client pickers
// carry ONLY this firm's clients, so there is nothing here to point at another
// firm's data.
export default function PartnerTransferForm({
  clients,
}: {
  clients: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [property, setProperty] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [status, setStatus] = useState<TransferStatus>("open");
  const [sellerId, setSellerId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.label }));

  const submit = async () => {
    if (!reference.trim()) return toast.error("A transfer reference is required");
    if (sellerId && sellerId === buyerId) return toast.error("Seller and buyer cannot be the same client");

    setLoading(true);
    const res = await fetch("/api/partner/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        property_description: property,
        municipality,
        status,
        seller_client_id: sellerId,
        buyer_client_id: buyerId,
        notes,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not create the transfer");

    toast.success("Transfer created");
    router.push(`/partner/transfers/${json.transfer.id}`);
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
          hint="Your firm's reference for this transaction. Must be unique."
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

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Parties (optional)</p>
        {clients.length === 0 ? (
          <p className="text-xs text-gray-500">
            No clients on your firm yet — add them by referring a matter first, then link them here.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchSelect label="Seller" value={sellerId} onChange={setSellerId} options={clientOptions} placeholder="Search your clients…" />
            <SearchSelect label="Buyer" value={buyerId} onChange={setBuyerId} options={clientOptions} placeholder="Search your clients…" />
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Your firm owns this transfer and its matters. ConveyClear can see it; the other side&apos;s firm cannot.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pt-notes" className="text-sm font-medium text-gray-700">Notes</label>
        <textarea
          id="pt-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] focus:border-transparent"
        />
      </div>

      <Button onClick={submit} loading={loading} size="lg">Create transfer</Button>
    </Card>
  );
}
