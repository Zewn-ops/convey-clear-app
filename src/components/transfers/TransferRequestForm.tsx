"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Send, Save } from "lucide-react";

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

export interface TransferRequestDraft {
  id: string;
  property_description: string | null;
  municipality: string | null;
  suggested_reference: string | null;
  seller_name: string | null;
  seller_email: string | null;
  seller_cell: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_cell: string | null;
  notes: string | null;
}

export default function TransferRequestForm({
  draft,
}: {
  /**
   * An existing draft being finished (078). Zewn, 2026-08-31: "if they get
   * halfway with a request and want to return later they can draft it and
   * finish it later on."
   */
  draft?: TransferRequestDraft | null;
} = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    property_description: draft?.property_description ?? "",
    municipality: draft?.municipality ?? "",
    suggested_reference: draft?.suggested_reference ?? "",
    seller_name: draft?.seller_name ?? "",
    seller_email: draft?.seller_email ?? "",
    seller_cell: draft?.seller_cell ?? "",
    buyer_name: draft?.buyer_name ?? "",
    buyer_email: draft?.buyer_email ?? "",
    buyer_cell: draft?.buyer_cell ?? "",
    notes: draft?.notes ?? "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /**
   * One writer for both buttons.
   *
   * The required-field checks apply to SUBMISSION only — a draft that cannot
   * be saved until it is complete is not a draft. 078 says the same thing in
   * the database with conditional CHECKs, so these are the readable message
   * rather than the boundary.
   */
  async function save(asDraft: boolean) {
    if (!asDraft) {
      if (!form.property_description.trim()) {
        toast.error("Describe the property — an erf number or address.");
        return;
      }
      if (!form.suggested_reference.trim()) {
        toast.error("Your transfer reference is required.");
        return;
      }
    }
    setBusy(true);
    try {
      const r = await fetch("/api/partner/transfer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          status: asDraft ? "draft" : "pending",
          // Present when finishing a draft, so the row is updated rather than
          // a second one created.
          id: draft?.id,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Could not save that.");
        return;
      }
      toast.success(
        asDraft ? "Draft saved — finish it whenever." : "Request sent to ConveyClear."
      );
      // 🔴 STRAIGHT TO THE TRANSFER, not back to the list.
      //
      // Since 083 a submitted request creates its transfer immediately, in
      // draft, and that page is where documents are uploaded. Jukka call,
      // 2026-09-01 — Zewn: "I'll add the document upload option to the request,
      // but we're not going to make any of it required", and the reason a firm
      // wants it: "maybe they're waiting on one or two documents to still come
      // through … they can still go in and upload to that transfer while it's in
      // draft state."
      //
      // A second upload pipeline on this form would have had nowhere to put the
      // files until the transfer existed, and then would have had to move them.
      // Landing the attorney on the transfer they just created is the same
      // outcome with one place that owns documents.
      router.push(j.transfer_id ? `/partner/transfers/${j.transfer_id}` : "/partner/transfers");
      router.refresh();
    } catch {
      toast.error("Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await save(false);
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
          {busy ? "Sending…" : "Send request"}
        </button>

        {/* type="button", so the browser's own `required` validation never
            fires on this path — the whole point is saving something
            incomplete. Both required fields keep their native validation for
            "Send request", where it belongs. */}
        <button
          type="button"
          onClick={() => save(true)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-raised disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          Save as draft
        </button>

        <p className="text-xs text-ink-3">
          A draft stays with your firm — ConveyClear does not see it until you
          send it.
        </p>
      </div>
    </form>
  );
}
