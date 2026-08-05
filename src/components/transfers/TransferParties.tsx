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
} from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import EmptyState from "@/components/ui/EmptyState";
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
};

export type PartyOption = { id: string; name: string; kind: string };

const roleLabel = (r: string) =>
  PARTY_ROLES.find((x) => x.value === r)?.label ?? r.replace(/_/g, " ");

function viaIcon(via: PartyRow["via"], kind?: string) {
  const cls = "h-4 w-4 shrink-0 text-ink-3";
  if (via === "firm") return <Scale className={cls} />;
  if (kind === "trust") return <Landmark className={cls} />;
  if (kind === "business") return <Building2 className={cls} />;
  return <User className={cls} />;
}

/** One labelled line of the contact card. Renders nothing when there is no value. */
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
  if (!value?.trim()) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
        {href ? (
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

export default function TransferParties({
  transferId,
  parties,
  entities,
  firms,
  canEdit,
  clientHrefBase,
  showIdNumbers = false,
}: {
  transferId: string;
  parties: PartyRow[];
  entities: PartyOption[];
  firms: PartyOption[];
  canEdit: boolean;
  /**
   * Where a linked client's record lives, e.g. "/admin/clients". Omitted on the
   * partner portal, which has no such route — there the contact card is the
   * whole answer rather than a step toward one.
   */
  clientHrefBase?: string;
  /** FICA ID numbers are staff-only. Off unless a caller opts in. */
  showIdNumbers?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [role, setRole] = useState<string>("seller");
  const [mode, setMode] = useState<"entity" | "firm" | "inline">("entity");
  const [linkId, setLinkId] = useState("");
  const [entityType, setEntityType] = useState("natural_person");
  const [name, setName] = useState("");

  const taken = new Set(parties.map((p) => p.role));

  async function add() {
    const body: Record<string, unknown> = { transferId, role };
    if (mode === "entity") {
      if (!linkId) return toast.error("Pick an entity, or capture the details instead.");
      body.clientId = linkId;
    } else if (mode === "firm") {
      if (!linkId) return toast.error("Pick a firm.");
      body.firmId = linkId;
    } else {
      if (!name.trim()) return toast.error("A name is required.");
      body.entityType = entityType;
      if (entityType === "natural_person") body.fullName = name;
      else body.businessName = name;
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

  const options = mode === "firm" ? firms : entities;

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
                className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
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
                className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="entity">An existing client</option>
                <option value="firm">A firm</option>
                <option value="inline">Capture details now</option>
              </select>
            </label>
          </div>

          {mode !== "inline" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink-2">
                {mode === "firm" ? "Firm" : "Client"}
              </span>
              <select
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="">Select…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.kind}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="text-sm sm:w-48">
                <span className="mb-1 block font-medium text-ink-2">Type</span>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
                >
                  <option value="natural_person">Person</option>
                  <option value="business">Business</option>
                  <option value="trust">Trust</option>
                </select>
              </label>
              <label className="flex-1 text-sm">
                <span className="mb-1 block font-medium text-ink-2">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={entityType === "natural_person" ? "Full name" : "Registered name"}
                  className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
                />
              </label>
            </div>
          )}

          {mode === "inline" && (
            <p className="text-[12.5px] text-ink-3">
              A captured party is a name on this transfer only. They get no login and no FICA vault
              until someone creates a client record for them.
            </p>
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

      {parties.length === 0 ? (
        <EmptyState title="No parties captured yet">
          Add the seller and buyer to make the two sides of this transaction visible. The council pack
          needs both before it can be generated.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {parties.map((p) => {
            const open = openId === p.id;
            const c = p.contact;
            const hasDetail = Boolean(
              c && (c.email || c.cell || c.address || c.registrationNo || (showIdNumbers && c.idNumber))
            );
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
                    onClick={() => setOpenId(open ? null : p.id)}
                    aria-expanded={open}
                    aria-controls={`party-${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {viaIcon(p.via, p.detail ?? undefined)}
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold text-ink">{p.who}</p>
                      <p className="truncate text-[12.5px] text-ink-3">
                        {roleLabel(p.role)}
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
                  <div id={`party-${p.id}`} className="border-t border-line bg-raised px-4 py-3.5">
                    {hasDetail ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ContactLine
                          icon={Mail}
                          label="Email"
                          value={c!.email}
                          href={c!.email ? `mailto:${c!.email}` : undefined}
                        />
                        <ContactLine
                          icon={Phone}
                          label="Cell"
                          value={c!.cell}
                          // Spaces are display formatting, not part of the number.
                          href={c!.cell ? `tel:${c!.cell.replace(/\s+/g, "")}` : undefined}
                        />
                        <ContactLine icon={MapPin} label="Address" value={c!.address} />
                        <ContactLine icon={Hash} label="Registration no." value={c!.registrationNo} />
                        {showIdNumbers && (
                          <ContactLine icon={Fingerprint} label="ID number" value={c!.idNumber} />
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] text-ink-3">
                        {p.via === "inline"
                          ? "No contact details were captured for this party."
                          : "This record carries no contact details yet."}
                      </p>
                    )}

                    {clientHref && (
                      <Link
                        href={clientHref}
                        className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-action hover:underline"
                      >
                        Open client record <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
