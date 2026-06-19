import Card from "@/components/ui/Card";
import type { MatterParty } from "@/types";
import { partyRoleOrder } from "@/lib/coo-docs";
import CreatePartyAccount from "@/components/matters/CreatePartyAccount";
import EditPartyButton from "@/components/matters/EditPartyButton";

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
      <dt className="text-gray-400">{k}</dt>
      <dd className="text-gray-800 text-right break-words">{v}</dd>
    </div>
  );
}

// Renders the parties to a matter (COO buyer/seller etc.). Seller is shown first
// (A3). Returns null for matters with no parties (single-client matters), so it
// is safe to drop into any matter-detail page unconditionally. When `manage` is
// set (staff view) each party gets a "Create account" control (A8).
export default function PartiesCard({ parties, manage = false }: { parties: MatterParty[]; manage?: boolean }) {
  if (!parties || parties.length === 0) return null;
  const ordered = [...parties].sort((a, b) => partyRoleOrder(a.role) - partyRoleOrder(b.role));

  return (
    <div>
      <h2 className="font-semibold text-gray-900 mb-3">Parties ({parties.length})</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ordered.map((p) => {
          const name = p.entity_type === "natural_person" ? p.full_name : p.business_name;
          const isEntity = p.entity_type !== "natural_person";
          return (
            <Card key={p.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1B2E6B]">
                  {ROLE_LABELS[p.role] ?? p.role}
                </p>
                <span className="text-xs text-gray-400">{p.entity_type.replace("_", " ")}</span>
              </div>
              <p className="font-medium text-gray-900">{name || "—"}</p>
              <dl className="space-y-1.5 text-sm">
                <Row k="Reg / IT no." v={p.registration_no} />
                <Row k="ID number" v={p.id_number} />
                <Row k="Email" v={p.email} />
                <Row k="Cell" v={p.cell} />
                <Row k="Address" v={p.physical_address} />
              </dl>
              {isEntity && (p.contact_name || p.contact_email || p.contact_cell) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm space-y-1.5">
                  <p className="text-xs font-medium text-gray-600">Contact person</p>
                  <dl className="space-y-1.5">
                    <Row k="Name" v={p.contact_name} />
                    <Row k="Email" v={p.contact_email} />
                    <Row k="Cell" v={p.contact_cell} />
                  </dl>
                </div>
              )}
              {manage && (
                <div className="space-y-3 border-t border-gray-100 pt-3">
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
