"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { PRC_SUBTYPES, prcNeedsQueryRef } from "@/lib/prc-docs";

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
  // Contact person — for business / trust parties (A1).
  contact_name: string;
  contact_email: string;
  contact_cell: string;
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
  contact_name: "",
  contact_email: "",
  contact_cell: "",
});

const partyName = (p: Party) => (p.entity_type === "natural_person" ? p.full_name : p.business_name).trim();

// One buyer/seller capture block. Business/trust parties also capture a contact
// person (the human ConveyClear deals with).
function PartySection({
  title,
  subtitle,
  party,
  onChange,
}: {
  title: string;
  subtitle: string;
  party: Party;
  onChange: (patch: Partial<Party>) => void;
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
      {!isPerson && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
          <p className="text-xs font-medium text-gray-600">Contact person</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={party.contact_name} onChange={(e) => onChange({ contact_name: e.target.value })} placeholder="Authorised representative" />
            <Input label="Email" type="email" value={party.contact_email} onChange={(e) => onChange({ contact_email: e.target.value })} placeholder="contact@example.co.za" />
            <Input label="Cell" value={party.contact_cell} onChange={(e) => onChange({ contact_cell: e.target.value })} placeholder="+27 82 000 0000" />
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
  const [fileRef, setFileRef] = useState("");
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

  // PRC (service code RCF) sub-division + referral fields
  const [prcSubtype, setPrcSubtype] = useState<"RCF" | "RCC" | "RCA">("RCF");
  const [municipalAccountNo, setMunicipalAccountNo] = useState("");
  const [queryRefNo, setQueryRefNo] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerCell, setSellerCell] = useState("");

  const selectedService = services.find((s) => s.id === serviceId);
  const isCoo = (selectedService?.code ?? "").toUpperCase() === "COO";
  const isPrc = (selectedService?.code ?? "").toUpperCase() === "RCF";
  const prcSub = PRC_SUBTYPES.find((s) => s.code === prcSubtype);
  const prcBlocked = isPrc && !!prcSub && !prcSub.inPortal; // RCA / RCC → contact CC, no submit

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
    contact_name: p.entity_type !== "natural_person" ? p.contact_name : undefined,
    contact_email: p.entity_type !== "natural_person" ? p.contact_email : undefined,
    contact_cell: p.entity_type !== "natural_person" ? p.contact_cell : undefined,
  });

  const submit = async () => {
    if (isCoo) {
      if (!partyName(buyer)) return toast.error("Buyer name is required");
      if (!partyName(seller)) return toast.error("Seller name is required");
    } else if (isPrc) {
      if (prcBlocked) return; // RCA / RCC handled off-portal
      if (!sellerName.trim()) return toast.error("Seller name is required");
      if (!municipalAccountNo.trim()) return toast.error("Municipal rates account number is required");
      if (!name.trim()) return toast.error("Client / entity name is required");
    } else if (!name.trim()) {
      return toast.error("Client / entity name is required");
    }

    setLoading(true);
    const entityFields = {
      entity_type: entityType,
      full_name: entityType === "natural_person" ? name : undefined,
      business_name: entityType !== "natural_person" ? name : undefined,
      registration_no: entityType !== "natural_person" ? regNo : undefined,
      email,
      cell,
    };
    const payload = isCoo
      ? {
          service_id: serviceId || undefined,
          municipality,
          property_description: property,
          notes,
          partner_file_ref: fileRef || undefined,
          parties: [partyPayload(seller, "seller"), partyPayload(buyer, "buyer")],
        }
      : isPrc
      ? {
          ...entityFields,
          service_id: serviceId || undefined,
          municipality,
          property_description: property,
          notes,
          partner_file_ref: fileRef || undefined,
          service_subtype: prcSubtype,
          service_data: {
            municipal_account_no: municipalAccountNo || undefined,
            query_reference_no: prcNeedsQueryRef(municipality) ? queryRefNo || undefined : undefined,
            seller_name: sellerName || undefined,
            seller_cell: sellerCell || undefined,
          },
        }
      : {
          ...entityFields,
          service_id: serviceId || undefined,
          municipality,
          property_description: property,
          notes,
          partner_file_ref: fileRef || undefined,
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

  // The applicant/client entity block — shared by single-client + PRC referrals.
  const entityCard = (
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
  );

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
        <Input label="Your file reference (optional)" value={fileRef} onChange={(e) => setFileRef(e.target.value)} placeholder="Your own internal file / matter number" />

        {isCoo && (
          <p className="text-xs text-[#1B2E6B] bg-[#1B2E6B]/5 border border-[#1B2E6B]/10 rounded-lg px-3 py-2">
            Change of Ownership has two sides — capture both the <strong>seller</strong> (current owner) and the{" "}
            <strong>buyer</strong> (new owner / Open Rates Account) below.
          </p>
        )}
      </Card>

      {isCoo ? (
        <>
          <PartySection
            title="Seller (current owner)"
            subtitle="Closes the old municipal rates account."
            party={seller}
            onChange={(patch) => setSeller((p) => ({ ...p, ...patch }))}
          />
          <PartySection
            title="Buyer (new owner)"
            subtitle="Opens the new municipal rates account (ORA)."
            party={buyer}
            onChange={(patch) => setBuyer((p) => ({ ...p, ...patch }))}
          />
        </>
      ) : isPrc ? (
        <>
          <Card className="space-y-3">
            <Select
              label="Rates clearance type"
              value={prcSubtype}
              onChange={(e) => setPrcSubtype(e.target.value as "RCF" | "RCC" | "RCA")}
              options={PRC_SUBTYPES.map((s) => ({ value: s.code, label: s.label }))}
            />
            {prcSub && !prcSub.inPortal && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{prcSub.notice}</p>
            )}
          </Card>

          {prcSubtype === "RCF" && (
            <>
              {/* Seller details — above the entity/applicant section (E2) */}
              <Card className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">Seller details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Seller name" required value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Current owner" />
                  <Input label="Seller cell (optional)" value={sellerCell} onChange={(e) => setSellerCell(e.target.value)} placeholder="+27 82 000 0000" />
                </div>
              </Card>

              {/* Rates clearance figures referral fields */}
              <Card className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">Rates clearance figures referral</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Municipal rates account no." required value={municipalAccountNo} onChange={(e) => setMunicipalAccountNo(e.target.value)} placeholder="Account number" />
                  {prcNeedsQueryRef(municipality) && (
                    <Input label="Query reference number" value={queryRefNo} onChange={(e) => setQueryRefNo(e.target.value)} placeholder="COJ query reference" />
                  )}
                </div>
                <p className="text-xs text-gray-400">Property description and your file reference are captured in the section above.</p>
              </Card>

              {entityCard}
            </>
          )}
        </>
      ) : (
        entityCard
      )}

      <Button onClick={submit} loading={loading} disabled={prcBlocked} className="w-full" size="lg">
        {prcBlocked ? "Contact ConveyClear to proceed" : "Refer matter"}
      </Button>
    </div>
  );
}
