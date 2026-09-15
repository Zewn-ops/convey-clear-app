"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { PRIORITY_LABELS, type MatterPriority } from "@/types";

/**
 * The firm's side of opening a matter: what it is about, and how urgent.
 *
 * ⚠️ THE PRIORITIES OFFERED HERE ARE A SUBSET, ON PURPOSE.
 *
 * matters.priority already accepts six values and has since migration 003 —
 * priority, standard, emerging, complex, urgent, whale. Four of those are
 * ConveyClear's own vocabulary for sizing a piece of work; "Whale" and
 * "Emerging" say something about the commercial shape of a client, not about
 * how soon an attorney needs an answer, and putting them in front of a firm
 * invites them to grade themselves.
 *
 * Marlene asked for "a priority of urgent or important or whatever". These
 * three are that, spelled in words an attorney would use, and every one of them
 * is an EXISTING stored value — no CHECK is touched. Adding a value to a status
 * or priority CHECK is what broke submission on 089 and send-back on 090.
 */
const FIRM_PRIORITIES: MatterPriority[] = ["standard", "priority", "urgent"];

/** What each choice actually means to the person picking it. */
const PRIORITY_HINT: Partial<Record<MatterPriority, string>> = {
  standard: "Normal turnaround.",
  priority: "Ahead of standard work.",
  urgent: "There is a deadline on this.",
};

export default function SubmitMatterForm({
  transferId,
  transferReference,
  serviceCode,
  serviceLabel,
  prcStage,
  backHref,
}: {
  transferId: string;
  transferReference: string;
  serviceCode: string;
  serviceLabel: string;
  prcStage?: string | null;
  backHref: string;
}) {
  const router = useRouter();
  const [priority, setPriority] = useState<MatterPriority>("standard");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await fetch("/api/partner/matters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transfer_id: transferId,
        service_code: serviceCode,
        service_subtype: prcStage ?? null,
        priority,
        notes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaving(false);
      toast.error(json.message ?? "Could not send this to ConveyClear");
      return;
    }
    toast.success("Sent to ConveyClear for review");
    // 🔴 saving STAYS true through the navigation. The transfer page is
    // force-dynamic and took more than six seconds to render on production,
    // during which this button read "Send to ConveyClear" again on a form that
    // still had every word in it — so the obvious thing to do was press it
    // again. The server refuses the duplicate, but the attorney has no way to
    // know that from here, and a second matter is exactly what it looks like.
    // Back to the transaction, where the service line now shows the matter and
    // its awaiting-review chip. Landing on the matter itself would show a page
    // that is deliberately half-inert until someone here accepts it.
    router.push(backHref);
    router.refresh();
  }

  return (
    <Card>
      <p className="mb-4 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">
        Open this matter
      </p>

      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-medium text-ink-2">Service</p>
          <p className="text-sm text-ink">{serviceLabel}</p>
        </div>
        <div>
          <p className="text-[13px] font-medium text-ink-2">On transaction</p>
          <p className="text-sm text-ink">{transferReference}</p>
        </div>

        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as MatterPriority)}
          options={FIRM_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
        />
        <p className="-mt-2 text-xs text-ink-3">{PRIORITY_HINT[priority]}</p>

        <div>
          <label className="block text-[13px] font-medium text-ink-2" htmlFor="matter-background">
            Background
          </label>
          <textarea
            id="matter-background"
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything we should know before we start — deadlines, who to contact, what has already been tried."
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
          />
        </div>
        {/* Marlene: "the notes are important since there's always a story with a
            matter." Said here so the field reads as the point rather than as an
            optional extra nobody fills in. */}
        <p className="-mt-2 text-xs text-ink-3">
          There is usually a story behind a matter. Tell us the part we would otherwise have to ask
          about.
        </p>

        <Button onClick={submit} disabled={saving} className="w-full">
          {saving ? "Sending…" : "Send to ConveyClear"}
        </Button>

        <p className="text-xs text-ink-3">
          ConveyClear reviews what you have sent and either takes the matter on or comes back to you.
          You will see it on this transaction either way.
        </p>
      </div>
    </Card>
  );
}
