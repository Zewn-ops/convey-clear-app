"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Landmark, Plus, X, ExternalLink } from "lucide-react";
import Card from "@/components/ui/Card";
import { MUNICIPALITIES } from "@/lib/conveyclear-lists";
import { municipalityLabel } from "@/lib/utils";
import { councilPocName, type CouncilPoc } from "@/types";

// B5 / Theme G — Council POC section on the staff matter detail (admin portal
// only). Lists the POCs linked to this matter, lets staff assign an existing
// directory POC or add a new one (saved to the directory + linked), unlink, and
// jump to each POC's contact card. Multiple POCs per matter.
export default function MatterPocsCard({
  matterId,
  linked,
  all,
  municipality = null,
}: {
  matterId: string;
  linked: CouncilPoc[];
  all: CouncilPoc[];
  /** The matter's own council, so its contacts lead the picker. */
  municipality?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [assignId, setAssignId] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", council: "", department: "", email: "", cell: "",
  });

  const linkedIds = useMemo(() => new Set(linked.map((p) => p.id)), [linked]);
  const assignable = useMemo(() => all.filter((p) => !linkedIds.has(p.id)), [all, linkedIds]);

  // The directory is one flat list across all three councils, and the picker
  // offered it in council order with nothing to say which council this MATTER
  // belongs to. That is how a City of Johannesburg matter came to carry a City
  // of Tshwane rates manager on production (2026-09-10), with no warning on
  // either screen.
  //
  // Grouped rather than filtered: the directory is small, a council can be
  // recorded loosely, and hiding a contact outright is how someone ends up
  // unable to link the person they are actually emailing. Picking one from
  // another council stays possible — it just stops being the accident.
  const councilName = municipality ? municipalityLabel(municipality) : null;
  const isOwnCouncil = (p: CouncilPoc) =>
    Boolean(councilName && (p.council ?? "").trim().toLowerCase() === councilName.toLowerCase());
  const ownCouncilPocs = useMemo(
    () => (councilName ? assignable.filter(isOwnCouncil) : assignable),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignable, councilName]
  );
  const otherCouncilPocs = useMemo(
    () => (councilName ? assignable.filter((p) => !isOwnCouncil(p)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignable, councilName]
  );

  const input = "rounded-lg border border-line bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action";

  async function assign() {
    if (!assignId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/council-pocs/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matter_id: matterId, council_poc_id: assignId }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not assign");
      toast.success("POC assigned");
      setAssignId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function unlink(pocId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/council-pocs/link?matter_id=${matterId}&council_poc_id=${pocId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not remove");
      toast.success("Removed from matter");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addNew(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) return toast.error("A first name is required");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/council-pocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, matter_id: matterId }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.message ?? "Could not add");
      toast.success("POC added & linked");
      setForm({ first_name: "", last_name: "", council: "", department: "", email: "", cell: "" });
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card accent="internal">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-ink flex items-center gap-2">
          <Landmark className="h-4 w-4 text-action" /> Council POC{linked.length === 1 ? "" : "s"} ({linked.length})
        </h2>
      </div>

      {linked.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {linked.map((p) => (
            <div key={p.id} className="rounded-lg bg-raised shadow-sm dark:ring-1 dark:ring-line p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-ink">{councilPocName(p)}</p>
                <button onClick={() => unlink(p.id)} disabled={busy} title="Remove from this matter" className="text-ink-3 hover:text-red-600 disabled:opacity-50">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-ink-3 mt-0.5">{[p.council, p.department].filter(Boolean).join(" · ") || "—"}</p>
              {councilName && p.council && !isOwnCouncil(p) && (
                <p className="mt-1 text-[11px] text-waiting">Not a {councilName} contact</p>
              )}
              <dl className="mt-2 space-y-1 text-xs">
                {p.email && <dd><span className="text-ink-3">Email:</span> <a href={`mailto:${p.email}`} className="text-action hover:underline">{p.email}</a></dd>}
                {p.cell && <dd><span className="text-ink-3">Cell:</span> <a href={`tel:${p.cell}`} className="text-action hover:underline">{p.cell}</a></dd>}
              </dl>
              <Link href={`/admin/council-pocs/${p.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline mt-2">
                <ExternalLink className="h-3 w-3" /> Contact card
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3 mb-4">No council contact linked yet.</p>
      )}

      {/* Assign an existing directory POC */}
      {assignable.length > 0 && (
        <div className="flex gap-2 mb-3">
          <select value={assignId} onChange={(e) => setAssignId(e.target.value)} className={`${input} flex-1`}>
            <option value="">— Assign an existing POC —</option>
            {councilName ? (
              <>
                <optgroup label={councilName}>
                  {ownCouncilPocs.length > 0 ? (
                    ownCouncilPocs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {councilPocName(p)}{p.department ? ` · ${p.department}` : ""}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      No contacts recorded for this council yet
                    </option>
                  )}
                </optgroup>
                {otherCouncilPocs.length > 0 && (
                  <optgroup label="Other councils">
                    {otherCouncilPocs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {councilPocName(p)}{p.council ? ` (${p.council})` : ""}{p.department ? ` · ${p.department}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              assignable.map((p) => (
                <option key={p.id} value={p.id}>
                  {councilPocName(p)}{p.council ? ` (${p.council})` : ""}{p.department ? ` · ${p.department}` : ""}
                </option>
              ))
            )}
          </select>
          <button onClick={assign} disabled={busy || !assignId} className="px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50">
            Assign
          </button>
        </div>
      )}

      {/* Add a brand-new POC (saved to the directory + linked here) */}
      {adding ? (
        <form onSubmit={addNew} className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-line pt-3">
          <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="First name *" className={input} />
          <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Surname" className={input} />
          <input list="matter-poc-council" value={form.council} onChange={(e) => setForm({ ...form, council: e.target.value })} placeholder="Council (e.g. COT)" className={input} />
          <datalist id="matter-poc-council">{MUNICIPALITIES.map((m) => <option key={m} value={m} />)}</datalist>
          <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Department" className={input} />
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={input} />
          <input value={form.cell} onChange={(e) => setForm({ ...form, cell: e.target.value })} placeholder="Cell" className={input} />
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50">
              {busy ? "Saving…" : "Add & link"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-sm font-medium text-ink-3 hover:text-ink">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-action hover:underline">
          <Plus className="h-4 w-4" /> Add a new POC
        </button>
      )}
    </Card>
  );
}
