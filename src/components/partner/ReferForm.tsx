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

export default function ReferForm({
  services,
}: {
  services: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [entityType, setEntityType] = useState<"natural_person" | "business" | "trust">("natural_person");
  const [name, setName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [email, setEmail] = useState("");
  const [cell, setCell] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [municipality, setMunicipality] = useState("COT");
  const [property, setProperty] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ matterId: string; token: string } | null>(null);

  const submit = async () => {
    if (!name.trim()) return toast.error("Client / entity name is required");
    setLoading(true);
    const res = await fetch("/api/partner/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
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
                Complete FICA upload now <ExternalLink className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => router.push(`/partner/matters/${done.matterId}`)}>
                View matter
              </Button>
              <Button variant="ghost" onClick={() => setDone(null)}>Refer another</Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
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
        <Input
          label={entityType === "natural_person" ? "Full name" : "Business / Trust name"}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={entityType === "natural_person" ? "Jane Smith" : "Acme (Pty) Ltd"}
        />
        {entityType !== "natural_person" && (
          <Input
            label="Registration / IT number"
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            placeholder="2018/123456/07"
          />
        )}
        <Input label="Client email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.co.za" />
        <Input label="Client cell" value={cell} onChange={(e) => setCell(e.target.value)} placeholder="+27 82 000 0000" />
        <Select
          label="Service"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          options={services.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          label="Municipality"
          value={municipality}
          onChange={(e) => setMunicipality(e.target.value)}
          options={MUNICIPALITIES}
        />
      </div>
      <Input label="Property description" value={property} onChange={(e) => setProperty(e.target.value)} placeholder="Erf 123, Bondtown" />
      <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context for ConveyClear" />

      <Button onClick={submit} loading={loading} className="w-full" size="lg">
        Refer matter
      </Button>
    </Card>
  );
}
