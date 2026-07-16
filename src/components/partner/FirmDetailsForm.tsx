"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Landmark, ShieldCheck, Building2, Plus, Trash2 } from "lucide-react";

export interface FirmBanking {
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  branch_code: string | null;
  account_type: string | null;
  trust_bank_name: string | null;
  trust_account_name: string | null;
  trust_account_number: string | null;
  trust_branch_code: string | null;
}

export interface BpNumber {
  municipality: string;
  bp_number: string;
}

const MUNI = [
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];

const EMPTY_BANKING: FirmBanking = {
  bank_name: "", account_name: "", account_number: "", branch_code: "", account_type: "",
  trust_bank_name: "", trust_account_name: "", trust_account_number: "", trust_branch_code: "",
};

// Firm-admin edits their own firm's banking, trust account and per-municipality
// BP numbers (migration 037). Only a firm-admin can reach this — the page gates
// on requireFirmAdmin and the save route re-checks.
export default function FirmDetailsForm({
  firmName,
  banking,
  bpNumbers,
}: {
  firmName: string;
  banking: FirmBanking | null;
  bpNumbers: BpNumber[];
}) {
  const router = useRouter();
  const [b, setB] = useState<FirmBanking>({ ...EMPTY_BANKING, ...(banking ?? {}) });
  const [bps, setBps] = useState<BpNumber[]>(bpNumbers.length ? bpNumbers : []);
  const [loading, setLoading] = useState(false);

  const setField = (k: keyof FirmBanking) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setB((prev) => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    // A BP number with no municipality (or the reverse) is a half-filled row —
    // drop it rather than sending a partial the server would reject.
    const cleanedBps = bps.filter((r) => r.municipality.trim() && r.bp_number.trim());
    setLoading(true);
    const res = await fetch("/api/partner/firm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banking: b, bp_numbers: cleanedBps }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not save");
    toast.success("Firm details saved");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#1B2E6B]" />
          <h2 className="font-semibold text-gray-900">{firmName}</h2>
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          These details are visible to ConveyClear and to your firm&apos;s administrators only — not to other firms or clients.
        </p>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-[#1B2E6B]" />
          <h2 className="font-semibold text-gray-900">Business account</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Bank" value={b.bank_name ?? ""} onChange={setField("bank_name")} />
          <Input label="Account name" value={b.account_name ?? ""} onChange={setField("account_name")} />
          <Input label="Account number" value={b.account_number ?? ""} onChange={setField("account_number")} />
          <Input label="Branch code" value={b.branch_code ?? ""} onChange={setField("branch_code")} />
          <Select
            label="Account type"
            value={b.account_type ?? ""}
            onChange={(e) => setB((prev) => ({ ...prev, account_type: e.target.value }))}
            options={[
              { value: "", label: "— Select —" },
              { value: "cheque", label: "Cheque / Current" },
              { value: "savings", label: "Savings" },
            ]}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#1B2E6B]" />
          <h2 className="font-semibold text-gray-900">Trust account</h2>
        </div>
        <p className="text-xs text-gray-500 -mt-2">The section-86(4) trust account, where client funds are held.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Trust bank" value={b.trust_bank_name ?? ""} onChange={setField("trust_bank_name")} />
          <Input label="Trust account name" value={b.trust_account_name ?? ""} onChange={setField("trust_account_name")} />
          <Input label="Trust account number" value={b.trust_account_number ?? ""} onChange={setField("trust_account_number")} />
          <Input label="Trust branch code" value={b.trust_branch_code ?? ""} onChange={setField("trust_branch_code")} />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Municipality BP numbers</h2>
          <button
            type="button"
            onClick={() => setBps((prev) => [...prev, { municipality: "", bp_number: "" }])}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#E8521A] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add a municipality
          </button>
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          Your firm&apos;s council-assigned BP number for each municipality — used on clearance applications.
        </p>
        {bps.length === 0 ? (
          <p className="text-sm text-gray-400">None captured yet.</p>
        ) : (
          <div className="space-y-2">
            {bps.map((row, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label={i === 0 ? "Municipality" : undefined}
                    value={row.municipality}
                    onChange={(e) =>
                      setBps((prev) => prev.map((r, j) => (j === i ? { ...r, municipality: e.target.value } : r)))
                    }
                    options={[{ value: "", label: "— Select —" }, ...MUNI]}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label={i === 0 ? "BP number" : undefined}
                    value={row.bp_number}
                    onChange={(e) =>
                      setBps((prev) => prev.map((r, j) => (j === i ? { ...r, bp_number: e.target.value } : r)))
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setBps((prev) => prev.filter((_, j) => j !== i))}
                  className="mb-2 text-gray-300 hover:text-red-600"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Button onClick={save} loading={loading} size="lg">Save firm details</Button>
    </div>
  );
}
