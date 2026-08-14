"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Send } from "lucide-react";

/**
 * A firm asks ConveyClear to open a property transfer (055).
 *
 * Replaces the direct-create form. Parties are captured as free text on
 * purpose: the firm cannot create client records — ConveyClear resolves these
 * names against its own database so one client does not end up as three. That
 * is the whole reason creation moved behind ConveyClear (Meeting 2, §84).
 *
 * The property description and the firm's own transfer reference are required
 * (2026-08-11 §78) — the reference becomes the transfer's. Nothing else is: a
 * firm phoning in a new mandate often has the erf number and little else, and a
 * form that demands the buyer's cell number before it will submit is a form they
 * will not use.
 *
 * ⚠️ Keep the parties optional. Two pending requests showing "Seller / Buyer:
 * Not supplied" was recorded on 2026-08-11 as CORRECT — firms supply what they
 * know. The mandatory pair was a deliberate, bounded addition to that intake;
 * it should not creep further.
 */
const MUNICIPALITIES = [
  { value: "", label: "— Not sure —" },
  { value: "COT", label: "City of Tshwane" },
  { value: "COJ", label: "City of Johannesburg" },
  { value: "COE", label: "City of Ekurhuleni" },
  { value: "OTHER", label: "Other" },
];

export default function TransferRequestForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    property_description: "",
    municipality: "",
    suggested_reference: "",
    seller_name: "",
    seller_email: "",
    seller_cell: "",
    buyer_name: "",
    buyer_email: "",
    buyer_cell: "",
    notes: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.property_description.trim()) {
      toast.error("Describe the property — an erf number or address.");
      return;
    }
    if (!form.suggested_reference.trim()) {
      toast.error("Your transfer reference is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/partner/transfer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not send that request.");
        return;
      }
      toast.success("Request sent to ConveyClear.");
      router.push("/partner/transfers");
      router.refresh();
    } catch {
      toast.error("Could not send that request.");
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
        <p className="text-xs font-semibold text-ink uppercase tracking-wide">The property</p>
        <label className={label}>
          Property description <span className="text-required">*</span>
          <input
            className={input}
            value={form.property_description}
            onChange={set("property_description")}
            placeholder="ERF 345, 12 Oak Avenue, Valhalla"
            required
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Municipality
            <select className={input} value={form.municipality} onChange={set("municipality")}>
              {MUNICIPALITIES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Your transfer reference <span className="text-required">*</span>
            <input
              className={input}
              value={form.suggested_reference}
              onChange={set("suggested_reference")}
              placeholder="e.g. SH-2026-0417"
              required
            />
            {/* Mandatory since 2026-08-11 (§78). Said plainly because it is the
                firm's own code being adopted as ours — they should know it is
                the name this transfer will carry, not a note for our reference. */}
            <span className="mt-1 block text-[11px] font-normal text-ink-3">
              Your own file reference. This becomes the reference for the transfer.
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-raised p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-ink uppercase tracking-wide">The parties</p>
          <p className="text-xs text-ink-3 mt-1">
            As much as you have. ConveyClear creates the client records and will come back to you
            for anything missing.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Seller
            <input className={input} value={form.seller_name} onChange={set("seller_name")} />
          </label>
          <label className={label}>
            Seller email
            <input type="email" className={input} value={form.seller_email} onChange={set("seller_email")} />
          </label>
          <label className={label}>
            Seller cell
            <input className={input} value={form.seller_cell} onChange={set("seller_cell")} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Buyer
            <input className={input} value={form.buyer_name} onChange={set("buyer_name")} />
          </label>
          <label className={label}>
            Buyer email
            <input type="email" className={input} value={form.buyer_email} onChange={set("buyer_email")} />
          </label>
          <label className={label}>
            Buyer cell
            <input className={input} value={form.buyer_cell} onChange={set("buyer_cell")} />
          </label>
        </div>
      </div>

      <label className={label}>
        Anything else we should know
        <textarea rows={3} className={input} value={form.notes} onChange={set("notes")} />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="h-4 w-4" />
        {busy ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
