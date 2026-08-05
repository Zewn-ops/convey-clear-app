import type { PartyRow, PartyContact } from "@/components/transfers/TransferParties";

// Reading a transfer's parties (050), shared by the admin and partner pages.
//
// Both portals had their own copy of this select string and its mapper, which
// is how the partner side ended up one field behind more than once. The two
// surfaces legitimately differ — a partner has no /admin/clients route and gets
// no ID numbers — but those differences belong at the CALL SITE, as arguments,
// not as a second implementation of the same shape.

export const TRANSFER_PARTY_SELECT =
  "id, role, client_id, firm_id, full_name, business_name, entity_type, " +
  "email, cell, physical_address, id_number, registration_no, " +
  "clients(full_name, business_name, entity_type, primary_email, primary_cell, physical_address, id_number, registration_no), " +
  "firms(name, primary_email, primary_cell, physical_address)";

export type RawTransferParty = {
  id: string;
  role: string;
  client_id: string | null;
  firm_id: string | null;
  full_name: string | null;
  business_name: string | null;
  entity_type: string | null;
  email: string | null;
  cell: string | null;
  physical_address: string | null;
  id_number: string | null;
  registration_no: string | null;
  clients: {
    full_name: string | null;
    business_name: string | null;
    entity_type: string;
    primary_email: string | null;
    primary_cell: string | null;
    physical_address: string | null;
    id_number: string | null;
    registration_no: string | null;
  } | null;
  firms: {
    name: string | null;
    primary_email: string | null;
    primary_cell: string | null;
    physical_address: string | null;
  } | null;
};

/**
 * Contact detail for the row, taken from whichever identity it carries.
 *
 * A LINKED party reads through to the client or firm record, so the card shows
 * what that record currently says rather than a copy taken when the link was
 * made. An INLINE party has only what was typed at capture time — which is the
 * whole reason to show it here, since nothing else in the app renders it.
 */
function contactFor(r: RawTransferParty): PartyContact {
  if (r.clients) {
    return {
      email: r.clients.primary_email,
      cell: r.clients.primary_cell,
      address: r.clients.physical_address,
      idNumber: r.clients.id_number,
      registrationNo: r.clients.registration_no,
    };
  }
  if (r.firms) {
    return {
      email: r.firms.primary_email,
      cell: r.firms.primary_cell,
      address: r.firms.physical_address,
      // A firm is not a natural person and has neither field on its record.
      idNumber: null,
      registrationNo: null,
    };
  }
  return {
    email: r.email,
    cell: r.cell,
    address: r.physical_address,
    idNumber: r.id_number,
    registrationNo: r.registration_no,
  };
}

/**
 * @param linkClients whether a client-linked party should carry its client id.
 *   False on the partner portal, which has no route to send it to.
 */
export function mapTransferParties(
  rows: RawTransferParty[] | null,
  { linkClients }: { linkClients: boolean }
): PartyRow[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    role: r.role,
    via: r.client_id ? "entity" : r.firm_id ? "firm" : "inline",
    clientId: linkClients ? r.client_id : null,
    detail: r.clients?.entity_type ?? r.entity_type,
    who:
      r.clients?.business_name?.trim() ||
      r.clients?.full_name?.trim() ||
      r.firms?.name?.trim() ||
      r.business_name?.trim() ||
      r.full_name?.trim() ||
      "Unnamed party",
    contact: contactFor(r),
  }));
}
