"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import { Check, Mail, Phone, Undo2 } from "lucide-react";

/**
 * What the attorney originally typed when they asked for this transfer.
 *
 * Zewn, 2026-08-26: after approving a request, those seller and buyer details
 * vanished — the queue shows only what is pending and the transfer never looked
 * back at where it came from. They are usually the ONLY contact details anyone
 * has at that point, and they are what staff work from to capture the parties.
 *
 * Also the meeting's next-step §56, "an attorney information section under the
 * parties tab to display details provided by the lawyer", reached from the other
 * direction.
 *
 * 🔴 Dismissing HIDES, it never deletes. §84 makes the client record canonical
 * and the attorney's input the thing it was derived from, so this is provenance:
 * the record of who said what. It stays in the database and can be brought back.
 */

export interface HandoverRequest {
  id: string;
  suggested_reference: string | null;
  property_description: string | null;
  seller_name: string | null;
  seller_email: string | null;
  seller_cell: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_cell: string | null;
  // 088 — what staff CHECK against the FICA documents. Jukka, 2026-09-02: "we
  // can have our staff double check that the details that they typed in is
  // actually corresponding with their supporting documents … let's say they put
  // in a six instead of a nine, we can fix that and approve it." That comparison
  // is only possible if the typed number is on the screen beside the document.
  seller_entity_type?: string | null;
  buyer_entity_type?: string | null;
  seller_id_number?: string | null;
  buyer_id_number?: string | null;
  seller_registration_no?: string | null;
  buyer_registration_no?: string | null;
  seller_extra_emails?: string[] | null;
  buyer_extra_emails?: string[] | null;
  seller_directors?: HandoverDirector[] | null;
  buyer_directors?: HandoverDirector[] | null;
  notes: string | null;
  created_at: string;
  details_dismissed_at: string | null;
  firms?: { name: string | null } | null;
  // The member who lodged the request (§92). The seller and buyer below are
  // people we have to chase; this is the person who can answer a question about
  // them, and until now the card described what the firm typed without saying
  // who at the firm typed it.
  requester?: { full_name: string | null; email: string | null; phone: string | null } | null;
}

export interface HandoverDirector {
  name?: string | null;
  id_number?: string | null;
  cell?: string | null;
  email?: string | null;
}

const ENTITY_LABEL: Record<string, string> = {
  natural_person: "Individual",
  business: "Business",
  trust: "Trust",
};

function Party({
  label,
  name,
  email,
  cell,
  entityType,
  idNumber,
  registrationNo,
  extraEmails,
  directors,
}: {
  label: string;
  name: string | null;
  email: string | null;
  cell: string | null;
  entityType?: string | null;
  idNumber?: string | null;
  registrationNo?: string | null;
  extraEmails?: string[] | null;
  directors?: HandoverDirector[] | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      {name || email || cell ? (
        <>
          {name && <p className="truncate text-sm font-medium text-ink">{name}</p>}
          {/* mailto/tel rather than plain text: the entire purpose of this card is
              that someone acts on these, and a number you must retype is friction
              at exactly the wrong moment. */}
          {email && (
            <a
              href={`mailto:${email}`}
              className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-action hover:underline"
            >
              <Mail className="h-3 w-3 shrink-0" /> {email}
            </a>
          )}
          {(extraEmails ?? []).map((addr) => (
            <a
              key={addr}
              href={`mailto:${addr}`}
              className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-action hover:underline"
            >
              <Mail className="h-3 w-3 shrink-0" /> {addr}
            </a>
          ))}
          {cell && (
            <a
              href={`tel:${cell.replace(/\s/g, "")}`}
              className="mt-0.5 flex items-center gap-1.5 text-xs text-action hover:underline"
            >
              <Phone className="h-3 w-3 shrink-0" /> {cell}
            </a>
          )}
          {/* The identifying number, and what kind of thing it identifies. This
              is the line a staff member reads off the certified ID or the CIPC
              document — so it is monospaced and selectable rather than pretty:
              the six-instead-of-a-nine case is why it is here at all. */}
          {(entityType || idNumber || registrationNo) && (
            <p className="mt-1 text-xs text-ink-3">
              {entityType ? ENTITY_LABEL[entityType] ?? entityType : "Type not given"}
              {(idNumber || registrationNo) && (
                <>
                  {" · "}
                  <span className="mono select-all text-ink-2">{idNumber || registrationNo}</span>
                </>
              )}
            </p>
          )}
          {(directors ?? []).length > 0 && (
            <div className="mt-2 space-y-1 border-l-2 border-line pl-2.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                Directors
              </p>
              {(directors ?? []).map((d, i) => (
                <p key={i} className="text-xs text-ink-2">
                  {d.name || "Unnamed"}
                  {d.id_number && (
                    <>
                      {" · "}
                      <span className="mono select-all">{d.id_number}</span>
                    </>
                  )}
                  {d.cell && ` · ${d.cell}`}
                  {d.email && ` · ${d.email}`}
                </p>
              ))}
            </div>
          )}
        </>
      ) : (
        // "Not supplied" rather than nothing: an empty space and "the firm did
        // not tell us" look identical, and only one of them is actionable.
        <p className="text-sm italic text-ink-3">Not supplied</p>
      )}
    </div>
  );
}

export default function RequestHandover({ request }: { request: HandoverRequest }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const dismissed = Boolean(request.details_dismissed_at);

  async function setDismissed(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/transfer-requests/handover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, dismissed: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.message ?? "That did not work.");
        return;
      }
      toast.success(next ? "Details marked as used." : "Details restored.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Once used, it collapses to a single line rather than disappearing — the
  // point is that this information must remain reachable, and a card that
  // vanishes entirely is the problem Zewn reported, not the fix.
  if (dismissed) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-xs text-ink-3">
          Attorney&rsquo;s original request details — marked as used.
        </p>
        <button
          disabled={busy}
          onClick={() => setDismissed(false)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-action hover:underline disabled:opacity-50"
        >
          <Undo2 className="h-3.5 w-3.5" /> Show again
        </button>
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
            Information provided by the attorney
          </p>
          <p className="mt-1 text-xs text-ink-3">
            What {request.firms?.name ?? "the firm"} typed when they requested this transfer. Use it to
            capture the parties, then mark it used.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => setDismissed(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded bg-action-fill px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Mark as used
        </button>
      </div>

      {/* Above the seller and buyer, not beside them: they are parties to the
          transaction and this is the person acting for the firm. It also answers
          §56's "attorney information section" — reached from the request rather
          than typed again. */}
      {request.requester && (
        <div className="border-b border-line bg-raised px-5 py-4">
          <Party
            label="Attorney handling this"
            name={request.requester.full_name}
            email={request.requester.email}
            cell={request.requester.phone}
          />
        </div>
      )}

      <div className="grid gap-5 px-5 py-4 sm:grid-cols-2">
        <Party
          label="Seller"
          name={request.seller_name}
          email={request.seller_email}
          cell={request.seller_cell}
          entityType={request.seller_entity_type}
          idNumber={request.seller_id_number}
          registrationNo={request.seller_registration_no}
          extraEmails={request.seller_extra_emails}
          directors={request.seller_directors}
        />
        <Party
          label="Buyer"
          name={request.buyer_name}
          email={request.buyer_email}
          cell={request.buyer_cell}
          entityType={request.buyer_entity_type}
          idNumber={request.buyer_id_number}
          registrationNo={request.buyer_registration_no}
          extraEmails={request.buyer_extra_emails}
          directors={request.buyer_directors}
        />
      </div>

      {(request.property_description || request.notes) && (
        <div className="space-y-2 border-t border-line px-5 py-4">
          {request.property_description && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Property as described</p>
              <p className="text-sm text-ink-2">{request.property_description}</p>
            </div>
          )}
          {request.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Notes from the firm</p>
              <p className="whitespace-pre-wrap text-sm text-ink-2">{request.notes}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
