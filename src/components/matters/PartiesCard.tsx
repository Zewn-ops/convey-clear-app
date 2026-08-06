import Card from "@/components/ui/Card";
import { composeFullName, contactPersonName, type MatterParty } from "@/types";
import { partyRoleOrder } from "@/lib/coo-docs";
import CreatePartyAccount from "@/components/matters/CreatePartyAccount";
import EditPartyButton from "@/components/matters/EditPartyButton";
import { SubjectSection, type FicaSubject } from "@/components/matters/InPlaceFica";

const ROLE_LABELS: Record<string, string> = {
  buyer: "Buyer (new owner)",
  seller: "Seller (current owner)",
  owner: "Owner",
  applicant: "Applicant",
  other: "Party",
};

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-ink text-right break-words">{v}</dd>
    </div>
  );
}

// Renders the parties to a matter (COO buyer/seller etc.). Seller is shown first
// (A3). Returns null for matters with no parties (single-client matters), so it
// is safe to drop into any matter-detail page unconditionally. When `manage` is
// set (staff view) each party gets a "Create account" control (A8).
export default function PartiesCard({
  parties,
  manage = false,
  matterId,
  ficaSubjects = [],
  isStaff = false,
}: {
  parties: MatterParty[];
  manage?: boolean;
  /** Required to host FICA capture inside a party card. */
  matterId?: string;
  /** Subjects for these parties; the matter's own client is handled elsewhere. */
  ficaSubjects?: FicaSubject[];
  isStaff?: boolean;
}) {
  if (!parties || parties.length === 0) return null;
  const ordered = [...parties].sort((a, b) => partyRoleOrder(a.role) - partyRoleOrder(b.role));
  const subjectFor = (partyId: string) => ficaSubjects.find((s) => s.partyId === partyId) ?? null;

  return (
    <div>
      <h2 className="font-semibold text-ink mb-3">Parties ({parties.length})</h2>
      {/* One card per party now carries the WHOLE of that party: who they are,
          their FICA details and consent, and the account controls. They were two
          separate cards listing the same people, so capturing a buyer's details
          meant reading their name here and then finding them again further down
          — and the second card repeated every name to make that possible. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ordered.map((p) => {
          const isEntity = p.entity_type !== "natural_person";
          const name = isEntity ? p.business_name : composeFullName(p.first_name, p.last_name) || p.full_name;
          return (
            <Card key={p.id} accent="client" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-action">
                  {ROLE_LABELS[p.role] ?? p.role}
                </p>
                <span className="text-xs text-ink-3">{p.entity_type.replace("_", " ")}</span>
              </div>
              <p className="font-medium text-ink">{name || "—"}</p>
              <dl className="space-y-1.5 text-sm">
                <Row k="Reg / IT no." v={p.registration_no} />
                {/* Natural person → ID here. Business/trust → ID lives with the
                    contact person below (note 2026-06-22). */}
                {!isEntity && <Row k="ID number" v={p.id_number} />}
                <Row k="Email" v={p.email} />
                <Row k="Cell" v={p.cell} />
                <Row k="Address" v={p.physical_address} />
              </dl>
              {isEntity && (contactPersonName(p) || p.contact_email || p.contact_cell || p.id_number) && (
                <div className="rounded-lg bg-raised shadow-sm dark:ring-1 dark:ring-line p-3 text-sm space-y-1.5">
                  <p className="text-xs font-medium text-ink-2">Contact person</p>
                  <dl className="space-y-1.5">
                    <Row k="Name" v={contactPersonName(p) || null} />
                    <Row k="ID number" v={p.id_number} />
                    <Row k="Email" v={p.contact_email} />
                    <Row k="Cell" v={p.contact_cell} />
                  </dl>
                </div>
              )}
              {/* Details + consent for THIS party, in place. The order is the
                  order of the work: know who they are, capture what FICA needs,
                  then give them a login. */}
              {matterId && subjectFor(p.id) && (
                <div className="border-t border-line pt-3">
                  <SubjectSection
                    matterId={matterId}
                    subject={subjectFor(p.id)!}
                    isStaff={isStaff}
                  />
                </div>
              )}

              {manage && (
                <div className="space-y-3 border-t border-line pt-3">
                  <EditPartyButton party={p} />
                  <CreatePartyAccount partyId={p.id} partyName={name || "this party"} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
