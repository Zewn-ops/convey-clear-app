"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { CheckCircle2, ExternalLink } from "lucide-react";

const MUNICIPALITIES = [
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];

type EntityType = "natural_person" | "business" | "trust";

type Party = {
  entity_type: EntityType;
  full_name: string;
  business_name: string;
  registration_no: string;
  id_number: string;
  email: string;
  cell: string;
  physical_address: string;
  bank_name: string;
  bank_account_no: string;
  bank_branch_code: string;
  account_holder: string;
};

const emptyParty = (): Party => ({
  entity_type: "natural_person",
  full_name: "",
  business_name: "",
  registration_no: "",
  id_number: "",
  email: "",
  cell: "",
  physical_address: "",
  bank_name: "",
  bank_account_no: "",
  bank_branch_code: "",
  account_holder: "",
});

const partyName = (p: Party) => (p.entity_type === "natural_person" ? p.full_name : p.business_name).trim();

// One buyer/seller capture block. Banking fields shown only for the seller
// (Open Rates Account closure → deposit/credit refund).
function PartySection({
  title,
  subtitle,
  party,
  onChange,
  showBanking,
}: {
  title: string;
  subtitle: string;
  party: Party;
  onChange: (patch: Partial<Party>) => void;
  showBanking?: boolean;
}) {
  const isPerson = party.entity_type === "natural_person";
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Entity type"
          value={party.entity_type}
          onChange={(e) => onChange({ entity_type: e.target.value as EntityType })}
          options={[
            { value: "natural_person", label: "Natural Person" },
            { value: "business", label: "Business" },
            { value: "trust", label: "Trust" },
          ]}
        />
        <Input
          label={isPerson ? "Full name" : "Business / Trust name"}
          required
          value={isPerson ? party.full_name : party.business_name}
          onChange={(e) => onChange(isPerson ? { full_name: e.target.value } : { business_name: e.target.value })}
          placeholder={isPerson ? "Jane Smith" : "Acme (Pty) Ltd"}
        />
        {!isPerson && (
          <Input
            label="Registration / IT number"
            value={party.registration_no}
            onChange={(e) => onChange({ registration_no: e.target.value })}
            placeholder="2018/123456/07"
          />
        )}
        <Input
          label="ID number"
          value={party.id_number}
          onChange={(e) => onChange({ id_number: e.target.value })}
          placeholder="ID / passport"
        />
        <Input label="Email" type="email" value={party.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="name@example.co.za" />
        <Input label="Cell" value={party.cell} onChange={(e) => onChange({ cell: e.target.value })} placeholder="+27 82 000 0000" />
      </div>
      <Input
        label="Physical address"
        value={party.physical_address}
        onChange={(e) => onChange({ physical_address: e.target.value })}
        placeholder="Street, suburb, city"
      />
      {showBanking && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
          <p className="text-xs font-medium text-gray-600">Refund banking (optional — for the rates account closure refund)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Account holder" value={party.account_holder} onChange={(e) => onChange({ account_holder: e.target.value })} />
            <Input label="Bank" value={party.bank_name} onChange={(e) => onChange({ bank_name: e.target.value })} />
            <Input label="Account number" value={party.bank_account_no} onChange={(e) => onChange({ bank_account_no: e.target.value })} />
            <Input label="Branch code" value={party.bank_branch_code} onChange={(e) => onChange({ bank_branch_code: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReferForm({
  services,
}: {
  services: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();

  // matter-level
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [municipality, setMunicipality] = useState("COT");
  const [property, setProperty] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ matterId: string; token: string } | null>(null);

  // single-client (non-COO)
  const [entityType, setEntityType] = useState<EntityType>("natural_person");
  const [name, setName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [email, setEmail] = useState("");
  const [cell, setCell] = useState("");

  // COO parties
  const [buyer, setBuyer] = useState<Party>(emptyParty());
  const [seller, setSeller] = useState<Party>(emptyParty());

  const selectedService = services.find((s) => s.id === serviceId);
  const isCoo = (selectedService?.code ?? "").toUpperCase() === "COO";

  const partyPayload = (p: Party, role: "buyer" | "seller") => ({
    role,
    entity_type: p.entity_type,
    full_name: p.entity_type === "natural_person" ? p.full_name : undefined,
    business_name: p.entity_type !== "natural_person" ? p.business_name : undefined,
    registration_no: p.entity_type !== "natural_person" ? p.registration_no : undefined,
    id_number: p.id_number,
    email: p.email,
    cell: p.cell,
    physical_address: p.physical_address,
    bank_name: p.bank_name,
    bank_account_no: p.bank_account_no,
    bank_branch_code: p.bank_branch_code,
    account_holder: p.account_holder,
  });

  const submit = async () => {
    if (isCoo) {
      if (!partyName(buyer)) return toast.error("Buyer name is required");
      if (!partyName(seller)) return toast.error("Seller name is required");
    } else if (!name.trim()) {
      return toast.error("Client / entity name is required");
    }

    setLoading(true);
    const payload = isCoo
      ? {
          service_id: serviceId || undefined,
          municipality,
          property_description: property,
          notes,
          parties: [partyPayload(buyer, "buyer"), partyPayload(seller, "seller")],
        }
      : {
          entity_type: entityType,
          full_name: entityType === "natural_person" ? name : undefined,
          business_name: entityType !== "natural_person" ? name : undefined,
          registration_no: entityType !== "natural_person" ? regNo : undefined,
          email,
          cell,
          service_id: serviceId || undefined,
          municipality,
          property_description: property,
          notes,
        };

    const res = await fetch("/api/partner/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not create the matter");
    toast.success("Matter referred");
    setDone({ matterId: json.matter_id, token: json.onboarding_token });
    router.refresh();
  };

  if (done) {
    return (
      <Card className="border-green-300 bg-green-50">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-green-900">Matter created</p>
              <p className="text-sm text-green-800">It now appears in your matters. ConveyClear has been notified.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.open(`/onboard?token=${done.token}`, "_blank", "noopener")}>
                Upload supporting documents now <ExternalLink className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => router.push(`/partner/matters/${done.matterId}`)}>
                View matter
              </Button>
              <Button variant="ghost" onClick={() => { setDone(null); setBuyer(emptyParty()); setSeller(emptyParty()); setName(""); }}>
                Refer another
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            options={services.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select label="Municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} options={MUNICIPALITIES} />
        </div>
        <Input label="Property description" value={property} onChange={(e) => setProperty(e.target.value)} placeholder="Erf 123, Bondtown" />
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context for ConveyClear" />

        {isCoo && (
          <p className="text-xs text-[#1B2E6B] bg-[#1B2E6B]/5 border border-[#1B2E6B]/10 rounded-lg px-3 py-2">
            Change of Ownership has two sides — capture both the <strong>buyer</strong> (new owner / Open Rates Account) and the{" "}
            <strong>seller</strong> (account closure &amp; refund) below.
          </p>
        )}
      </Card>

      {isCoo ? (
        <>
          <PartySection
            title="Buyer (new owner)"
            subtitle="Opens the new municipal rates account (ORA)."
            party={buyer}
            onChange={(patch) => setBuyer((p) => ({ ...p, ...patch }))}
          />
          <PartySection
            title="Seller (current owner)"
            subtitle="Closes the old account and receives the deposit/credit refund."
            party={seller}
            onChange={(patch) => setSeller((p) => ({ ...p, ...patch }))}
            showBanking
          />
        </>
      ) : (
        <Card className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Entity type"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType)}
              options={[
                { value: "natural_person", label: "Natural Person" },
                { value: "business", label: "Business" },
                { value: "trust", label: "Trust" },
              ]}
            />
            <Input
              label={entityType === "natural_person" ? "Full name" : "Business / Trust name"}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={entityType === "natural_person" ? "Jane Smith" : "Acme (Pty) Ltd"}
            />
            {entityType !== "natural_person" && (
              <Input label="Registration / IT number" value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="2018/123456/07" />
            )}
            <Input label="Client email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.co.za" />
            <Input label="Client cell" value={cell} onChange={(e) => setCell(e.target.value)} placeholder="+27 82 000 0000" />
          </div>
        </Card>
      )}

      <Button onClick={submit} loading={loading} className="w-full" size="lg">
        Refer matter
      </Button>
    </div>
  );
}
