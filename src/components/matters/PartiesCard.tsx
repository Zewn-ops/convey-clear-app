import Card from "@/components/ui/Card";
import type { MatterParty } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  buyer: "Buyer (new owner)",
  seller: "Seller (current owner)",
  owner: "Owner",
  applicant: "Applicant",
  other: "Party",
};

// Mask all but the last 4 digits of an account number for display.
function maskAccount(n: string | null): string | null {
  if (!n) return null;
  const d = n.replace(/\s/g, "");
  return d.length <= 4 ? d : `••••${d.slice(-4)}`;
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-400">{k}</dt>
      <dd className="text-gray-800 text-right break-words">{v}</dd>
    </div>
  );
}

// Renders the parties to a matter (COO buyer/seller etc.). Presentational only;
// returns null for matters with no parties (single-client matters), so it is
// safe to drop into any matter-detail page unconditionally.
export default function PartiesCard({ parties }: { parties: MatterParty[] }) {
  if (!parties || parties.length === 0) return null;

  return (
    <div>
      <h2 className="font-semibold text-gray-900 mb-3">Parties ({parties.length})</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {parties.map((p) => {
          const name = p.entity_type === "natural_person" ? p.full_name : p.business_name;
          const hasBanking = p.account_holder || p.bank_name || p.bank_account_no || p.bank_branch_code;
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
              {hasBanking && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm space-y-1.5">
                  <p className="text-xs font-medium text-gray-600">Refund banking</p>
                  <dl className="space-y-1.5">
                    <Row k="Holder" v={p.account_holder} />
                    <Row k="Bank" v={p.bank_name} />
                    <Row k="Account" v={maskAccount(p.bank_account_no)} />
                    <Row k="Branch" v={p.bank_branch_code} />
                  </dl>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
