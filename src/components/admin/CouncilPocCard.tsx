"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Pencil, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { MUNICIPALITIES } from "@/lib/conveyclear-lists";
import { councilPocName, type CouncilPoc } from "@/types";

// B5 / Theme G — the "contact card": view + edit + delete a single council POC.
function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <dt className="text-ink-3 text-xs">{k}</dt>
      <dd className="font-medium mt-0.5 text-ink break-words">{v || "—"}</dd>
    </div>
  );
}

export default function CouncilPocCard({ poc }: { poc: CouncilPoc }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    first_name: poc.first_name ?? "",
    last_name: poc.last_name ?? "",
    council: poc.council ?? "",
    department: poc.department ?? "",
    email: poc.email ?? "",
    cell: poc.cell ?? "",
    job_title: poc.job_title ?? "",
    tel: poc.tel ?? "",
    region: poc.region ?? "",
    office_description: poc.office_description ?? "",
    birthday: poc.birthday ?? "",
    notes: poc.notes ?? "",
  });

  const input = "rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) return toast.error("A first name is required");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/council-pocs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: poc.id, ...form }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not save");
      toast.success("Saved");
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${councilPocName(poc)}? This also removes them from any linked matters.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/council-pocs?id=${poc.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not delete");
      toast.success("Deleted");
      router.push("/admin/council-pocs");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-3">First name *</label>
            <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
          <div>
            <label className="text-xs text-ink-3">Surname</label>
            <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
          <div>
            <label className="text-xs text-ink-3">Council</label>
            <input list="council-list-edit" value={form.council} onChange={(e) => setForm({ ...form, council: e.target.value })} className={`${input} w-full mt-1`} />
            <datalist id="council-list-edit">{MUNICIPALITIES.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-ink-3">Department</label>
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
          <div>
            <label className="text-xs text-ink-3">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
          <div>
            <label className="text-xs text-ink-3">Cell</label>
            <input value={form.cell} onChange={(e) => setForm({ ...form, cell: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
          <div>
            <label className="text-xs text-ink-3">Tel</label>
            <input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} className={`${input} w-full mt-1`} placeholder="Office / landline" />
          </div>
          <div>
            <label className="text-xs text-ink-3">Job title</label>
            <input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
          <div>
            <label className="text-xs text-ink-3">Region</label>
            <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={`${input} w-full mt-1`} placeholder="e.g. Tshwane North" />
          </div>
          <div>
            <label className="text-xs text-ink-3">Birthday</label>
            <input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className={`${input} w-full mt-1`} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-ink-3">Office description</label>
            <input value={form.office_description} onChange={(e) => setForm({ ...form, office_description: e.target.value })} className={`${input} w-full mt-1`} placeholder="e.g. Rates hall, 2nd floor, Room 214" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-ink-3">Comments</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={`${input} w-full mt-1 resize-none`} />
          </div>
          <div className="sm:col-span-2 flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50">
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-sm font-medium text-ink-3 hover:text-ink">Cancel</button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-ink">Contact details</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <Row k="First name" v={poc.first_name} />
        <Row k="Surname" v={poc.last_name} />
        <Row k="Job title" v={poc.job_title} />
        <Row k="Council" v={poc.council} />
        <Row k="Department" v={poc.department} />
        <Row k="Region" v={poc.region} />
        <div>
          <dt className="text-ink-3 text-xs">Email</dt>
          <dd className="font-medium mt-0.5">{poc.email ? <a href={`mailto:${poc.email}`} className="text-action hover:underline">{poc.email}</a> : "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-3 text-xs">Cell</dt>
          <dd className="font-medium mt-0.5">{poc.cell ? <a href={`tel:${poc.cell}`} className="text-action hover:underline">{poc.cell}</a> : "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-3 text-xs">Tel</dt>
          <dd className="font-medium mt-0.5">{poc.tel ? <a href={`tel:${poc.tel}`} className="text-action hover:underline">{poc.tel}</a> : "—"}</dd>
        </div>
        <Row k="Birthday" v={poc.birthday} />
        {poc.office_description && (
          <div className="col-span-2">
            <dt className="text-ink-3 text-xs">Office description</dt>
            <dd className="font-medium mt-0.5 text-ink whitespace-pre-wrap">{poc.office_description}</dd>
          </div>
        )}
        {poc.notes && (
          <div className="col-span-2">
            <dt className="text-ink-3 text-xs">Comments</dt>
            <dd className="font-medium mt-0.5 text-ink whitespace-pre-wrap">{poc.notes}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
