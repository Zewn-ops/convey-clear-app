"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ShieldCheck, ShieldAlert, Paperclip } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import type { TransferConsentStatus } from "@/lib/transfer-consent";

/**
 * POPIA consent for a transaction, given once and covering every matter on it.
 *
 * Zewn, 2026-09-19: *"we need the POPIA consent to stand out more and prevent
 * ConveyClear from moving forward … required field on a matter with the option
 * to upload a PDF but the PDF isn't required … make it part of the property
 * transfer and state that it is therefore giving us POPIA consent for any
 * matters related to that transfer."*
 *
 * ── WHY THIS CARD SHOUTS AND THE REST OF THE PORTAL DOES NOT ───────────────
 *
 * PRODUCT.md's register is "plain, specific, unhurried … confidence comes from
 * precision, never from enthusiasm", and almost nothing in this product gets a
 * coloured panel. This does, because it is the one control on the page that
 * STOPS WORK. An outstanding consent that looked like every other incomplete
 * field is exactly what it looked like before — a line reading "Consent
 * outstanding" inside a collapsed panel, on one party, on one matter — and the
 * work carried on around it for weeks.
 *
 * The colour is the portal's own danger token when it blocks and ok when it does
 * not, so it reads as the same vocabulary the service circles use, rather than
 * as a new alarm language invented for this card.
 *
 * ── WHAT THE ATTORNEY IS ACTUALLY SIGNING ──────────────────────────────────
 *
 * Not "I consent" — they are not the data subject. "This firm holds consent from
 * these named people." The wording says so, because a compliance record whose
 * meaning is ambiguous is worth less than no record: if it ever matters, what
 * matters is exactly what was claimed.
 */
export default function PopiaConsentCard({
  transferId,
  status,
  reference,
  canAttest,
  documents = [],
}: {
  transferId: string;
  status: TransferConsentStatus;
  /** Named in the covering sentence, so it is concrete about WHICH transaction. */
  reference: string | null;
  /**
   * Firms on the transfer and ConveyClear staff. A read-only viewer still SEES
   * the state — the gate is not a secret, and someone who cannot act on it still
   * needs to know why a matter will not move.
   */
  canAttest: boolean;
  /** Transfer documents offered as the optional signed-form evidence. */
  documents?: { id: string; file_name: string | null }[];
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(status.parties.filter((p) => p.granted).map((p) => p.partyId))
  );
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);

  const alreadyGranted = new Set(status.parties.filter((p) => p.granted).map((p) => p.partyId));
  // Array.from rather than spread: tsconfig targets ES5 here, where spreading a
  // Set does not downlevel.
  const toGrant = Array.from(ticked).filter((id) => !alreadyGranted.has(id));
  const toWithdraw = Array.from(alreadyGranted).filter((id) => !ticked.has(id));
  const dirty = toGrant.length > 0 || toWithdraw.length > 0;

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/transfers/popia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transfer_id: transferId,
        granted_party_ids: toGrant,
        withdrawn_party_ids: toWithdraw,
        evidence_document_id: evidence || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast.error(json.message ?? "Could not record the consent");
    toast.success(toGrant.length ? "POPIA consent recorded" : "POPIA consent withdrawn");
    router.refresh();
  };

  // No seller or buyer yet. Say what is missing and why the card is here at all,
  // rather than rendering an empty tick list that looks satisfied.
  if (status.noParties) {
    return (
      <Card className="border-l-4 border-waiting-fill">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-waiting" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">POPIA consent</h2>
            <p className="mt-1 text-sm text-ink-2">
              Capture the seller and the buyer first. Consent is recorded against the people whose
              information we process, so there is nothing to record until they are named.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const blocking = !status.complete;

  return (
    <Card className={blocking ? "border-l-4 border-danger-fill" : "border-l-4 border-ok-fill"}>
      <div className="flex items-start gap-3">
        {blocking ? (
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
        ) : (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">POPIA consent</h2>

          {blocking ? (
            <p className="mt-1 text-sm font-medium text-danger">
              ConveyClear cannot work any matter on this transaction until this is recorded.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-2">
              Recorded. This covers every matter opened under{" "}
              <span className="font-medium text-ink">{reference ?? "this transaction"}</span>.
            </p>
          )}

          <p className="mt-3 text-sm text-ink-2">
            {canAttest
              ? "Confirm that this firm holds POPIA consent from each person below, permitting ConveyClear to process their personal information for every matter on this transaction."
              : "The instructing firm confirms it holds POPIA consent from each person below."}
          </p>

          <ul className="mt-3 space-y-2">
            {status.parties.map((p) => {
              const on = ticked.has(p.partyId);
              return (
                <li key={p.partyId}>
                  <label
                    className={
                      "flex items-start gap-2.5 rounded-lg border px-3 py-2 " +
                      (canAttest ? "cursor-pointer " : "") +
                      (on ? "border-ok bg-ok-tint" : "border-line bg-surface")
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-ok"
                      checked={on}
                      disabled={!canAttest || saving}
                      onChange={(e) => {
                        setTicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.partyId);
                          else next.delete(p.partyId);
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-ink">{p.name}</span>
                      <span className="text-ink-3"> · {p.role}</span>
                      {p.granted && p.at && (
                        <span className="block text-xs text-ink-3">
                          Confirmed {new Date(p.at).toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {canAttest && (
            <>
              {/* OPTIONAL, and it says so on the label rather than in a hint
                  nobody reads. Zewn: "with the option to upload a PDF but the
                  PDF isn't required." A firm holding a signed mandate often has
                  nothing separate to attach, and refusing the attestation over a
                  missing file would stop work on a properly consented file. */}
              {documents.length > 0 && (
                <div className="mt-3 flex items-end gap-2">
                  <Paperclip className="mb-2.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Select
                      label="Signed consent form (optional)"
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                      options={[
                        { value: "", label: "— None attached —" },
                        ...documents.map((d) => ({
                          value: d.id,
                          label: d.file_name ?? "Untitled document",
                        })),
                      ]}
                    />
                  </div>
                </div>
              )}
              {documents.length === 0 && (
                <p className="mt-3 text-xs text-ink-3">
                  Upload the signed consent form to this transaction&rsquo;s documents if you have one —
                  it is not required.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={save} disabled={!dirty || saving}>
                  {saving
                    ? "Saving…"
                    : toWithdraw.length && !toGrant.length
                      ? "Withdraw consent"
                      : "Record consent"}
                </Button>
                {toWithdraw.length > 0 && (
                  <p className="text-xs text-danger">
                    Withdrawing consent stops work on every matter under this transaction.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
