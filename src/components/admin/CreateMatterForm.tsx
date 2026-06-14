"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { buildMatterTitle } from "@/lib/matter-naming";
import { PRIORITY_LABELS, type MatterPriority } from "@/types";
import { CheckCircle2, ExternalLink } from "lucide-react";

const MUNI = [
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];
const PRIORITIES: MatterPriority[] = ["standard", "priority", "urgent", "complex", "emerging", "whale"];

export default function CreateMatterForm({
  services,
  clients,
}: {
  services: { id: string; code: string; name: string }[];
  clients: { id: string; full_name: string | null; business_name: string | null }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">(clients.length ? "existing" : "new");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [entityType, setEntityType] = useState<"natural_person" | "business" | "trust">("natural_person");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cell, setCell] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [municipality, setMunicipality] = useState("COT");
  const [property, setProperty] = useState("");
  const [priority, setPriority] = useState<MatterPriority>("standard");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ matterId: string; title: string; token: string } | null>(null);

  const svcCode = services.find((s) => s.id === serviceId)?.code ?? "";
  const clientName =
    mode === "new"
      ? name
      : (() => {
          const c = clients.find((x) => x.id === clientId);
          return c?.business_name || c?.full_name || "";
        })();
  const previewTitle = buildMatterTitle({ municipality, serviceCode: svcCode, clientName, property });

  const submit = async () => {
    if (mode === "new" && !name.trim()) return toast.error("Client name required");
    if (mode === "existing" && !clientId) return toast.error("Pick a client");
    setLoading(true);
    const res = await fetch("/api/admin/matters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: mode === "existing" ? clientId : undefined,
        entity_type: entityType,
        full_name: entityType === "natural_person" ? name : undefined,
        business_name: entityType !== "natural_person" ? name : undefined,
        email, cell, service_id: serviceId, municipality, property_description: property, priority,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not create matter");
    toast.success("Matter created");
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
        <Select
          label="Client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Select a client…"
          options={clients.map((c) => ({ value: c.id, label: c.business_name || c.full_name || "Unnamed" }))}
        />
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
          <Input label={entityType === "natural_person" ? "Full name" : "Business / Trust name"} value={name} onChange={(e) => setName(e.target.value)} />
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

      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Matter title (auto)</p>
        <p className="text-sm font-mono text-[#1B2E6B] mt-1">{previewTitle}</p>
      </div>

      <Button onClick={submit} loading={loading} size="lg">Create matter</Button>
    </Card>
  );
}
