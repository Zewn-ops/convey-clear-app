"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import { MUNICIPALITIES } from "@/lib/conveyclear-lists";
import { municipalityLabel } from "@/lib/utils";
import { councilPocName, type CouncilPoc } from "@/types";

// B5 / Theme G — Council POC directory: filterable table + inline "Add POC".
// Staff-only contact book of the people ConveyClear deals with at each council.
//
// Search + council/region/department facets live in the URL (written by the
// FilterRail beside this table) rather than in local state, so the filters match
// every other list screen and a filtered view can be linked to or bookmarked.
// The rows are already all on the client, so narrowing them is a local memo —
// no round trip.
export default function CouncilPocManager({ initialPocs }: { initialPocs: CouncilPoc[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const councilFilter = sp.get("council") ?? "";
  const regionFilter = sp.get("region") ?? "";
  const deptFilter = sp.get("department") ?? "";
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", cell: "", council: "", department: "",
    job_title: "", tel: "", region: "", office_description: "", birthday: "", notes: "",
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return initialPocs.filter((p) => {
      if (councilFilter && (p.council ?? "") !== councilFilter) return false;
      if (regionFilter && (p.region ?? "") !== regionFilter) return false;
      if (deptFilter && (p.department ?? "") !== deptFilter) return false;
      if (!t) return true;
      return [councilPocName(p), p.council, p.department, p.region, p.email, p.cell, p.job_title]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(t));
    });
  }, [q, councilFilter, regionFilter, deptFilter, initialPocs]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) return toast.error("A first name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/council-pocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not save the POC");
      toast.success("Council POC added");
      setForm({
        first_name: "", last_name: "", email: "", cell: "", council: "", department: "",
        job_title: "", tel: "", region: "", office_description: "", birthday: "", notes: "",
      });
      setAdding(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const input = "rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {filtered.length} of {initialPocs.length} contact{initialPocs.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setAdding((a) => !a)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#E8521A] text-white rounded-lg hover:bg-[#E8521A]/90 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" /> Add POC
        </button>
      </div>

      {adding && (
        <Card>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">First name *</label>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={`${input} w-full mt-1`} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Surname</label>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={`${input} w-full mt-1`} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Council</label>
              <input list="council-list" value={form.council} onChange={(e) => setForm({ ...form, council: e.target.value })} className={`${input} w-full mt-1`} placeholder="e.g. COT" />
              <datalist id="council-list">
                {MUNICIPALITIES.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-500">Department</label>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={`${input} w-full mt-1`} placeholder="e.g. Rates Clearance" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${input} w-full mt-1`} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Cell</label>
              <input value={form.cell} onChange={(e) => setForm({ ...form, cell: e.target.value })} className={`${input} w-full mt-1`} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Tel</label>
              <input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} className={`${input} w-full mt-1`} placeholder="Office / landline" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Job title</label>
              <input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className={`${input} w-full mt-1`} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Region</label>
              <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={`${input} w-full mt-1`} placeholder="e.g. Tshwane North" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Birthday</label>
              <input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className={`${input} w-full mt-1`} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500">Office description</label>
              <input value={form.office_description} onChange={(e) => setForm({ ...form, office_description: e.target.value })} className={`${input} w-full mt-1`} placeholder="e.g. Rates hall, 2nd floor, Room 214" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500">Comments</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={`${input} w-full mt-1 resize-none`} />
            </div>
            <div className="sm:col-span-2 flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90 disabled:opacity-50">
                {saving ? "Saving…" : "Save POC"}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Council</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Region / branch</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Department</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Cell</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3"><span className="font-medium text-gray-900">{councilPocName(p)}</span></td>
                  {/* Councils are stored as codes (COT/COJ/COE). A directory is
                      read by people, so show the name and keep the code as the
                      value the filters match on. */}
                  <td className="px-5 py-3 text-gray-600">{p.council ? municipalityLabel(p.council) : "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{p.region ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{p.department ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{p.email ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{p.cell ?? "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/council-pocs/${p.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">
                      Contact card
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                    {initialPocs.length === 0
                      ? "No council POCs yet — add one above."
                      : "No POCs match your filters — try clearing them."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
