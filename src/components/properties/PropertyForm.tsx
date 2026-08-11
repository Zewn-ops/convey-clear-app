"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Save } from "lucide-react";
import SearchSelect from "@/components/ui/SearchSelect";

export interface PropertyInitial {
  id?: string;
  label?: string | null;
  address?: string | null;
  erf_number?: string | null;
  municipality?: string | null;
  province?: string | null;
  suburb?: string | null;
  rates_account_no?: string | null;
  title_deed_no?: string | null;
  client_id?: string | null;
  notes?: string | null;
}

export interface EntityOption {
  id: string;
  label: string;
}

const MUNICIPALITIES = [
  { value: "", label: "— Not set —" },
  { value: "COT", label: "City of Tshwane" },
  { value: "COJ", label: "City of Johannesburg" },
  { value: "COE", label: "City of Ekurhuleni" },
  { value: "OTHER", label: "Other" },
];

// Provinces drive the geofence rules in §7 of the compliance layer, so this is a
// fixed list rather than free text — a typo'd "Gauteng " would silently fall out
// of any rule keyed on it later.
const PROVINCES = [
  "",
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];

export default function PropertyForm({
  initial,
  entities,
}: {
  initial?: PropertyInitial;
  entities: EntityOption[];
}) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    label: initial?.label ?? "",
    erf_number: initial?.erf_number ?? "",
    address: initial?.address ?? "",
    suburb: initial?.suburb ?? "",
    municipality: initial?.municipality ?? "",
    province: initial?.province ?? "",
    rates_account_no: initial?.rates_account_no ?? "",
    title_deed_no: initial?.title_deed_no ?? "",
    client_id: initial?.client_id ?? "",
    notes: initial?.notes ?? "",
  });

  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.label.trim()) {
      toast.error("Give the property a name.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/properties", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...f, id: initial!.id } : f),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not save.");
        return;
      }
      toast.success(editing ? "Property saved." : "Property created.");
      router.push(editing ? `/admin/properties/${initial!.id}` : `/admin/properties/${j.id}`);
      router.refresh();
    } catch {
      toast.error("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "bg-surface text-ink mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]";
  const label = "block text-xs font-medium text-ink-3";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-lg border border-line bg-raised p-4 space-y-4">
        <p className="text-xs font-semibold text-ink uppercase tracking-wide">Identity</p>
        <label className={label}>
          Property name <span className="text-required">*</span>
          <input className={input} value={f.label} onChange={set("label")} placeholder="ERF 123 Valhalla" required />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Erf number
            <input className={input} value={f.erf_number} onChange={set("erf_number")} />
          </label>
          <label className={label}>
            Title deed number
            <input className={input} value={f.title_deed_no} onChange={set("title_deed_no")} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-raised p-4 space-y-4">
        <p className="text-xs font-semibold text-ink uppercase tracking-wide">Where it is</p>
        <label className={label}>
          Street address
          <input className={input} value={f.address} onChange={set("address")} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Suburb
            <input className={input} value={f.suburb} onChange={set("suburb")} />
          </label>
          <label className={label}>
            Municipality
            <select className={input} value={f.municipality} onChange={set("municipality")}>
              {MUNICIPALITIES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Province
            <select className={input} value={f.province} onChange={set("province")}>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>{p || "— Not set —"}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-raised p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-ink uppercase tracking-wide">Council &amp; ownership</p>
          <p className="text-xs text-ink-3 mt-1">
            The rates account follows the property, not the matter — this is its home.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Rates account number
            <input className={input} value={f.rates_account_no} onChange={set("rates_account_no")} />
          </label>
          {/* Searchable: this is the full client list, which grows with every
              transaction. Municipality and province above stay plain selects —
              short, fixed, and known by heart. */}
          <SearchSelect
            label="Owning entity"
            value={f.client_id}
            onChange={(v) => setF((prev) => ({ ...prev, client_id: v }))}
            options={entities.map((e) => ({ value: e.id, label: e.label }))}
            placeholder="Search clients…"
            emptyLabel="— Not set —"
          />
        </div>
      </div>

      <label className={label}>
        Notes
        <textarea rows={3} className={input} value={f.notes} onChange={set("notes")} />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Save className="h-4 w-4" />
        {busy ? "Saving…" : editing ? "Save property" : "Create property"}
      </button>
    </form>
  );
}
