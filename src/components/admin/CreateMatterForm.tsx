"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SearchSelect from "@/components/ui/SearchSelect";
import { buildMatterTitle } from "@/lib/matter-naming";
import { PRIORITY_LABELS, type MatterPriority } from "@/types";
import { CheckCircle2, ExternalLink, Home } from "lucide-react";

const MUNI = [
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];
const PRIORITIES: MatterPriority[] = ["standard", "priority", "urgent", "complex", "emerging", "whale"];

/** One side of a COO transaction, as captured on this form. */
export interface PartyDraft {
  entity_type: "natural_person" | "business" | "trust";
  first_name: string;
  last_name: string;
  business_name: string;
  id_number: string;
  email: string;
  cell: string;
}

const emptyParty = (): PartyDraft => ({
  entity_type: "natural_person",
  first_name: "",
  last_name: "",
  business_name: "",
  id_number: "",
  email: "",
  cell: "",
});

/** Returns the draft only if something was actually typed — an untouched side is
 *  sent as undefined so the API creates a placeholder rather than a blank party. */
function partyPayload(p: PartyDraft): PartyDraft | undefined {
  const touched =
    p.first_name.trim() || p.last_name.trim() || p.business_name.trim() ||
    p.id_number.trim() || p.email.trim() || p.cell.trim();
  return touched ? p : undefined;
}

function PartyFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: PartyDraft;
  onChange: (p: PartyDraft) => void;
}) {
  const set = (patch: Partial<PartyDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <Select
        label="Entity type"
        value={value.entity_type}
        onChange={(e) => set({ entity_type: e.target.value as PartyDraft["entity_type"] })}
        options={[
          { value: "natural_person", label: "Natural Person" },
          { value: "business", label: "Business" },
          { value: "trust", label: "Trust" },
        ]}
      />
      {value.entity_type === "natural_person" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="First name(s)" value={value.first_name} onChange={(e) => set({ first_name: e.target.value })} />
          <Input label="Surname" value={value.last_name} onChange={(e) => set({ last_name: e.target.value })} />
          <Input label="ID number" value={value.id_number} onChange={(e) => set({ id_number: e.target.value })} />
        </div>
      ) : (
        <Input label="Business / Trust name" value={value.business_name} onChange={(e) => set({ business_name: e.target.value })} />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Email" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} />
        <Input label="Cell" value={value.cell} onChange={(e) => set({ cell: e.target.value })} />
      </div>
    </div>
  );
}

/** The transfer a matter is being created INSIDE (Jukka: the transfer is the primary object now). */
export interface CreateInTransfer {
  id: string;
  reference: string;
  municipality: string | null;
  property_description: string | null;
  /** Seller/buyer of the transfer — the two clients this matter is almost always for. */
  parties: { id: string; label: string; role: string }[];
}

export default function CreateMatterForm({
  services,
  clients,
  transfer,
}: {
  services: { id: string; code: string; name: string }[];
  clients: { id: string; full_name: string | null; business_name: string | null }[];
  /**
   * When set, the matter is created inside this property transfer: the property
   * and municipality are inherited (they belong to the TRANSACTION, not the
   * matter, and retyping them is how they drift apart), and the transfer's own
   * seller/buyer are offered first as the client.
   */
  transfer?: CreateInTransfer;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">(clients.length ? "existing" : "new");
  const [clientId, setClientId] = useState(transfer?.parties[0]?.id ?? clients[0]?.id ?? "");
  const [entityType, setEntityType] = useState<"natural_person" | "business" | "trust">("natural_person");
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [cell, setCell] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [municipality, setMunicipality] = useState(transfer?.municipality || "COT");
  const [property, setProperty] = useState(transfer?.property_description || "");
  const [priority, setPriority] = useState<MatterPriority>("standard");
  const [seller, setSeller] = useState<PartyDraft>(emptyParty());
  const [buyer, setBuyer] = useState<PartyDraft>(emptyParty());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ matterId: string; title: string; token: string } | null>(null);

  const svcCode = services.find((s) => s.id === serviceId)?.code ?? "";
  const isCoo = svcCode.toUpperCase() === "COO";
  const clientName =
    mode === "new"
      ? (entityType === "natural_person" ? `${firstName} ${lastName}`.trim() : name)
      : (() => {
          const c = clients.find((x) => x.id === clientId);
          return c?.business_name || c?.full_name || "";
        })();
  const previewTitle = buildMatterTitle({ municipality, serviceCode: svcCode, clientName, property });

  const submit = async () => {
    if (mode === "new" && !clientName.trim()) return toast.error("Client name required");
    if (mode === "existing" && !clientId) return toast.error("Pick a client");
    setLoading(true);
    const res = await fetch("/api/admin/matters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: mode === "existing" ? clientId : undefined,
        entity_type: entityType,
        first_name: entityType === "natural_person" ? firstName : undefined,
        last_name: entityType === "natural_person" ? lastName : undefined,
        business_name: entityType !== "natural_person" ? name : undefined,
        email, cell, service_id: serviceId, municipality, property_description: property, priority,
        transfer_id: transfer?.id,
        // Only sent for COO — the API seeds both sides regardless, but an
        // untouched side is left undefined so it gets a placeholder rather than
        // a party row full of empty strings.
        seller: isCoo ? partyPayload(seller) : undefined,
        buyer: isCoo ? partyPayload(buyer) : undefined,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not create matter");
    toast.success(transfer ? "Matter created in this transfer" : "Matter created");
    setDone({ matterId: json.matter_id, title: json.title, token: json.onboarding_token });
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
              <p className="text-sm text-green-800 font-mono">{done.title}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.open(`/onboard?token=${done.token}`, "_blank", "noopener")}>
                Collect FICA docs <ExternalLink className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => router.push(`/admin/matters/${done.matterId}`)}>Open matter</Button>
              <Button variant="ghost" onClick={() => setDone(null)}>Create another</Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      {transfer && (
        <div className="flex items-start gap-2 rounded-lg border border-[#E8521A]/30 bg-[#E8521A]/[0.04] px-3 py-2.5">
          <Home className="mt-0.5 h-4 w-4 shrink-0 text-[#E8521A]" />
          <div className="min-w-0 text-xs">
            <p className="font-medium text-gray-900">Creating a matter inside transfer {transfer.reference}</p>
            <p className="mt-0.5 text-gray-500">
              It is linked to the transfer on creation, and inherits the property and municipality — those describe the{" "}
              <b>transaction</b>, so they are not retyped per matter.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={"px-3 py-1.5 rounded-lg text-sm font-medium " + (mode === "existing" ? "bg-[#1B2E6B] text-white" : "bg-gray-100 text-gray-600")}
        >
          Existing client
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={"px-3 py-1.5 rounded-lg text-sm font-medium " + (mode === "new" ? "bg-[#1B2E6B] text-white" : "bg-gray-100 text-gray-600")}
        >
          New client
        </button>
      </div>

      {mode === "existing" ? (
        <div className="space-y-2">
          {/* The transfer's own seller and buyer, one click away. On a transfer,
              the matter is nearly always for one of them — and hunting for that
              person in a list of every client is the thing Jukka complained about. */}
          {transfer && transfer.parties.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">This transfer:</span>
              {transfer.parties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setClientId(p.id)}
                  className={
                    "rounded-full border px-2.5 py-1 text-xs font-medium " +
                    (clientId === p.id
                      ? "border-[#1B2E6B] bg-[#1B2E6B] text-white"
                      : "border-gray-200 text-gray-600 hover:border-[#1B2E6B]/40")
                  }
                >
                  {p.label} <span className="opacity-70">· {p.role}</span>
                </button>
              ))}
            </div>
          )}
          <SearchSelect
            label="Client"
            value={clientId}
            onChange={setClientId}
            placeholder="Search clients…"
            emptyLabel="— Select a client —"
            options={clients.map((c) => ({ value: c.id, label: c.business_name || c.full_name || "Unnamed" }))}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Entity type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as typeof entityType)}
            options={[
              { value: "natural_person", label: "Natural Person" },
              { value: "business", label: "Business" },
              { value: "trust", label: "Trust" },
            ]}
          />
          {entityType === "natural_person" ? (
            <>
              <Input label="First name(s)" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input label="Surname" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </>
          ) : (
            <Input label="Business / Trust name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Cell" value={cell} onChange={(e) => setCell(e.target.value)} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} options={services.map((s) => ({ value: s.id, label: s.name }))} />
        <Select label="Municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} options={MUNI} />
        <Input label="Property description" value={property} onChange={(e) => setProperty(e.target.value)} placeholder="ERF 123 VALHALLA" />
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as MatterPriority)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} />
      </div>

      {/* A COO is a two-sided transaction: seller (current owner) and buyer (new
          owner) are distinct parties with their own identity documents, and the
          intake files documents against them by (matter, party, type). Capturing
          them here means the matter is usable immediately; leaving a side blank
          still creates its section, to be filled in on the matter or by the
          client through the onboarding link. */}
      {isCoo && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Parties to the transaction</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Optional now — both sections are created either way, and each side gets
              its own document slots. Fill in what you have.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PartyFields title="Seller (current owner)" value={seller} onChange={setSeller} />
            <PartyFields title="Buyer (new owner)" value={buyer} onChange={setBuyer} />
          </div>
        </div>
      )}

      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Matter title (auto)</p>
        <p className="text-sm font-mono text-[#1B2E6B] mt-1">{previewTitle}</p>
      </div>

      <Button onClick={submit} loading={loading} size="lg">Create matter</Button>
    </Card>
  );
}
