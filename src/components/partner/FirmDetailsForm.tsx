"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Landmark, ShieldCheck, Building2, Plus, Trash2, Scale } from "lucide-react";

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
  /**
   * 073 — COJ issues an attorney code at the same grain as the BP number
   * (one per firm per council), so it sits in the same row rather than in a
   * table of its own.
   */
  attorney_code?: string | null;
}

/**
 * What the councils ask of the FIRM, added by 073.
 *
 * Bank details are deliberately not here: they are the two cards above, backed
 * by firm_banking (037). The councils ask for a bank CONFIRMATION LETTER,
 * which is a document, not a repeat of these fields.
 */
export interface FirmCouncilFields {
  practice_number: string | null;
  ffc_number: string | null;
  ffc_expires_on: string | null;
  file_owner_name: string | null;
  file_owner_email: string | null;
  file_owner_cell: string | null;
}

const MUNI = [
  { value: "COT", label: "City of Tshwane (COT)" },
  { value: "COJ", label: "City of Joburg (COJ)" },
  { value: "COE", label: "City of Ekurhuleni (COE)" },
  { value: "Other", label: "Other" },
];

const EMPTY_FIRM: FirmCouncilFields = {
  practice_number: "", ffc_number: "", ffc_expires_on: "",
  file_owner_name: "", file_owner_email: "", file_owner_cell: "",
};

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
  firm,
}: {
  firmName: string;
  banking: FirmBanking | null;
  bpNumbers: BpNumber[];
  firm: FirmCouncilFields | null;
}) {
  const router = useRouter();
  const [b, setB] = useState<FirmBanking>({ ...EMPTY_BANKING, ...(banking ?? {}) });
  const [f, setF] = useState<FirmCouncilFields>({ ...EMPTY_FIRM, ...(firm ?? {}) });
  const [bps, setBps] = useState<BpNumber[]>(bpNumbers.length ? bpNumbers : []);
  const [loading, setLoading] = useState(false);

  const setFirmField =
    (k: keyof FirmCouncilFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));

  const setField = (k: keyof FirmBanking) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setB((prev) => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    // A row needs a municipality and at least ONE identifier. 073 made
    // bp_number nullable and added attorney_code, because COJ issues an
    // attorney code and a firm may hold one without the other — so requiring
    // both here would silently drop a legitimate row.
    const cleanedBps = bps.filter(
      (r) => r.municipality.trim() && (r.bp_number.trim() || (r.attorney_code ?? "").trim())
    );
    setLoading(true);
    const res = await fetch("/api/partner/firm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firm: f, banking: b, bp_numbers: cleanedBps }),
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
          <Building2 className="h-4 w-4 text-action" />
          <h2 className="font-semibold text-ink">{firmName}</h2>
        </div>
        <p className="text-xs text-ink-3 -mt-2">
          These details are visible to ConveyClear and to your firm&apos;s administrators only — not to other firms or clients.
        </p>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-action" />
          <h2 className="font-semibold text-ink">Business account</h2>
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
          <ShieldCheck className="h-4 w-4 text-action" />
          <h2 className="font-semibold text-ink">Trust account</h2>
        </div>
        <p className="text-xs text-ink-3 -mt-2">The section-86(4) trust account, where client funds are held.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Trust bank" value={b.trust_bank_name ?? ""} onChange={setField("trust_bank_name")} />
          <Input label="Trust account name" value={b.trust_account_name ?? ""} onChange={setField("trust_account_name")} />
          <Input label="Trust account number" value={b.trust_account_number ?? ""} onChange={setField("trust_account_number")} />
          <Input label="Trust branch code" value={b.trust_branch_code ?? ""} onChange={setField("trust_branch_code")} />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-action" />
          <h2 className="font-semibold text-ink">Council-facing details</h2>
        </div>
        <p className="text-xs text-ink-3 -mt-2">
          What City of Tshwane and City of Ekurhuleni ask of your firm. Captured
          once here, then filled in automatically on every clearance application
          — you should never have to type these onto a form again.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Practice number"
            value={f.practice_number ?? ""}
            onChange={setFirmField("practice_number")}
            hint="Legal Practice Council. One per firm."
          />
          <Input
            label="Fidelity Fund Certificate number"
            value={f.ffc_number ?? ""}
            onChange={setFirmField("ffc_number")}
          />
          <Input
            label="FFC expires on"
            type="date"
            value={f.ffc_expires_on ?? ""}
            onChange={setFirmField("ffc_expires_on")}
            hint="An expired FFC stops the firm lodging with a council."
          />
        </div>
        <div className="pt-1">
          <p className="text-sm font-medium text-ink-2">File owner</p>
          <p className="text-xs text-ink-3 mt-0.5">
            The person a council contacts about your firm&apos;s files, if that
            is not your firm&apos;s main contact.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Name" value={f.file_owner_name ?? ""} onChange={setFirmField("file_owner_name")} />
          <Input label="Email" type="email" value={f.file_owner_email ?? ""} onChange={setFirmField("file_owner_email")} />
          <Input label="Cell" value={f.file_owner_cell ?? ""} onChange={setFirmField("file_owner_cell")} />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Council registrations</h2>
          <button
            type="button"
            onClick={() =>
              setBps((prev) => [...prev, { municipality: "", bp_number: "", attorney_code: "" }])
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add a municipality
          </button>
        </div>
        <p className="text-xs text-ink-3 -mt-2">
          What each council calls your firm: the SAP BP number, and — for City
          of Johannesburg — the attorney code it asks for on an RCA. A council
          may issue one without the other.
        </p>
        {bps.length === 0 ? (
          <p className="text-sm text-ink-3">None captured yet.</p>
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
                    label={i === 0 ? "SAP BP number" : undefined}
                    value={row.bp_number}
                    onChange={(e) =>
                      setBps((prev) => prev.map((r, j) => (j === i ? { ...r, bp_number: e.target.value } : r)))
                    }
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label={i === 0 ? "Attorney code" : undefined}
                    value={row.attorney_code ?? ""}
                    onChange={(e) =>
                      setBps((prev) =>
                        prev.map((r, j) => (j === i ? { ...r, attorney_code: e.target.value } : r))
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setBps((prev) => prev.filter((_, j) => j !== i))}
                  className="mb-2 text-ink-3 hover:text-red-600"
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
