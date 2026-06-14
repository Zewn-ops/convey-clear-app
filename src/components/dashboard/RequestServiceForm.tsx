"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { CheckCircle2 } from "lucide-react";

const MUNI = [
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];

export default function RequestServiceForm({
  services,
}: {
  services: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [municipality, setMunicipality] = useState("COT");
  const [property, setProperty] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    if (!serviceId) return toast.error("Pick a service");
    setLoading(true);
    const res = await fetch("/api/client/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: serviceId, municipality, property_description: property, notes }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not submit request");
    toast.success("Request submitted");
    setDone(json.matter_id);
    router.refresh();
  };

  if (done) {
    return (
      <Card className="border-green-300 bg-green-50">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-green-900">Request submitted</p>
              <p className="text-sm text-green-800">ConveyClear will be in touch. You can track it under My Matters.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push(`/dashboard/matters/${done}`)}>View my matter</Button>
              <Button variant="ghost" onClick={() => setDone(null)}>Request another</Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} options={services.map((s) => ({ value: s.id, label: s.name }))} />
        <Select label="Municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} options={MUNI} />
      </div>
      <Input label="Property description" value={property} onChange={(e) => setProperty(e.target.value)} placeholder="e.g. Erf 123 Valhalla" />
      <Input label="Anything we should know? (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button onClick={submit} loading={loading} size="lg" className="w-full">Submit request</Button>
    </Card>
  );
}
