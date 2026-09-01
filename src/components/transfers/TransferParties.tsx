"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Plus,
  Trash2,
  User,
  Building2,
  Landmark,
  Scale,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  Fingerprint,
  Hash,
  ArrowUpRight,
  Pencil,
  Users,
} from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import EmptyState from "@/components/ui/EmptyState";
import SearchSelect from "@/components/ui/SearchSelect";
import { cn } from "@/lib/utils";

/**
 * Who is involved in this transaction.
 *
 * A party is created by LINKING to an existing entity or firm, or captured
 * inline when there is no record yet. Linking is offered first and inline is
 * the fallback, because a linked party carries its own FICA vault and history
 * while an inline one is a name on a page.
 *
 * Each row opens into a CONTACT CARD in place. The detail staff actually leave
 * this page for is a phone number, and a linked party's number lived one
 * navigation away while a captured party's was not rendered anywhere at all —
 * it had been typed into the capture form and then never shown again.
 */

export const PARTY_ROLES = [
  { value: "seller", label: "Seller" },
  { value: "buyer", label: "Buyer" },
  { value: "estate_agent", label: "Estate agent" },
  { value: "conveyancing_attorney", label: "Conveyancing attorney" },
  { value: "bond_attorney", label: "Bond attorney" },
  { value: "cancellation_attorney", label: "Cancellation attorney" },
  { value: "other", label: "Other" },
] as const;

/** Whatever contact detail the row carries, from the client, the firm, or the capture. */
export type PartyContact = {
  email: string | null;
  cell: string | null;
  address: string | null;
  /** FICA PII — only passed in on staff surfaces. See `showIdNumbers`. */
  idNumber: string | null;
  registrationNo: string | null;
};

export type PartyRow = {
  id: string;
  role: string;
  who: string;
  via: "entity" | "firm" | "inline";
  clientId: string | null;
  detail: string | null;
  contact?: PartyContact;
  /** The named individual at the firm handling this, when one is recorded (059). */
  handledBy?: string | null;
};

export type PartyOption = { id: string; name: string; kind: string };

/** A person who works at a firm — for "who there is handling this" (059). */
export type FirmContact = { id: string; firmId: string; name: string };

/**
 * The three party roles that lead the section, in Zewn's order (§11.7):
 * BUYER · SELLER · CONVEYANCING ATTORNEY. The fourth block is the ConveyClear
 * member, which is not a party row at all — see the render below.
 *
 * 🔴 The estate agent is deliberately NOT here any more. Zewn, 2026-08-31:
 * "the estate agent can fall into a sub field later on but they are not
 * important as parties, i think parties should only be targeted toward people
 * making accounts and estate agents are on the bottom of that list."
 *
 * That is a membership RULE, not a one-off removal: a party is someone who
 * makes an account. Estate agencies have no portal role (026:44), so their
 * agents are not users. The role still exists and still renders — under "Other
 * parties" — because demoting is not deleting.
 */
const HEADLINE_ROLES = [
  { value: "buyer", label: "Buyer", icon: User },
  { value: "seller", label: "Seller", icon: User },
  { value: "conveyancing_attorney", label: "Conveyancing attorney", icon: Scale },
] as const;

const HEADLINE_ROLE_VALUES: string[] = HEADLINE_ROLES.map((r) => r.value);

const roleLabel = (r: string) =>
  PARTY_ROLES.find((x) => x.value === r)?.label ?? r.replace(/_/g, " ");

function viaIcon(via: PartyRow["via"], kind?: string) {
  const cls = "h-4 w-4 shrink-0 text-ink-3";
  if (via === "firm") return <Scale className={cls} />;
  if (kind === "trust") return <Landmark className={cls} />;
  if (kind === "business") return <Building2 className={cls} />;
  return <User className={cls} />;
}

/**
 * One labelled line of the contact card.
 *
 * A blank field still renders its LABEL. Hiding empty fields made a
 * half-captured party look identical to a fully captured one — you could not
 * tell "no cell number recorded" from "this card does not track cell numbers",
 * which is the difference between chasing the client and not.
 */
function ContactLine({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
  href?: string;
}) {
  const empty = !value?.trim();
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
        {empty ? (
          <p className="text-[13.5px] text-ink-3">Not captured</p>
        ) : href ? (
          // mailto/tel rather than plain text: on a transfer the next action
          // after finding a number is almost always to use it.
          <a href={href} className="block break-words text-[13.5px] text-action hover:underline">
            {value}
          </a>
        ) : (
          <p className="break-words text-[13.5px] text-ink-2">{value}</p>
        )}
      </div>
    </div>
  );
}

export type PartyPatch = {
  fullName?: string;
  businessName?: string;
  email?: string;
  cell?: string;
  physicalAddress?: string;
  idNumber?: string;
  registrationNo?: string;
};

/** In-place editor for an inline-captured party. */
function PartyEditor({
  party,
  showIdNumbers,
  busy,
  onCancel,
  onSave,
}: {
  party: PartyRow;
  showIdNumbers: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: PartyPatch) => void;
}) {
  const isPerson = party.detail !== "business" && party.detail !== "trust";
  const c = party.contact;
  const [form, setForm] = useState<PartyPatch>({
    fullName: isPerson ? party.who : "",
    businessName: isPerson ? "" : party.who,
    email: c?.email ?? "",
    cell: c?.cell ?? "",
    physicalAddress: c?.address ?? "",
    idNumber: c?.idNumber ?? "",
    registrationNo: c?.registrationNo ?? "",
  });

  const set = (k: keyof PartyPatch) => (e: { target: { value: string } }) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  const field =
    "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action";
  const lbl = "text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={lbl}>{isPerson ? "Full name" : "Registered name"}</span>
          <input
            value={(isPerson ? form.fullName : form.businessName) ?? ""}
            onChange={set(isPerson ? "fullName" : "businessName")}
            className={field}
          />
        </label>
        <label>
          <span className={lbl}>Email</span>
          <input type="email" value={form.email ?? ""} onChange={set("email")} className={field} />
        </label>
        <label>
          <span className={lbl}>Cell</span>
          <input value={form.cell ?? ""} onChange={set("cell")} className={field} />
        </label>
        <label className="sm:col-span-2">
          <span className={lbl}>Address</span>
          <input
            value={form.physicalAddress ?? ""}
            onChange={set("physicalAddress")}
            className={field}
          />
        </label>
        {isPerson
          ? showIdNumbers && (
              <label>
                <span className={lbl}>ID number</span>
                <input value={form.idNumber ?? ""} onChange={set("idNumber")} className={field} />
              </label>
            )
          : (
              <label>
                <span className={lbl}>Registration no.</span>
                <input
                  value={form.registrationNo ?? ""}
                  onChange={set("registrationNo")}
                  className={field}
                />
              </label>
            )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(form)}
          className="rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save details"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3.5 py-2 text-sm font-semibold text-ink-2 hover:bg-raised"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function TransferParties({
  transferId,
  parties,
  entities,
  firms,
  firmContacts = [],
  canEdit,
  clientHrefBase,
  showIdNumbers = false,
  designatedMember = null,
}: {
  transferId: string;
  parties: PartyRow[];
  entities: PartyOption[];
  firms: PartyOption[];
  /** The firms' own people. Empty is fine — the contact field falls back to free text. */
  firmContacts?: FirmContact[];
  canEdit: boolean;
  /**
   * Where a linked client's record lives, e.g. "/admin/clients". Omitted on the
   * partner portal, which has no such route — there the contact card is the
   * whole answer rather than a step toward one.
   */
  clientHrefBase?: string;
  /** FICA ID numbers are staff-only. Off unless a caller opts in. */
  showIdNumbers?: boolean;
  /**
   * The ConveyClear member responsible for this transfer (077) — the fourth
   * block. Not a party row: `transfer_parties` identifies every row as exactly
   * one of a client, a firm or an inline capture (050), and a member is none
   * of those. The column owns the fact; this block shows it.
   */
  designatedMember?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [role, setRole] = useState<string>("seller");
  const [mode, setMode] = useState<"entity" | "firm" | "inline">("entity");
  const [linkId, setLinkId] = useState("");
  const [entityType, setEntityType] = useState("natural_person");
  // A person is named in two halves, a business in one. ficaFields() requires
  // first_name and last_name separately for a natural person, and until now
  // capture sent neither — so every captured person was born failing FICA on a
  // name that had just been typed in. Splitting one box on a space was the
  // other option and it mangles "van der Merwe".
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cell, setCell] = useState("");
  const [idNo, setIdNo] = useState("");
  const [address, setAddress] = useState("");
  // 059 — who at the firm. One of these, never both: a portal user when the
  // firm has them, a typed name when it does not.
  const [contactUserId, setContactUserId] = useState("");
  const [contactName, setContactName] = useState("");

  const taken = new Set(parties.map((p) => p.role));

  // Anyone the four blocks do not already show. Estate agents, bond and
  // cancellation attorneys, anything captured as "other" — still reachable,
  // just no longer competing with the four for the top of the section.
  //
  // 🔴 Keyed on the ROW, not the role. A headline slot renders `find()`, i.e.
  // the first party in that role — and only seller and buyer carry a
  // one-per-transfer index (050), so two `conveyancing_attorney` rows are legal
  // in both the schema and the add form. Filtering by role alone dropped the
  // second one out of BOTH lists: invisible on the page and impossible to
  // delete, since its bin button lives on the row that never rendered. Caught
  // in review 2026-08-31.
  const shownInHeadline = new Set(
    HEADLINE_ROLES.map((r) => parties.find((p) => p.role === r.value)?.id).filter(
      (id): id is string => Boolean(id)
    )
  );
  const otherParties = parties.filter((p) => !shownInHeadline.has(p.id));

  // Estate agents come from agencies, attorneys from law firms. Both used to be
  // drawn from one unfiltered list, which is how "Sterling & Hayes Attorneys"
  // ended up sitting in the estate-agent slot on staging. Anything that is
  // neither is still offered, since partner_type is loose data and hiding a
  // firm someone needs is worse than showing one they do not.
  const firmsForRole =
    role === "estate_agent"
      ? firms.filter((f) => f.kind !== "attorney" && f.kind !== "law firm" && f.kind !== "conveyancer")
      : firms.filter((f) => f.kind !== "estate agent");

  // Cascading: only the chosen firm's people, and only once a firm is chosen.
  const contactsForFirm = mode === "firm" && linkId
    ? firmContacts.filter((c) => c.firmId === linkId)
    : [];

  async function add() {
    const body: Record<string, unknown> = { transferId, role };
    if (mode === "entity") {
      if (!linkId) return toast.error("Pick an entity, or capture the details instead.");
      body.clientId = linkId;
    } else if (mode === "firm") {
      if (!linkId) return toast.error("Pick a firm.");
      body.firmId = linkId;
      // Optional on purpose: you often know the firm before you know who there
      // has picked it up, and refusing the party until you do would push staff
      // back to recording it in a note.
      if (contactUserId) body.contactUserId = contactUserId;
      else if (contactName.trim()) body.contactName = contactName.trim();
    } else {
      body.entityType = entityType;
      if (entityType === "natural_person") {
        if (!firstName.trim() || !lastName.trim()) {
          return toast.error("A first name and a surname are both required.");
        }
        body.firstName = firstName.trim();
        body.lastName = lastName.trim();
      } else {
        if (!name.trim()) return toast.error("A name is required.");
        body.businessName = name.trim();
      }
      // Mirrors the server rule. A captured party becomes a real client record,
      // and one with no way to reach the person cannot be invited, chased or
      // FICA-verified. Everything else FICA wants is marked and listed, not
      // walled off — an attorney often has the name and one contact detail and
      // nothing more, and refusing the party would send them back to a note.
      if (!email.trim() && !cell.trim()) {
        return toast.error("An email address or a cell number is required.");
      }
      if (email.trim()) body.email = email.trim();
      if (cell.trim()) body.cell = cell.trim();
      if (address.trim()) body.physicalAddress = address.trim();
      if (idNo.trim()) {
        if (entityType === "natural_person") body.idNumber = idNo.trim();
        else body.registrationNo = idNo.trim();
      }
    }

    setBusy("add");
    try {
      const res = await fetch("/api/transfer-parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(out.error ?? "Could not add that party.");
      toast.success("Party added.");
      setAdding(false);
      setLinkId("");
      setName("");
      setFirstName("");
      setLastName("");
      setEmail("");
      setCell("");
      setIdNo("");
      setAddress("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveParty(id: string, patch: PartyPatch) {
    setBusy(`edit-${id}`);
    try {
      const res = await fetch("/api/transfer-parties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(out.error ?? "Could not save those details.");
      toast.success("Details saved.");
      setEditingId(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/transfer-parties?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        return toast.error(out.error ?? "Could not remove that party.");
      }
      toast.success("Removed.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const options = mode === "firm" ? firmsForRole : entities;

  /**
   * One party, as an expandable row. Lifted out of the list it used to live
   * in so the headline blocks and the other-parties list render through the
   * SAME code — two copies of this markup is how the admin and partner
   * matters blocks ended up different shapes one commit apart.
   */
  const renderPartyRow = (p: PartyRow) => {
            const open = openId === p.id;
            const c = p.contact;
            const clientHref = p.clientId && clientHrefBase ? `${clientHrefBase}/${p.clientId}` : null;

            return (
              <li
                key={p.id}
                className="overflow-hidden rounded-lg bg-surface shadow-sm dark:ring-1 dark:ring-line"
              >
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  {/* The whole name block is the toggle. The delete button and
                      the client link are siblings, never descendants — a button
                      inside a button is invalid and the inner one stops working. */}
                  <button
                    type="button"
                    onClick={() => { setOpenId(open ? null : p.id); setEditingId(null); }}
                    aria-expanded={open}
                    aria-controls={`party-${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {viaIcon(p.via, p.detail ?? undefined)}
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold text-ink">{p.who}</p>
                      <p className="truncate text-[12.5px] text-ink-3">
                        {roleLabel(p.role)}
                        {p.handledBy && ` · ${p.handledBy}`}
                        {p.via === "inline" && " · captured, not a client record"}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-ink-3 transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill tone={p.via === "inline" ? "waiting" : "neutral"}>
                      {p.via === "entity" ? "Client" : p.via === "firm" ? "Firm" : "Captured"}
                    </StatusPill>
                    {canEdit && (
                      <button
                        title="Remove this party"
                        disabled={busy === p.id}
                        onClick={() => remove(p.id)}
                        className="rounded p-1.5 text-ink-3 transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {open && (
                  <div id={`party-${p.id}`} className="border-t border-line bg-surface px-4 py-3.5">
                    {editingId === p.id ? (
                      <PartyEditor
                        party={p}
                        showIdNumbers={showIdNumbers}
                        busy={busy === `edit-${p.id}`}
                        onCancel={() => setEditingId(null)}
                        onSave={(patch) => saveParty(p.id, patch)}
                      />
                    ) : (
                      <>
                        {/* Every field renders, blank or not — see ContactLine. A card
                            that hides what it does not have cannot be read as a
                            checklist, and this one is used as exactly that. */}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ContactLine
                            icon={Mail}
                            label="Email"
                            value={c?.email ?? null}
                            href={c?.email ? `mailto:${c.email}` : undefined}
                          />
                          <ContactLine
                            icon={Phone}
                            label="Cell"
                            value={c?.cell ?? null}
                            // Spaces are display formatting, not part of the number.
                            href={c?.cell ? `tel:${c.cell.replace(/\s+/g, "")}` : undefined}
                          />
                          <ContactLine icon={MapPin} label="Address" value={c?.address ?? null} />
                          {p.via !== "firm" && (
                            <ContactLine
                              icon={Hash}
                              label="Registration no."
                              value={c?.registrationNo ?? null}
                            />
                          )}
                          {showIdNumbers && p.via !== "firm" && (
                            <ContactLine
                              icon={Fingerprint}
                              label="ID number"
                              value={c?.idNumber ?? null}
                            />
                          )}
                        </div>

                        <div className="mt-3.5 flex flex-wrap items-center gap-4 border-t border-line pt-3">
                          {/* Where "edit" lives depends on what the party IS. An inline
                              capture is edited here because there is nowhere else; a
                              linked party is edited on its own record, so that one
                              copy stays the truth. */}
                          {p.via === "inline" && canEdit && (
                            <button
                              type="button"
                              onClick={() => setEditingId(p.id)}
                              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-action hover:underline"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit details
                            </button>
                          )}
                          {clientHref && (
                            <Link
                              href={clientHref}
                              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-action hover:underline"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit on client record
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          {p.via === "firm" && (
                            <span className="text-[13px] text-ink-3">
                              Firm details are edited on the firm&apos;s own page.
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">Parties</h2>
          <p className="mt-1 text-[13px] text-ink-3">
            Everyone with a role in this transaction. Linking to an existing client brings their FICA
            documents with them.
          </p>
        </div>
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add a party
          </button>
        )}
      </div>

      {adding && (
        <div className="space-y-3 rounded-lg bg-raised p-4 shadow-sm dark:ring-1 dark:ring-line">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1 text-sm">
              <span className="mb-1 block font-medium text-ink-2">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded border border-line bg-surface py-2 pl-3 pr-9 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              >
                {PARTY_ROLES.map((r) => (
                  <option
                    key={r.value}
                    value={r.value}
                    disabled={(r.value === "seller" || r.value === "buyer") && taken.has(r.value)}
                  >
                    {r.label}
                    {(r.value === "seller" || r.value === "buyer") && taken.has(r.value)
                      ? " — already set"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-sm">
              <span className="mb-1 block font-medium text-ink-2">Identify by</span>
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as typeof mode);
                  setLinkId("");
                }}
                className="w-full rounded border border-line bg-surface py-2 pl-3 pr-9 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="entity">An existing client</option>
                <option value="firm">A firm</option>
                <option value="inline">A new client — capture details</option>
              </select>
            </label>
          </div>

          {mode !== "inline" ? (
            /* Searchable, not a raw dropdown: this lists EVERY client, and
               ConveyClear holds the seller and buyer of every transaction it
               has ever run. The role and identify-by pickers above stay plain
               selects — they are three fixed options and searching them would
               be theatre. `kind` rides along as the hint so a trust and the
               person who runs it stay distinguishable. */
            <div className="space-y-3">
              <SearchSelect
                label={mode === "firm" ? (role === "estate_agent" ? "Agency" : "Firm") : "Client"}
                value={linkId}
                onChange={(v) => {
                  setLinkId(v);
                  // The firm changed, so whoever was named at the old one is no
                  // longer meaningful. Clearing beats silently keeping a person
                  // attached to a firm they do not work at.
                  setContactUserId("");
                  setContactName("");
                }}
                options={options.map((o) => ({ value: o.id, label: o.name, hint: o.kind }))}
                placeholder={mode === "firm" ? "Search firms…" : "Search clients…"}
                emptyLabel="Select…"
              />

              {/* Who at the firm (059). Cascades: disabled until a firm is
                  chosen, and scoped to that firm's people. Attorney firms have
                  portal users so they get a picker; estate agencies have none,
                  so they get a name box. Same field, two shapes, because the
                  underlying data genuinely differs. */}
              {mode === "firm" && (
                contactsForFirm.length > 0 ? (
                  <SearchSelect
                    label={role === "estate_agent" ? "Agent" : "Who at the firm"}
                    value={contactUserId}
                    onChange={setContactUserId}
                    options={contactsForFirm.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Search their people…"
                    emptyLabel="— Not known yet —"
                    disabled={!linkId}
                  />
                ) : (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-ink-2">
                      {role === "estate_agent" ? "Agent" : "Who at the firm"}
                    </span>
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      disabled={!linkId}
                      placeholder={linkId ? "Name of the person handling this" : "Pick a firm first"}
                      className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action disabled:bg-raised disabled:text-ink-3"
                    />
                    <span className="mt-1 block text-[11.5px] text-ink-3">
                      {linkId
                        ? "Optional. Nobody at this firm has a portal login yet, so type their name."
                        : "Optional."}
                    </span>
                  </label>
                )
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="text-sm sm:w-48">
                <span className="mb-1 block font-medium text-ink-2">Type</span>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full rounded border border-line bg-surface py-2 pl-3 pr-9 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
                >
                  <option value="natural_person">Person</option>
                  <option value="business">Business</option>
                  <option value="trust">Trust</option>
                </select>
              </label>
              {entityType === "natural_person" ? (
                <>
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block font-medium text-ink-2">
                      First name(s)
                      <span className="ml-1 text-danger">*</span>
                    </span>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
                    />
                  </label>
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block font-medium text-ink-2">
                      Surname
                      <span className="ml-1 text-danger">*</span>
                    </span>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
                    />
                  </label>
                </>
              ) : (
                <label className="flex-1 text-sm">
                  <span className="mb-1 block font-medium text-ink-2">
                    {entityType === "trust" ? "Trust name" : "Business name (as per CIPC)"}
                    <span className="ml-1 text-danger">*</span>
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Registered name"
                    className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
                  />
                </label>
              )}
            </div>
          )}

          {/* Contact details are collected HERE rather than afterwards, because
              this now creates a real client record and a record with only a name
              on it cannot be invited, chased or FICA-verified. They also feed the
              duplicate check, so capturing the same person twice links instead of
              forking. */}
          {mode === "inline" && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex-1 text-sm">
                  <span className="mb-1 block font-medium text-ink-2">
                    Email
                    <span className="ml-1 text-danger">*</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.co.za"
                    className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
                  />
                </label>
                <label className="flex-1 text-sm">
                  <span className="mb-1 block font-medium text-ink-2">
                    Cell
                    <span className="ml-1 text-danger">*</span>
                  </span>
                  <input
                    value={cell}
                    onChange={(e) => setCell(e.target.value)}
                    placeholder="+27 82 000 0000"
                    className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
                  />
                </label>
                <label className="flex-1 text-sm">
                  <span className="mb-1 block font-medium text-ink-2">
                    {entityType === "natural_person" ? "ID number" : "Registration no."}
                    <span className="ml-1 text-danger">*</span>
                  </span>
                  <input
                    value={idNo}
                    onChange={(e) => setIdNo(e.target.value)}
                    className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
                  />
                </label>
              </div>

              {/* The address the API has accepted all along and the form never
                  offered — physicalAddress was handled server-side and written
                  to the client record, and there was no input for it anywhere
                  except the editor you reach AFTER capturing. */}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink-2">Address</span>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, suburb, city"
                  className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
                />
              </label>
            </>
          )}

          {mode === "inline" && (
            <div className="space-y-1.5 text-[12.5px] text-ink-3">
              <p>
                This creates a <span className="font-medium text-ink-2">client record</span> — with
                its own FICA vault, reusable on their next matter. If a client already exists with
                this ID number or email, they are linked instead of duplicated.
              </p>
              {/* Marked, not walled off. FICA wants all three starred fields, but
                  an attorney frequently has a name and one way to reach someone
                  and nothing else yet — refusing the party at that point sends
                  them back to recording it in a note, which is the behaviour the
                  capture flow exists to replace. So the form says what FICA will
                  want, and asks only for what a contactable record needs. */}
              <p>
                <span className="text-danger">*</span> Required for FICA. You can add the party with
                a name and <span className="font-medium text-ink-2">either</span> an email address or
                a cell number — anything still outstanding shows on their client record.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={busy === "add"}
              className="rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "add" ? "Adding…" : "Add party"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded px-3.5 py-2 text-sm font-semibold text-ink-2 hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── The four blocks (§11.7) ─────────────────────────────────────────
          Zewn, 2026-08-31: "we want to make the parties section smaller on
          prop trf aswell and i think if we just have the 4 blocks, each with
          an arrow button then that will drop down the contact details and info
          for each party."

          So the four expected roles ARE the rows now, rather than a summary
          grid sitting above a second list of the same people. Empty ones still
          render — a list of who IS here cannot show who is missing, and "no
          attorney yet" and "this deal has no attorney" look identical when
          both render as nothing.

          🔴 The membership rule is Zewn's, and it is what demotes the estate
          agent: "parties should only be targeted toward people making
          accounts". Estate agencies have no portal role at all (026:44), so
          their agents are not users and never will be under that rule. The
          role is NOT deleted — it moves to the list below.

          2026-09-01: TWO COLUMNS on a wide screen. The Bert Smith cover sheet
          (the layout source, notes §7) puts SELLER and PURCHASER side by side,
          which is how an attorney reads a transaction — two parties facing each
          other, not a queue. One column below `lg`, where side-by-side would
          just make both halves too narrow to read. */}
      <ul className="grid gap-2.5 lg:grid-cols-2">
        {HEADLINE_ROLES.map((r) => {
          const p = parties.find((x) => x.role === r.value);
          if (p) return renderPartyRow(p);
          const Icon = r.icon;
          return (
            <li
              key={r.value}
              className="rounded-lg bg-raised/60 px-4 py-3.5 dark:ring-1 dark:ring-line/60"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-ink-3" />
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink-3">{r.label}</p>
                  <p className="text-[12.5px] text-ink-3">
                    {canEdit ? "Not linked yet — add them above." : "Not linked yet."}
                  </p>
                </div>
              </div>
            </li>
          );
        })}

        {/* The ConveyClear member is the fourth block and is NOT a
            transfer_parties row: that table models parties to the transaction,
            each identified as exactly one of a client, a firm or an inline
            capture (050), and a member is none of those. 077 gives the transfer
            a designated_member_id column instead — the block displays it, the
            column owns it.

            ⚠️ Designation is responsibility, not permission. Colleagues can
            still act, and nothing reads this column for access. */}
        <li className={cn(
          "rounded-lg px-4 py-3.5 dark:ring-1",
          designatedMember
            ? "bg-surface shadow-sm dark:ring-line"
            : "bg-raised/60 dark:ring-line/60"
        )}>
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 shrink-0 text-ink-3" />
            <div className="min-w-0">
              <p className={cn(
                "text-[14.5px] font-semibold",
                designatedMember ? "text-ink" : "text-ink-3"
              )}>
                {designatedMember?.name ?? "ConveyClear member"}
              </p>
              <p className="truncate text-[12.5px] text-ink-3">
                {designatedMember
                  ? "ConveyClear member · colleagues can still assist"
                  : "Nobody assigned yet"}
              </p>
            </div>
          </div>
        </li>
      </ul>

      {/* Everyone else — estate agents, bond and cancellation attorneys —
          still reachable, just no longer competing with the four for the top
          of the section. */}
      {otherParties.length > 0 && (
        <div className="space-y-2.5">
          <p className="mono text-[10px] font-bold uppercase tracking-[0.11em] text-ink-3">
            Other parties
          </p>
          <ul className="space-y-2.5">{otherParties.map(renderPartyRow)}</ul>
        </div>
      )}

      {parties.length === 0 && !designatedMember && (
        <EmptyState title="No parties captured yet">
          Add the seller and buyer to make the two sides of this transaction visible. The council pack
          needs both before it can be generated.
        </EmptyState>
      )}
    </div>
  );
}
