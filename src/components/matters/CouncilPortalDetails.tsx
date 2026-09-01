"use client";

import { useState } from "react";
import { Copy, Check, ClipboardList, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import { COUNCIL_PARTY_FIELDS } from "@/lib/fica";
import { municipalityLabel } from "@/lib/utils";
import type { Client } from "@/types";

/**
 * The party's details laid out as the COUNCIL PORTAL asks for them, to be copied
 * into it field by field.
 *
 * Zewn, 2026-09-01: "we also need it to be more visual that we see the buyers
 * details (as seen in the screenshot from the etshwane portal that was stuck on
 * the handwritten notes). the whole idea is that the information is visible and
 * easily accessible so people can copy paste into the portal if needed."
 *
 * WHY THIS IS NOT JUST THE PARTIES CARD AGAIN. The parties card answers "who is
 * in this deal" — a name, a role, contact details, expanding for the rest. This
 * answers a different question: someone has the eTshwane portal open in another
 * tab and is filling fifteen boxes. For that, the order has to be the FORM's
 * order rather than ours, every value has to be one click from the clipboard,
 * and a field the council demands but nobody has captured has to be obvious
 * rather than absent — an empty box in the portal is discovered at submission.
 *
 * The field list and its order come from the council's own form, photographed
 * with each field ticked or struck by hand (notes §2, migration 080). Nothing
 * here is inferred: Purchaser Type, Title, Initials, Surname, Language,
 * Nationality, ID Type, ID Number, Marital Status, Contact number, then the
 * address in the five separate boxes the portal actually has.
 *
 * Renders only where a council genuinely asks — driven by `requiredKeys` from
 * src/lib/councils, which today means City of Tshwane, on an RCA, for the buyer.
 */
export default function CouncilPortalDetails({
  label,
  client,
  municipality,
  requiredKeys,
  partyEntity,
}: {
  /** The party this describes, e.g. "Buyer · Naledi Dlamini". */
  label: string;
  client: Client | null;
  municipality: string | null;
  /** Keys this council requires, from councilPartyFieldKeys(). */
  requiredKeys: string[];
  partyEntity?: string | null;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (requiredKeys.length === 0) return null;

  const c = (client ?? {}) as Record<string, unknown>;
  const val = (k: string): string => {
    const v = c[k];
    return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  };

  // The council labels its own choices; ours are stored as codes.
  const pretty: Record<string, Record<string, string>> = {
    id_type: { rsa_id: "RSA ID", passport: "Passport" },
    marital_status: { single: "Single", married: "Married", divorced: "Divorced", widowed: "Widowed" },
  };
  const display = (k: string): string => {
    const raw = val(k);
    return pretty[k]?.[raw] ?? raw;
  };

  const entity = (partyEntity ?? (c.entity_type as string | null) ?? "natural_person").toLowerCase();
  const surname =
    (c.last_name as string | null)?.trim() ||
    (c.business_name as string | null)?.trim() ||
    (c.full_name as string | null)?.trim() ||
    "";

  // Rows in the portal's order, not ours. The three that are not
  // COUNCIL_PARTY_FIELDS live on `clients` already (001, 023) and are spliced in
  // where the form puts them rather than being appended at the end.
  const councilField = (key: string) => COUNCIL_PARTY_FIELDS.find((f) => f.key === key);
  const rows: { key: string; label: string; value: string; required: boolean }[] = [
    {
      key: "purchaser_type",
      label: "Purchaser type",
      value: entity === "natural_person" ? "Person" : entity === "business" ? "Organization" : "Trust",
      required: true,
    },
    ...["title", "initials"].map((k) => ({
      key: k,
      label: councilField(k)?.label ?? k,
      value: display(k),
      required: requiredKeys.includes(k),
    })),
    { key: "surname", label: "Surname", value: surname, required: true },
    ...["language", "nationality", "id_type"].map((k) => ({
      key: k,
      label: councilField(k)?.label ?? k,
      value: display(k),
      required: requiredKeys.includes(k),
    })),
    { key: "id_number", label: "ID number", value: val("id_number"), required: true },
    {
      key: "marital_status",
      label: "Marital status",
      value: display("marital_status"),
      required: requiredKeys.includes("marital_status"),
    },
    { key: "primary_cell", label: "Contact number", value: val("primary_cell"), required: true },
    ...["street_number", "street_name", "suburb", "city", "postal_code"].map((k) => ({
      key: k,
      label: councilField(k)?.label ?? k,
      value: display(k),
      required: requiredKeys.includes(k),
    })),
  ];

  const missing = rows.filter((r) => r.required && !r.value);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // A clipboard write can be refused (permissions, an insecure origin). The
      // value is on screen either way, so there is nothing to recover — say
      // nothing rather than raise a toast about a copy that did not happen.
    }
  }

  const allText = rows.map((r) => `${r.label}: ${r.value || "—"}`).join("\n");

  return (
    <Card accent="service">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 text-action" />
        <h2 className="font-semibold text-ink">
          {municipalityLabel(municipality)} portal details · {label}
        </h2>
        <button
          type="button"
          onClick={() => copy("__all", allText)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-raised"
        >
          {copiedKey === "__all" ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
          {copiedKey === "__all" ? "Copied" : "Copy all"}
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-3">
        In the order the council&apos;s own form asks for them. Click a value to copy it.
      </p>

      {missing.length > 0 && (
        <div className="mb-3 rounded-lg bg-waiting-tint px-3.5 py-2.5 ring-1 ring-inset ring-waiting/20">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-waiting">
            <AlertTriangle className="h-3 w-3" /> {missing.length} field{missing.length === 1 ? "" : "s"} the council
            requires, not captured
          </p>
          <p className="mt-1 text-[13px] text-ink-2">{missing.map((m) => m.label).join(", ")}.</p>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-0 sm:grid-cols-2">
        {rows.map((r) => {
          const empty = !r.value;
          return (
            <div key={r.key} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
              <dt className="shrink-0 text-xs text-ink-3">
                {r.label}
                {r.required && empty && <span className="ml-1 text-waiting">*</span>}
              </dt>
              <dd className="min-w-0 text-right">
                {empty ? (
                  <span className="text-sm text-ink-3">Not captured</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => copy(r.key, r.value)}
                    title="Copy"
                    className="group inline-flex max-w-full items-center gap-1.5 rounded px-1 text-sm text-ink hover:bg-raised"
                  >
                    <span className="truncate">{r.value}</span>
                    {copiedKey === r.key ? (
                      <Check className="h-3 w-3 shrink-0 text-ok" />
                    ) : (
                      <Copy className="h-3 w-3 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
