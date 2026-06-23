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
  first_name: string;
  last_name: string;
  business_name: string;
  registration_no: string;
  id_number: string; // natural person — or, for business/trust, the contact person's ID
  email: string;
  cell: string;
  physical_address: string;
  // Contact person — for business / trust parties.
  contact_name: string;
  contact_email: string;
  contact_cell: string;
};

const emptyParty = (): Party => ({
  entity_type: "natural_person",
  first_name: "",
  last_name: "",
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

const partyName = (p: Party) =>
  (p.entity_type === "natural_person" ? `${p.first_name} ${p.last_name}` : p.business_name).trim();

// One party capture block. Natural person → first name + surname + ID. Business/
// trust → name + registration + a contact-person box that ALSO holds the
// contact's ID number (note 2026-06-22).
function PartySection({
  title,
  subtitle,
  party,
  onChange,
}: {
  title: string;
  subtitle?: string;
  party: Party;
  onChange: (patch: Partial<Party>) => void;
}) {
  const isPerson = party.entity_type === "natural_person";
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
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
        {isPerson ? (
          <>
            <Input label="First name(s)" required value={party.first_name} onChange={(e) => onChange({ first_name: e.target.value })} placeholder="Jane" />
            <Input label="Surname" required value={party.last_name} onChange={(e) => onChange({ last_name: e.target.value })} placeholder="Smith" />
            <Input label="ID number" value={party.id_number} onChange={(e) => onChange({ id_number: e.target.value })} placeholder="ID / passport" />
          </>
        ) : (
          <>
            <Input label="Business / Trust name" required value={party.business_name} onChange={(e) => onChange({ business_name: e.target.value })} placeholder="Acme (Pty) Ltd" />
            <Input label="Registration / IT number" value={party.registration_no} onChange={(e) => onChange({ registration_no: e.target.value })} placeholder="2018/123456/07" />
          </>
        )}
        <Input label="Email" type="email" value={party.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="name@example.co.za" />
        <Input label="Cell" value={party.cell} onChange={(e) => onChange({ cell: e.target.value })} placeholder="+27 82 000 0000" />
      </div>
      <Input label="Physical address" value={party.physical_address} onChange={(e) => onChange({ physical_address: e.target.value })} placeholder="Street, suburb, city" />
      {!isPerson && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
          <p className="text-xs font-medium text-gray-600">Contact person</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={party.contact_name} onChange={(e) => onChange({ contact_name: e.target.value })} placeholder="Authorised representative" />
            <Input label="ID number" value={party.id_number} onChange={(e) => onChange({ id_number: e.target.value })} placeholder="Contact's ID / passport" />
            <Input label="Email" type="email" value={party.contact_email} onChange={(e) => onChange({ contact_email: e.target.value })} placeholder="contact@example.co.za" />
            <Input label="Cell" value={party.contact_cell} onChange={(e) => onChange({ contact_cell: e.target.value })} placeholder="+27 82 000 0000" />
          </div>
        </div>
      )}
    </div>
  );
}

const partyPayload = (p: Party, role: "buyer" | "seller") => ({
  role,
  entity_type: p.entity_type,
  first_name: p.entity_type === "natural_person" ? p.first_name : undefined,
  last_name: p.entity_type === "natural_person" ? p.last_name : undefined,
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

export default function ReferForm({
  services,
}: {
  services: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();

  // Only COO + PRC (RCF) are offered to partners for now (note 2026-06-22).
  const allowed = services.filter((s) => ["COO", "RCF"].includes((s.code ?? "").toUpperCase()));

  // matter-level
  const [serviceId, setServiceId] = useState(allowed[0]?.id ?? "");
  const [municipality, setMunicipality] = useState("COT");
  const [property, setProperty] = useState("");
  const [notes, setNotes] = useState("");
  const [fileRef, setFileRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ matterId: string; token: string } | null>(null);

  // COO parties
  const [buyer, setBuyer] = useState<Party>(emptyParty());
  const [seller, setSeller] = useState<Party>(emptyParty());

  // PRC: a single merged seller/applicant party + referral fields.
  const [prcSubtype, setPrcSubtype] = useState<"RCF" | "RCC" | "RCA">("RCF");
  const [prcParty, setPrcParty] = useState<Party>(emptyParty());
  const [municipalAccountNo, setMunicipalAccountNo] = useState("");
  const [utilitiesAccountNo, setUtilitiesAccountNo] = useState("");
  const [queryRefNo, setQueryRefNo] = useState("");

  const selectedService = allowed.find((s) => s.id === serviceId);
  const isCoo = (selectedService?.code ?? "").toUpperCase() === "COO";
  const isPrc = (selectedService?.code ?? "").toUpperCase() === "RCF";
  const prcSub = PRC_SUBTYPES.find((s) => s.code === prcSubtype);
  const prcBlocked = isPrc && !!prcSub && !prcSub.inPortal; // RCA → contact CC, no submit

  // Internal file reference is required for every referral (note 2026-06-22).
  const hasRef = !!fileRef.trim();
  const canSubmit = isCoo
    ? hasRef && !!partyName(seller) && !!partyName(buyer)
    : isPrc
    ? hasRef && !prcBlocked && !!partyName(prcParty) && !!municipalAccountNo.trim()
    : false;

  const submit = async () => {
    if (!hasRef) return toast.error("Internal file reference is required");
    if (isCoo) {
      if (!partyName(seller)) return toast.error("Seller name is required");
      if (!partyName(buyer)) return toast.error("Buyer name is required");
    } else if (isPrc) {
      if (prcBlocked) return; // RCA handled off-portal
      if (!partyName(prcParty)) return toast.error("Seller / applicant name is required");
      if (!municipalAccountNo.trim()) return toast.error("Municipal rates account number is required");
    }

    setLoading(true);
    const payload = isCoo
      ? {
          service_id: serviceId || undefined,
          municipality,
          property_description: property,
          notes,
          partner_file_ref: fileRef,
          parties: [partyPayload(seller, "seller"), partyPayload(buyer, "buyer")],
        }
      : {
          service_id: serviceId || undefined,
          municipality,
          property_description: property,
          notes,
          partner_file_ref: fileRef,
          service_subtype: prcSubtype,
          service_data: {
            municipal_account_no: municipalAccountNo || undefined,
            municipal_utilities_account: utilitiesAccountNo || undefined,
            query_reference_no: prcNeedsQueryRef(municipality) ? queryRefNo || undefined : undefined,
          },
          parties: [partyPayload(prcParty, "seller")],
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
              <Button variant="ghost" onClick={() => { setDone(null); setBuyer(emptyParty()); setSeller(emptyParty()); setPrcParty(emptyParty()); }}>
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
      {/* Matter-level details — internal ref required + first (note 2026-06-22). */}
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            options={allowed.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select label="Municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} options={MUNICIPALITIES} />
        </div>
        <Input label="Internal File Reference" required value={fileRef} onChange={(e) => setFileRef(e.target.value)} placeholder="Your own internal file / matter number" />
        <Input label="Property description" value={property} onChange={(e) => setProperty(e.target.value)} placeholder="Erf 123, Bondtown" />
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context for ConveyClear" />

        {isCoo && (
          <p className="text-xs text-[#1B2E6B] bg-[#1B2E6B]/5 border border-[#1B2E6B]/10 rounded-lg px-3 py-2">
            Change of Ownership has two sides — capture both the <strong>seller</strong> (current owner) and the{" "}
            <strong>buyer</strong> (new owner / Open Rates Account) below.
          </p>
        )}
      </Card>

      {isCoo ? (
        <>
          <PartySection title="Seller (current owner)" subtitle="Closes the old municipal rates account." party={seller} onChange={(patch) => setSeller((p) => ({ ...p, ...patch }))} />
          <PartySection title="Buyer (new owner)" subtitle="Opens the new municipal rates account (ORA)." party={buyer} onChange={(patch) => setBuyer((p) => ({ ...p, ...patch }))} />
        </>
      ) : isPrc ? (
        <>
          {/* 1.1 Details — clearance type + referral fields */}
          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">1.1 Details</h2>
            <Select
              label="Rates clearance type"
              value={prcSubtype}
              onChange={(e) => setPrcSubtype(e.target.value as "RCF" | "RCC" | "RCA")}
              options={PRC_SUBTYPES.map((s) => ({ value: s.code, label: s.label }))}
            />
            {prcSub && !prcSub.inPortal ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{prcSub.notice}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Municipal rates account no." required value={municipalAccountNo} onChange={(e) => setMunicipalAccountNo(e.target.value)} placeholder="Account number" />
                <Input label="Municipal utilities account (optional)" value={utilitiesAccountNo} onChange={(e) => setUtilitiesAccountNo(e.target.value)} placeholder="Utilities account number" />
                {prcNeedsQueryRef(municipality) && (
                  <Input label="Query reference number" value={queryRefNo} onChange={(e) => setQueryRefNo(e.target.value)} placeholder="COJ query reference" />
                )}
              </div>
            )}
          </Card>

          {/* 1.2 Seller Details — merged seller + applicant into one party */}
          {prcSub?.inPortal && (
            <PartySection title="1.2 Seller Details" subtitle="The current owner / applicant for the rates clearance." party={prcParty} onChange={(patch) => setPrcParty((p) => ({ ...p, ...patch }))} />
          )}
        </>
      ) : null}

      <Button onClick={submit} loading={loading} disabled={!canSubmit} className="w-full" size="lg">
        {prcBlocked ? "Contact ConveyClear to proceed" : "Refer matter"}
      </Button>
      {!canSubmit && !prcBlocked && (
        <p className="text-center text-xs text-gray-400 -mt-2">
          Fill in all required fields (marked <span className="text-red-500">*</span>) to continue.
        </p>
      )}
    </div>
  );
}
