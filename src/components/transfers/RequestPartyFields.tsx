"use client";

import { Plus, X } from "lucide-react";

/**
 * One party on a transfer request — the seller or the buyer.
 *
 * 🔴 THE ENTITY TYPE IS THE FIRST QUESTION, because every other field depends on
 * it. Jukka, in person 2026-09-02:
 *
 *   Zewn:  "we can't do the ID number because if it's a company, which ID
 *           number do you put down?"
 *   Jukka: "That's what I'm saying. So if they select the seller, they need to
 *           have three options. Is it an individual, a business, or a trust?"
 *
 * So an individual is asked for an ID number, a business or a trust for a
 * registration number, and a business is also asked for its DIRECTORS — Jukka,
 * reading a real instruction off his screen: "director name surname of director
 * ID number of director cell phone number of director email address of
 * director."
 *
 * ⚠️ NOTHING HERE IS REQUIRED WHILE THE REQUEST IS A DRAFT. The rule is that a
 * party who has been NAMED must be complete before the request is sent — not
 * that both parties must exist. 2026-08-11 recorded "Seller / Buyer: Not
 * supplied" as correct, and that still holds; what is no longer accepted is half
 * a party, because half a party cannot be checked against a FICA document, which
 * is the entire reason these fields were asked for.
 *
 * The label is "Seller entity name", not "Seller". Jukka: "I think we should
 * just indicate that it's the name of the company or whatever … at the moment it
 * just looks like a random tab there."
 */

export interface RequestParty {
  name: string;
  email: string;
  cell: string;
  entity_type: string;
  id_number: string;
  registration_no: string;
  extra_emails: string[];
  directors: RequestDirector[];
}

export interface RequestDirector {
  name: string;
  id_number: string;
  cell: string;
  email: string;
}

export const EMPTY_PARTY: RequestParty = {
  name: "",
  email: "",
  cell: "",
  entity_type: "",
  id_number: "",
  registration_no: "",
  extra_emails: [],
  directors: [],
};

export const EMPTY_DIRECTOR: RequestDirector = {
  name: "",
  id_number: "",
  cell: "",
  email: "",
};

const ENTITY_TYPES = [
  { value: "", label: "— Select —" },
  { value: "natural_person", label: "Individual" },
  { value: "business", label: "Business" },
  { value: "trust", label: "Trust" },
];

const input =
  "bg-surface text-ink mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-action";
const label = "block text-xs font-medium text-ink-3";

export default function RequestPartyFields({
  role,
  value,
  onChange,
}: {
  role: "seller" | "buyer";
  value: RequestParty;
  onChange: (next: RequestParty) => void;
}) {
  const Role = role === "seller" ? "Seller" : "Buyer";
  const set = <K extends keyof RequestParty>(k: K, v: RequestParty[K]) =>
    onChange({ ...value, [k]: v });

  const isBusiness = value.entity_type === "business";
  const isTrust = value.entity_type === "trust";
  const isPerson = value.entity_type === "natural_person";
  // A named party is one we will be asked to verify. Until there is a name,
  // this whole block is optional and says so.
  const named = value.name.trim() !== "";

  return (
    <div className="rounded-lg border border-line bg-raised p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-ink uppercase tracking-wide">The {role}</p>
        {named && (
          <span className="text-[11px] text-ink-3">
            Everything below is needed before we can open the transfer.
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {Role} entity name
          <input
            className={input}
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={role === "seller" ? "Go Property (Pty) Ltd" : "A. Buyer"}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-3">
            The person, company or trust as it appears on the documents.
          </span>
        </label>

        <label className={label}>
          {Role} type
          <select
            className={input}
            value={value.entity_type}
            onChange={(e) => set("entity_type", e.target.value)}
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The identifying number, and WHICH one depends on the answer above.
          Nothing is shown until the type is chosen, because the field would
          otherwise have to be labelled "ID / registration number", which is the
          ambiguity this whole section exists to remove. */}
      {(isPerson || isBusiness || isTrust) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {isPerson ? (
            <label className={label}>
              {Role} ID number
              <input
                className={input}
                value={value.id_number}
                onChange={(e) => set("id_number", e.target.value)}
                inputMode="numeric"
              />
            </label>
          ) : (
            <label className={label}>
              {isTrust ? "Trust (IT) number" : "Company registration number"}
              <input
                className={input}
                value={value.registration_no}
                onChange={(e) => set("registration_no", e.target.value)}
                placeholder={isTrust ? "IT 1234/2020" : "2020/123456/07"}
              />
            </label>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {Role} email
          <input
            type="email"
            className={input}
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </label>
        <label className={label}>
          {Role} cell
          <input
            className={input}
            value={value.cell}
            onChange={(e) => set("cell", e.target.value)}
          />
        </label>
      </div>

      {/* 🔴 ONE EMAIL IS ASKED FOR, MORE ARE OFFERED. Zewn: "to try and get the
          attorney to fill in multiple emails for us causes friction. So one
          email I think is enough." Jukka, one minute later, looking at a real
          instruction: "in this case, there's three emails for the buyer." A
          button is the shape that serves both — the common case costs nothing
          and the real case is possible. */}
      {value.extra_emails.map((addr, i) => (
        <div key={i} className="flex items-end gap-2">
          <label className={`${label} flex-1`}>
            Additional {role} email
            <input
              type="email"
              className={input}
              value={addr}
              onChange={(e) =>
                set(
                  "extra_emails",
                  value.extra_emails.map((v, j) => (j === i ? e.target.value : v))
                )
              }
            />
          </label>
          <button
            type="button"
            onClick={() =>
              set(
                "extra_emails",
                value.extra_emails.filter((_, j) => j !== i)
              )
            }
            className="mb-1 rounded p-2 text-ink-3 hover:bg-danger-tint hover:text-danger"
            aria-label="Remove this email"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => set("extra_emails", [...value.extra_emails, ""])}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-action hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add another email
      </button>

      {/* Directors — businesses only. A trust has trustees and Jukka did not ask
          for them, so they are not invented here. */}
      {isBusiness && (
        <div className="space-y-3 border-t border-line pt-4">
          <div>
            <p className="text-xs font-semibold text-ink uppercase tracking-wide">Directors</p>
            <p className="mt-1 text-[11px] text-ink-3">
              As they appear on the CIPC documents. Add as many as the company has.
            </p>
          </div>

          {value.directors.map((d, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Director {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "directors",
                      value.directors.filter((_, j) => j !== i)
                    )
                  }
                  className="rounded p-1 text-ink-3 hover:bg-danger-tint hover:text-danger"
                  aria-label="Remove this director"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  Name and surname
                  <input
                    className={input}
                    value={d.name}
                    onChange={(e) =>
                      set(
                        "directors",
                        value.directors.map((v, j) =>
                          j === i ? { ...v, name: e.target.value } : v
                        )
                      )
                    }
                  />
                </label>
                <label className={label}>
                  ID number
                  <input
                    className={input}
                    value={d.id_number}
                    inputMode="numeric"
                    onChange={(e) =>
                      set(
                        "directors",
                        value.directors.map((v, j) =>
                          j === i ? { ...v, id_number: e.target.value } : v
                        )
                      )
                    }
                  />
                </label>
                <label className={label}>
                  Cell
                  <input
                    className={input}
                    value={d.cell}
                    onChange={(e) =>
                      set(
                        "directors",
                        value.directors.map((v, j) =>
                          j === i ? { ...v, cell: e.target.value } : v
                        )
                      )
                    }
                  />
                </label>
                <label className={label}>
                  Email
                  <input
                    type="email"
                    className={input}
                    value={d.email}
                    onChange={(e) =>
                      set(
                        "directors",
                        value.directors.map((v, j) =>
                          j === i ? { ...v, email: e.target.value } : v
                        )
                      )
                    }
                  />
                </label>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => set("directors", [...value.directors, { ...EMPTY_DIRECTOR }])}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-action hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add a director
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What is still missing before this party can be sent, in the attorney's words.
 *
 * Returned as a list rather than a boolean so the form can say WHICH field, and
 * shared with the route so the browser and the server agree without the check
 * being written twice. 088 says the same thing a third time in the database,
 * which is the one that actually holds.
 */
export function missingPartyFields(role: "seller" | "buyer", p: RequestParty): string[] {
  const Role = role === "seller" ? "Seller" : "Buyer";
  // An unnamed party is not an incomplete party — it is one the firm has not
  // been told about yet, which is allowed and always was.
  if (!p.name.trim()) return [];

  const missing: string[] = [];
  if (!p.email.trim()) missing.push(`${Role} email`);
  if (!p.cell.trim()) missing.push(`${Role} cell`);
  if (!p.entity_type) missing.push(`${Role} type`);
  else if (p.entity_type === "natural_person" && !p.id_number.trim()) {
    missing.push(`${Role} ID number`);
  } else if (p.entity_type !== "natural_person" && !p.registration_no.trim()) {
    missing.push(
      p.entity_type === "trust" ? `${Role} trust (IT) number` : `${Role} registration number`
    );
  }
  return missing;
}
