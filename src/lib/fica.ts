import type { Client } from "@/types";

// In-place FICA capture (migration 033).
//
// The /onboard form collects three things: client DETAILS, DOCUMENTS, and
// CONSENT. The in-place intake only ever did documents, which is why completing a
// matter without sending the link was impossible — the other two thirds had no
// home. This module is the shared definition of the other two, so the in-place
// surface and the onboard form can't drift apart.

export type FicaEntity = "natural_person" | "business" | "trust";

export interface FicaField {
  key: keyof Client & string;
  label: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  /** For `type: "select"` — the closed list the council form offers. */
  options?: { value: string; label: string }[];
  /** Staff-only — never shown to the attorney firm. See sensitive() below. */
  sensitive?: boolean;
  hint?: string;
}

/**
 * §5.12 — what the eTshwane portal demands of a party on a rates clearance
 * application, field for field off the council's own form (080).
 *
 * 🔴 OPTIONAL HERE, ON PURPOSE. These are asked for by ONE council, for ONE
 * stage, of ONE party. Marking them required on every client would mark the
 * whole database incomplete overnight — including clients on a City of
 * Ekurhuleni transfer, whose sheet asks markedly less of the buyer. The
 * requirement is raised per council by `ficaFields(entity, requiredExtra)`,
 * fed from src/lib/councils.
 *
 * The address is in parts because the portal has five separate boxes and will
 * not take a paragraph. `physical_address` stays as it is and is never split to
 * fill them — that guess is what 023 made on names and §4.2 had to undo.
 */
export const COUNCIL_PARTY_FIELDS: FicaField[] = [
  { key: "title", label: "Title", hint: "Mr, Mrs, Dr — as the council form wants it" },
  { key: "initials", label: "Initials" },
  { key: "nationality", label: "Nationality" },
  {
    key: "id_type",
    label: "ID type",
    type: "select",
    options: [
      { value: "rsa_id", label: "RSA ID" },
      { value: "passport", label: "Passport" },
    ],
  },
  {
    key: "marital_status",
    label: "Marital status",
    type: "select",
    options: [
      { value: "single", label: "Single" },
      { value: "married", label: "Married" },
      { value: "divorced", label: "Divorced" },
      { value: "widowed", label: "Widowed" },
    ],
  },
  { key: "language", label: "Language of communication" },
  { key: "street_number", label: "Street number" },
  { key: "street_name", label: "Street name" },
  { key: "suburb", label: "Suburb" },
  { key: "city", label: "City" },
  { key: "postal_code", label: "Postal code" },
];

/** The keys above, for a council module to name without repeating the shapes. */
export const COUNCIL_PARTY_FIELD_KEYS = COUNCIL_PARTY_FIELDS.map((f) => f.key);

/**
 * The client fields the FICA form asks for, by entity type. Mirrors the Details
 * stage of OnboardForm so the two capture the same thing.
 */
export function ficaFields(
  entity: string | null | undefined,
  /**
   * Keys the COUNCIL requires in this context, from src/lib/councils. A key
   * named here is appended (or raised to required if the base list already has
   * it); everything else in COUNCIL_PARTY_FIELDS stays capturable but optional.
   */
  requiredExtra?: readonly string[]
): FicaField[] {
  const e = (entity ?? "natural_person") as FicaEntity;
  const raise = new Set(requiredExtra ?? []);

  // Council extras come last: they are the specialist half, and putting them
  // above cell and email would bury the fields every client needs behind the
  // ones one council wants.
  const extras: FicaField[] = COUNCIL_PARTY_FIELDS.map((f) =>
    raise.has(f.key) ? { ...f, required: true } : f
  );

  const common: FicaField[] = [
    { key: "primary_cell", label: "Cell", required: true, type: "tel" },
    { key: "primary_email", label: "Email", required: true, type: "email" },
    { key: "physical_address", label: "Address", type: "textarea", hint: "Street, suburb, city" },
  ];

  if (e === "business" || e === "trust") {
    return [
      {
        key: "business_name",
        label: e === "trust" ? "Trust name" : "Business name (as per CIPC)",
        required: true,
      },
      {
        key: "registration_no",
        label: e === "trust" ? "IT number" : "Registration number",
        required: true,
      },
      ...common,
      { key: "person_industry", label: "Industry" },
      {
        key: "municipal_username",
        label: "Municipal portal username",
        sensitive: true,
        hint: "The client's own council login, where they have one",
      },
      { key: "municipal_password", label: "Municipal portal password", sensitive: true },
      ...extras,
    ];
  }

  return [
    { key: "first_name", label: "First name(s)", required: true },
    { key: "last_name", label: "Surname", required: true },
    { key: "id_number", label: "ID number", required: true },
    ...common,
    { key: "person_industry", label: "Industry" },
    { key: "person_designation", label: "Role / designation" },
    { key: "municipal_username", label: "Municipal portal username", sensitive: true },
    { key: "municipal_password", label: "Municipal portal password", sensitive: true },
    ...extras,
  ];
}

/**
 * Municipal-portal credentials are the client's own council login. Staff need
 * them to act on the client's behalf; the attorney firm has no business holding
 * them, so partners never see these fields — not even blanked.
 */
export function visibleFicaFields(
  entity: string | null | undefined,
  isStaff: boolean,
  requiredExtra?: readonly string[]
): FicaField[] {
  const fields = ficaFields(entity, requiredExtra);
  return isStaff ? fields : fields.filter((f) => !f.sensitive);
}

export interface DetailsStatus {
  total: number;
  held: number;
  missing: FicaField[];
  complete: boolean;
}

export function detailsStatus(client: Client | null, entity: string | null | undefined): DetailsStatus {
  const required = ficaFields(entity).filter((f) => f.required);
  const missing = required.filter((f) => {
    const v = client ? (client as unknown as Record<string, unknown>)[f.key] : null;
    return v === null || v === undefined || String(v).trim() === "";
  });
  return {
    total: required.length,
    held: required.length - missing.length,
    missing,
    complete: missing.length === 0,
  };
}

/* -------------------------------------------------------------------------- */
/*                            subjects on a matter                            */
/* -------------------------------------------------------------------------- */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatterParty } from "@/types";
import { composeFullName } from "@/types";

export interface FicaSubjectData {
  partyId: string | null;
  label: string;
  client: Client | null;
  consents: ConsentEvent[];
  directors: DirectorInput[];
  partyEntity?: string | null;
  /**
   * 'seller' | 'buyer' | … — 080/§5.12. `build()` has returned this since the
   * council fields landed, but the interface did not declare it, so every
   * consumer had to cast to reach it. Declared now: the council asks for the
   * extra eTshwane fields of the BUYER only, and the role is how anything
   * downstream knows which party that is.
   */
  partyRole?: string | null;
}

/**
 * Who are the FICA subjects on this matter?
 *
 * A single-client matter has one: the matter's own client. A COO matter has one
 * PER PARTY — the buyer and the seller are separate entities, each with their own
 * details, consent and directors, and the matter itself frequently has NO client
 * row (16 of 28 in production). Keying FICA off `matters.client_id` alone made the
 * capture card invisible on exactly the service it matters most for.
 *
 * A party with no linked `clients` record yields a subject with `client: null` —
 * the UI turns that into "create a Contact for them first" rather than silently
 * rendering nothing.
 */
export async function buildFicaSubjects(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  matterClientId: string | null,
  parties: MatterParty[]
): Promise<FicaSubjectData[]> {
  const partyClientIds = parties.map((p) => p.client_id).filter((x): x is string => Boolean(x));
  const ids = Array.from(new Set([matterClientId, ...partyClientIds].filter((x): x is string => Boolean(x))));

  // Parties are the subjects when there are any; otherwise it's the matter's client.
  const usePartySubjects = parties.length > 0;
  if (!usePartySubjects && !matterClientId) return [];

  if (ids.length === 0 && !usePartySubjects) return [];

  const [{ data: clientRows }, { data: consentRows }, { data: contactRows }] =
    ids.length > 0
      ? await Promise.all([
          supabase.from("clients").select("*").in("id", ids),
          supabase
            .from("consent_events")
            .select("id, client_id, consent_type, granted, source, captured_by, capture_method, note, created_at")
            .in("client_id", ids)
            .order("created_at", { ascending: false }),
          supabase
            .from("contacts")
            .select(
              "client_id, name, first_name, last_name, email, cell, work_number, designation, is_representative"
            )
            .in("client_id", ids)
            .eq("is_director", true),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const clientById = new Map<string, Client>();
  for (const c of (clientRows as Client[] | null) ?? []) clientById.set(c.id, c);

  const consentsByClient = new Map<string, ConsentEvent[]>();
  for (const e of ((consentRows as (ConsentEvent & { client_id: string })[] | null) ?? [])) {
    const list = consentsByClient.get(e.client_id) ?? [];
    list.push(e);
    consentsByClient.set(e.client_id, list);
  }

  const contactsByClient = new Map<string, Parameters<typeof toDirectors>[0]>();
  for (const c of ((contactRows as ({ client_id: string } & Record<string, string | null>)[] | null) ?? [])) {
    const list = (contactsByClient.get(c.client_id) as unknown[]) ?? [];
    list.push(c);
    contactsByClient.set(c.client_id, list as Parameters<typeof toDirectors>[0]);
  }

  const build = (
    partyId: string | null,
    label: string,
    clientId: string | null,
    partyEntity?: string | null,
    // 080/§5.12 — the council asks for the extra eTshwane fields of the BUYER,
    // not of both sides. Without the role here, raising them to required would
    // demand a marital status of the seller too, which no sheet asks for.
    partyRole?: string | null
  ) => ({
    partyId,
    label,
    client: clientId ? (clientById.get(clientId) ?? null) : null,
    consents: clientId ? (consentsByClient.get(clientId) ?? []) : [],
    directors: clientId ? toDirectors(contactsByClient.get(clientId)) : [],
    partyEntity,
    partyRole: partyRole ?? null,
  });

  if (usePartySubjects) {
    return parties.map((p) => {
      // A business/trust party is named by its entity; an individual by their name.
      const name =
        p.business_name?.trim() ||
        composeFullName(p.first_name, p.last_name) ||
        p.full_name?.trim() ||
        "Unnamed party";
      const role = p.role ? `${p.role.charAt(0).toUpperCase()}${p.role.slice(1)} — ` : "";
      return build(p.id, `${role}${name}`, p.client_id ?? null, p.entity_type, p.role ?? null);
    });
  }

  return [build(null, clientById.get(matterClientId!)?.business_name || clientById.get(matterClientId!)?.full_name || "Client", matterClientId)];
}

/* -------------------------------------------------------------------------- */
/*                                 directors                                  */
/* -------------------------------------------------------------------------- */

export interface DirectorInput {
  full_name: string;
  surname: string;
  cell: string;
  work_number: string;
  email: string;
  designation: string;
  /** 079 — the one director who represents the business. At most one per client. */
  is_representative?: boolean;
}

/**
 * A director's name, in halves.
 *
 * 🔴 THE SPLIT WAS DESTROYING REAL NAMES. `contacts.name` is one column, and
 * the FICA capture route wrote `${full_name} ${surname}` into it while this
 * function split it back on whitespace taking the LAST token as the surname. So
 * a director captured correctly as (Jan | van der Merwe) was stored as
 * "Jan van der Merwe" and read back as (Jan van der | Merwe) — the form already
 * had both halves, and only the storage threw one away.
 *
 * 079 gives `contacts` real first_name / last_name columns and the route now
 * writes them. Rows that predate it keep NULL there — deliberately not
 * backfilled, since splitting them is the same guess made permanent — so the
 * old behaviour survives as a FALLBACK for exactly those rows and nothing else.
 *
 * Same defect §4.2 fixed for transfer parties, and the same one 023 created for
 * clients.
 */
export function toDirectors(
  rows:
    | {
        name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        cell?: string | null;
        work_number?: string | null;
        designation?: string | null;
        is_representative?: boolean | null;
      }[]
    | null
    | undefined
): DirectorInput[] {
  return (rows ?? []).map((r) => {
    const stored = {
      first: (r.first_name ?? "").trim(),
      last: (r.last_name ?? "").trim(),
    };

    // Only guess when the row has no halves of its own.
    let first = stored.first;
    let surname = stored.last;
    if (!first && !surname) {
      const parts = (r.name ?? "").trim().split(/\s+/).filter(Boolean);
      surname = parts.length > 1 ? parts[parts.length - 1] : "";
      first = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
    }

    return {
      full_name: first,
      surname,
      cell: r.cell ?? "",
      work_number: r.work_number ?? "",
      email: r.email ?? "",
      designation: r.designation ?? "",
      is_representative: Boolean(r.is_representative),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                                  consent                                    */
/* -------------------------------------------------------------------------- */

export const CONSENT_TYPES = ["popia", "terms", "marketing"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** Marketing is a preference, not a compliance gate — it never blocks a matter. */
export const REQUIRED_CONSENTS: ConsentType[] = ["popia", "terms"];

export const CAPTURE_METHODS = [
  { value: "signed_form", label: "Signed FICA pack / mandate on file" },
  { value: "email", label: "Confirmed by the client in writing (email)" },
  { value: "in_person", label: "Given in person, witnessed by staff" },
  { value: "verbal", label: "Given verbally (weakest — record only if unavoidable)" },
] as const;

export type CaptureMethod = (typeof CAPTURE_METHODS)[number]["value"];

export interface ConsentEvent {
  id: string;
  consent_type: string;
  granted: boolean;
  source: string | null;
  captured_by?: string | null;
  capture_method?: string | null;
  note?: string | null;
  created_at: string;
}

export interface ConsentStatus {
  /** Latest event per consent type. */
  latest: Record<string, ConsentEvent | undefined>;
  missing: ConsentType[];
  complete: boolean;
  /** True when the client gave it themselves through the portal — the stronger record. */
  clientGiven: (t: ConsentType) => boolean;
}

export function consentStatus(events: ConsentEvent[]): ConsentStatus {
  const latest: Record<string, ConsentEvent | undefined> = {};
  // Events are append-only; the newest one for a type is the current position.
  for (const e of [...events].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!latest[e.consent_type]) latest[e.consent_type] = e;
  }

  const missing = REQUIRED_CONSENTS.filter((t) => !latest[t]?.granted);

  return {
    latest,
    missing,
    complete: missing.length === 0,
    clientGiven: (t) => {
      const e = latest[t];
      return Boolean(e?.granted && !e.captured_by);
    },
  };
}
