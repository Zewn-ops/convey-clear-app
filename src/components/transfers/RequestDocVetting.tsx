import { Check, AlertCircle } from "lucide-react";
import { serviceDocSlots, type ServiceDocSlot } from "@/lib/service-doc-slots";
import { serviceLabel } from "@/lib/councils/types";

/**
 * What the firm has actually sent, against what the services it chose require —
 * shown beside the approve / send-back decision.
 *
 * Jukka, 2026-09-15: "the nice thing is, before we actually accept the transfer,
 * we can automatically vet the documents that has been uploaded up to that
 * point."
 *
 * 🔴 IT DOES NOT GATE ANYTHING. A staff member reads this and decides; nothing
 * here blocks an approval. That is deliberate and it is the standing rule on
 * this screen — the same reason §114's prerequisite ordering is displayed and
 * never enforced. A transfer arriving without a certified ID is often fine, and
 * a portal that refuses it teaches people to work around the portal.
 *
 * WHY ONLY THE CHOSEN SERVICES. Every transfer carries all nine checklist lines,
 * but only the ones marked `needed` are work anyone has asked for. Counting the
 * documents of a service nobody chose would report a transfer as incomplete
 * forever.
 *
 * ⚠️ 12 of 33 council/service combinations had NO document list at all on
 * 2026-09-17. For those this panel can only say so — see the audit workbook.
 * Silence would read as "nothing needed", which is a different claim.
 */
export interface VettingService {
  serviceCode: string;
  prcStage?: string | null;
}

export default function RequestDocVetting({
  municipality,
  services,
  heldTypes,
}: {
  municipality: string | null;
  /** The transfer's CHOSEN service lines. */
  services: VettingService[];
  /** document_type of everything currently on the draft transfer. */
  heldTypes: string[];
}) {
  if (services.length === 0) {
    return (
      <p className="text-xs text-ink-3">
        No services chosen yet, so there is nothing to check the documents against.
      </p>
    );
  }

  const held = new Set(heldTypes);
  const rows = services.map((s) => {
    // The catch-all is dropped: "Something else" can never be missing, so
    // counting it would make every service permanently one short.
    const slots: ServiceDocSlot[] = serviceDocSlots(municipality, s.serviceCode, s.prcStage).filter(
      (sl) => sl.type !== "other"
    );
    // Count against the REQUIRED ones only. Counting every slot and then listing
    // only the required ones read as "0 of 8 — still needs [six things]", which
    // invites the question about the other two. Optional documents are collected
    // when available and never block, so they do not belong in a completeness
    // figure at all.
    const required = slots.filter((sl) => !sl.optional);
    const missing = required.filter((sl) => !held.has(sl.type));
    return {
      label: [serviceLabel(s.serviceCode), s.prcStage].filter(Boolean).join(": "),
      total: required.length,
      have: required.length - missing.length,
      missing,
      unmapped: slots.length === 0,
    };
  });

  const anyMissing = rows.some((r) => r.missing.length > 0);

  return (
    <div className="rounded-lg border border-line px-3.5 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">
        {anyMissing ? (
          <AlertCircle className="h-3.5 w-3.5 text-required" />
        ) : (
          <Check className="h-3.5 w-3.5 text-ok" strokeWidth={3} />
        )}
        What they have sent
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="text-[13px]">
            <span className="text-ink">{r.label}</span>{" "}
            {r.unmapped ? (
              <span className="text-ink-3">— no document list recorded for this council yet</span>
            ) : (
              <>
                <span
                  className={
                    "tabular-nums font-medium " +
                    (r.missing.length === 0 ? "text-ok" : "text-required")
                  }
                >
                  {r.have} of {r.total}
                </span>
                {r.missing.length > 0 && (
                  <span className="text-ink-3">
                    {" "}
                    — still needs {r.missing.map((m) => m.label).join(", ")}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-3">
        For information — you can still accept this transfer with documents outstanding.
      </p>
    </div>
  );
}
