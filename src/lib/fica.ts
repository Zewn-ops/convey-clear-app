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
  type?: "text" | "email" | "tel" | "textarea";
  /** Staff-only — never shown to the attorney firm. See sensitive() below. */
  sensitive?: boolean;
  hint?: string;
}

/**
 * The client fields the FICA form asks for, by entity type. Mirrors the Details
 * stage of OnboardForm so the two capture the same thing.
 */
export function ficaFields(entity: string | null | undefined): FicaField[] {
  const e = (entity ?? "natural_person") as FicaEntity;

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
  ];
}

/**
 * Municipal-portal credentials are the client's own council login. Staff need
 * them to act on the client's behalf; the attorney firm has no business holding
 * them, so partners never see these fields — not even blanked.
 */
export function visibleFicaFields(entity: string | null | undefined, isStaff: boolean): FicaField[] {
  const fields = ficaFields(entity);
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
/*                                 directors                                  */
/* -------------------------------------------------------------------------- */

export interface DirectorInput {
  full_name: string;
  surname: string;
  cell: string;
  work_number: string;
  email: string;
  designation: string;
}

/**
 * `contacts.name` is one string, but the form edits first name(s) and surname
 * separately (the same split as migration 023/024). Last token = surname; the
 * rest are first names, so "Anna Maria van der Merwe" keeps its surname intact
 * only as far as a single field can — which is why the two are stored apart going
 * forward and this is only a read-side best effort.
 */
export function toDirectors(
  rows:
    | { name?: string | null; email?: string | null; cell?: string | null; work_number?: string | null; designation?: string | null }[]
    | null
    | undefined
): DirectorInput[] {
  return (rows ?? []).map((r) => {
    const parts = (r.name ?? "").trim().split(/\s+/).filter(Boolean);
    const surname = parts.length > 1 ? parts[parts.length - 1] : "";
    const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
    return {
      full_name: first,
      surname,
      cell: r.cell ?? "",
      work_number: r.work_number ?? "",
      email: r.email ?? "",
      designation: r.designation ?? "",
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
