"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import PhaseProgress from "@/components/ui/PhaseProgress";
import type { ServiceProgress } from "@/lib/transfer-service-progress";
import { ChevronRight, Plus, Trash2, ListChecks } from "lucide-react";

/**
 * The property transfer as an umbrella over its services.
 *
 * Meeting 2026-08-24 §114: "line items with expandable arrows to reveal related
 * sub-services". §122: each carries a marker — not applicable / already done /
 * needs to be done — which staff set, and which drives what ConveyClear does.
 *
 * 🔴 The prerequisite rule is DISPLAYED, never enforced. §114 records that EBP,
 * Certificates, MAD and PRC must clear before Change of Ownership — but whether
 * the portal should BLOCK that ordering was never said out loud in the meeting,
 * and the notes say to ask before building a hard gate. So Change of Ownership
 * shows what is still outstanding above it and stops there. Nothing here
 * prevents anyone doing anything.
 */

// Keys are `services.code`, NOT the meeting's abbreviations. 063 used EBP/PRC
// and those two lines could never link to a matter — see 066.
export const SERVICE_LABELS: Record<string, string> = {
  BP: "Existing Building Plans",
  CERT: "Certificates",
  RCF: "Property Rates Clearance",
  MAD: "Municipal Account Dispute",
  COO: "Change of Ownership",
  REFUND: "Refund",
  OTHER: "Other",
};

/** The default line items, in municipal order — mirrors instantiate_transfer_services (063). */
export const DEFAULT_SERVICE_CODES = ["BP", "CERT", "RCF", "MAD", "COO", "REFUND", "OTHER"] as const;

/** §114 — these must be complete before Change of Ownership proceeds. */
const COO_PREREQUISITES = ["BP", "CERT", "RCF", "MAD"] as const;

/** The sub-services named in the meeting. Suggestions, not a closed list. */
const SUGGESTED: Record<string, string[]> = {
  // §118
  BP: ["Occupational certificate", "Sectional scheme plans", "Site development plan", "Floor plans"],
  // §120
  CERT: ["Electrical", "Building standards", "Environmental", "Gas"],
};

const STATUS_LABEL: Record<string, string> = {
  // 064. "Not specified" is the starting state: before the firm or the client
  // has told us, the portal must not assert that a service is needed.
  not_specified: "Not specified",
  needed: "Needs to be done",
  already_done: "Already done",
  not_applicable: "Not applicable",
};

// Zewn, 2026-08-26: needs-to-be-done blue, already-done green, not-applicable
// amber. The tones are named by MEANING rather than colour, so "action" is the
// blue one and "waiting" the amber — see components/ui/StatusPill.tsx, where the
// fills are contrast-measured against white text.
const STATUS_TONE: Record<string, StatusTone> = {
  not_specified: "neutral",
  needed: "action",
  already_done: "ok",
  not_applicable: "waiting",
};

export interface ServiceRow {
  id: string;
  parent_id: string | null;
  service_code: string | null;
  label: string | null;
  status: string;
  third_party: string | null;
  notes: string | null;
  matter_id: string | null;
  position: number;
  /** Derived server-side by lib/transfer-service-progress.ts. */
  progress?: ServiceProgress;
  matterTitle?: string | null;
}

export default function TransferServices({
  transferId,
  rows,
  canManage = false,
  matterHrefBase = "/admin/matters",
}: {
  transferId: string;
  rows: ServiceRow[];
  /** Staff only. §122 has the markers set by ConveyClear, not by the firm. */
  canManage?: boolean;
  matterHrefBase?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const top = rows.filter((r) => !r.parent_id).sort((a, b) => a.position - b.position);
  const childrenOf = (id: string) => rows.filter((r) => r.parent_id === id);

  // Outstanding prerequisites, for the advisory note on Change of Ownership.
  const outstanding = top
    .filter((r) => COO_PREREQUISITES.includes(r.service_code as never) && r.status === "needed")
    .map((r) => SERVICE_LABELS[r.service_code ?? ""] ?? r.service_code);

  async function call(init: RequestInit & { url: string }, key: string) {
    setBusy(key);
    try {
      const { url, ...rest } = init;
      const res = await fetch(url, rest);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "That did not work.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string) {
    const ok = await call(
      {
        url: "/api/transfer-services",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      },
      id
    );
    if (ok) toast.success(STATUS_LABEL[status]);
  }

  async function addSub(parentId: string, label: string) {
    const name = label.trim();
    if (!name) return toast.error("Give the sub-service a name.");
    const ok = await call(
      {
        url: "/api/transfer-services",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferId, parentId, label: name }),
      },
      parentId
    );
    if (ok) {
      toast.success("Added.");
      setDraft("");
      setAddingTo(null);
      setOpen((s) => new Set(s).add(parentId));
    }
  }

  // Nothing instantiated yet.
  //
  // For STAFF: offer to create it, rather than auto-creating on render — a GET
  // that writes is a trap, and not every transfer wants the full list.
  //
  // For everyone else (Zewn, 2026-08-26): show the seven services as
  // "Not specified" instead. A firm cannot create the list, so telling them one
  // does not exist is a dead end — it explains an absence they have no way to
  // resolve. Showing the standard shape answers the question they actually have,
  // which is "what does this transaction involve", and claims nothing about any
  // of them until ConveyClear sets a marker.
  if (!top.length && !canManage) {
    return (
      <ul className="divide-y divide-line">
        {DEFAULT_SERVICE_CODES.map((code) => (
          <li key={code} className="flex items-center gap-3 px-5 py-3.5">
            <span className="flex-1 truncate text-[15px] font-medium text-ink">
              {SERVICE_LABELS[code]}
            </span>
            <StatusPill tone="neutral">{STATUS_LABEL.not_specified}</StatusPill>
          </li>
        ))}
      </ul>
    );
  }

  if (!top.length) {
    return (
      <div className="px-5 py-10 text-center">
        <ListChecks className="mx-auto h-8 w-8 text-ink-3" />
        <p className="mt-3 font-medium text-ink">No service list yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
          A transfer is an umbrella over six services. Create the standard list and mark each one as
          needed, already done, or not applicable.
        </p>
        {canManage && (
          <button
            disabled={busy === "init"}
            onClick={async () => {
              const ok = await call(
                {
                  url: "/api/transfer-services",
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ transferId }),
                },
                "init"
              );
              if (ok) toast.success("Service list created.");
            }}
            className="mt-4 inline-flex items-center gap-2 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create the service list
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {top.map((r) => {
        const code = r.service_code ?? "";
        const kids = childrenOf(r.id);
        const isOpen = open.has(r.id);
        const suggestions = (SUGGESTED[code] ?? []).filter(
          (s) => !kids.some((k) => k.label?.toLowerCase() === s.toLowerCase())
        );
        const isCoo = code === "COO";

        return (
          <li key={r.id} className="px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* The disclosure is the whole left cluster, not a 12px chevron —
                  a target you have to aim at is a target you misclick. */}
              <button
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                    return n;
                  })
                }
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-150 ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
                <span className="truncate text-[15px] font-medium text-ink">
                  {SERVICE_LABELS[code] ?? code}
                </span>
                {kids.length > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-ink-3">{kids.length}</span>
                )}
              </button>

              {r.matter_id ? (
                <Link
                  href={`${matterHrefBase}/${r.matter_id}`}
                  className="shrink-0 text-xs font-medium text-action hover:underline"
                >
                  Open matter
                </Link>
              ) : (
                canManage &&
                r.status === "needed" &&
                code !== "OTHER" && (
                  // Explicit, not automatic — see the note above the component.
                  <Link
                    href={`/admin/matters/new?transfer=${transferId}&service=${code}`}
                    className="shrink-0 text-xs font-medium text-action hover:underline"
                  >
                    Open as matter
                  </Link>
                )
              )}

              {canManage ? (
                // A native select: the marker is a one-of-three choice, and this
                // is the control every user already knows how to work.
                <select
                  value={r.status}
                  disabled={busy === r.id}
                  onChange={(e) => setStatus(r.id, e.target.value)}
                  className="shrink-0 rounded border border-line bg-surface px-2 py-1 text-xs font-medium text-ink disabled:opacity-50"
                >
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </StatusPill>
              )}
            </div>

            {/* §114, shown and not enforced. Deliberately advisory wording: it
                reports the municipal reality, it does not claim the portal is
                stopping anyone. */}
            {isCoo && outstanding.length > 0 && (
              <p className="mt-2 pl-6 text-xs text-ink-3">
                Municipal sequence: {outstanding.join(", ")} normally clear{" "}
                {outstanding.length === 1 ? "s" : ""} before change of ownership.
              </p>
            )}

            {r.third_party && (
              <p className="mt-1 pl-6 text-xs text-ink-3">Rendered by {r.third_party}</p>
            )}

            {/* §110 — progress per service, for staff, attorneys and clients
                alike. It is the linked MATTER's progress; a service line has no
                percentage of its own. */}
            {r.progress && r.progress.state !== "none" && (
              <div className="mt-2 pl-6">
                {r.progress.total > 0 ? (
                  <PhaseProgress
                    phase={r.progress.phase}
                    total={r.progress.total}
                    label={r.progress.label}
                    done={r.progress.state === "complete"}
                  />
                ) : (
                  <p
                    className={`text-xs ${
                      r.progress.state === "complete" || r.progress.state === "declared"
                        ? "text-ok"
                        : "text-ink-3"
                    }`}
                  >
                    {r.progress.label}
                  </p>
                )}
              </div>
            )}

            {isOpen && (
              <div className="mt-2.5 space-y-1.5 pl-6">
                {kids.map((k) => (
                  <div key={k.id} className="flex items-center gap-3">
                    <span className="flex-1 truncate text-sm text-ink-2">{k.label}</span>
                    {canManage ? (
                      <>
                        <select
                          value={k.status}
                          disabled={busy === k.id}
                          onChange={(e) => setStatus(k.id, e.target.value)}
                          className="rounded border border-line bg-surface px-2 py-0.5 text-xs text-ink disabled:opacity-50"
                        >
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <button
                          title="Remove"
                          disabled={busy === k.id}
                          onClick={async () => {
                            const ok = await call(
                              { url: `/api/transfer-services?id=${k.id}`, method: "DELETE" },
                              k.id
                            );
                            if (ok) toast.success("Removed.");
                          }}
                          className="rounded p-1 text-ink-3 transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <StatusPill tone={STATUS_TONE[k.status] ?? "neutral"}>
                        {STATUS_LABEL[k.status] ?? k.status}
                      </StatusPill>
                    )}
                  </div>
                ))}

                {!kids.length && !canManage && (
                  <p className="text-xs text-ink-3">Nothing listed under this service yet.</p>
                )}

                {canManage &&
                  (addingTo === r.id ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addSub(r.id, draft);
                          if (e.key === "Escape") {
                            setAddingTo(null);
                            setDraft("");
                          }
                        }}
                        placeholder="Sub-service name"
                        className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
                      />
                      <button
                        disabled={busy === r.id}
                        onClick={() => addSub(r.id, draft)}
                        className="rounded bg-action-fill px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setAddingTo(null);
                          setDraft("");
                        }}
                        className="text-xs text-ink-3 hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => setAddingTo(r.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add sub-service
                      </button>
                      {/* The meeting named these. One click beats retyping
                          "Occupational certificate" on every transfer. */}
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          disabled={busy === r.id}
                          onClick={() => addSub(r.id, s)}
                          className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-3 transition-colors hover:border-action hover:text-action disabled:opacity-50"
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
