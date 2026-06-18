"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, Search } from "lucide-react";
import Card from "@/components/ui/Card";
import { MUNICIPALITIES } from "@/lib/conveyclear-lists";
import { councilPocName, type CouncilPoc } from "@/types";

// B5 / Theme G — Council POC directory: searchable table + inline "Add POC".
// Staff-only contact book of the people ConveyClear deals with at each council.
export default function CouncilPocManager({ initialPocs }: { initialPocs: CouncilPoc[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", cell: "", council: "", department: "",
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return initialPocs;
    return initialPocs.filter((p) =>
      [councilPocName(p), p.council, p.department, p.email, p.cell]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(t))
    );
  }, [q, initialPocs]);

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
      setForm({ first_name: "", last_name: "", email: "", cell: "", council: "", department: "" });
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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, council, department…"
            className={`${input} w-full pl-9`}
          />
        </div>
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
                  <td className="px-5 py-3 text-gray-600">{p.council ?? "—"}</td>
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
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                    {initialPocs.length === 0 ? "No council POCs yet — add one above." : "No POCs match your search."}
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
