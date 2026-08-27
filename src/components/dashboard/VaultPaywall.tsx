import { Lock, ArrowRight } from "lucide-react";

/**
 * The gate that stands where a client's FICA vault would be.
 *
 * See lib/vault-gate.ts for why this exists, why it is off by default, and why
 * the attorney's upload path must never sit behind it.
 *
 * ⚠️ THIS TAKES NO MONEY. The button goes nowhere; there is no provider, no
 * price and no subscription record. It renders the shape of a gate so the flow
 * can be judged.
 *
 * TONE. This is legal and municipal work, and PRODUCT.md is explicit: confidence
 * comes from precision, never enthusiasm. No urgency, no "unlock", no crossed-out
 * price. It says what the vault does, what it costs you not to have it, and —
 * the part that matters most — that nothing is blocked meanwhile. A client who
 * reads this and concludes their transfer has stalled would be worse off than a
 * client who never saw it.
 */
export default function VaultPaywall({ entityName }: { entityName: string }) {
  return (
    <div className="rounded-lg border border-line bg-raised px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-action-fill/10 p-2">
          <Lock className="h-4 w-4 text-action" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">FICA vault</p>
          <p className="mt-1 text-[13px] text-ink-2">
            Keep {entityName}&rsquo;s certified ID, proof of address and authority documents on file
            once, and reuse them on every transaction instead of sending them again each time.
          </p>

          {/* The reassurance is the most important line on this card. */}
          <p className="mt-3 rounded border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-2">
            Nothing is on hold. Your attorney can upload whatever this transfer needs directly onto
            it, whether or not the vault is set up.
          </p>

          <button
            type="button"
            disabled
            className="mt-3.5 inline-flex items-center gap-1.5 rounded bg-action-fill px-3.5 py-2 text-[13px] font-semibold text-white opacity-90"
          >
            Set up the vault <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <p className="mt-2 text-[11px] text-ink-3">
            Preview only — this does not take payment and no subscription exists yet.
          </p>
        </div>
      </div>
    </div>
  );
}
