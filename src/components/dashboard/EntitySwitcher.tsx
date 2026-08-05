"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Building2, User, Landmark } from "lucide-react";
import toast from "react-hot-toast";
import type { Membership } from "@/lib/entity";

/**
 * Picks which entity the dashboard is showing.
 *
 * Renders nothing when the user has one membership: a switcher with a single
 * option is a control that cannot do anything, and it would appear for every
 * existing client on the day this ships.
 */

function icon(kind: Membership["entityType"]) {
  const cls = "h-4 w-4 shrink-0";
  if (kind === "business") return <Building2 className={cls} />;
  if (kind === "trust") return <Landmark className={cls} />;
  return <User className={cls} />;
}

export default function EntitySwitcher({
  memberships,
  activeId,
  label,
  kind,
}: {
  memberships: Membership[];
  activeId: string | null;
  label: (m: Membership) => string;
  kind: (m: Membership) => string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (memberships.length < 2) return null;

  const active = memberships.find((m) => m.clientId === activeId) ?? memberships[0];

  async function choose(m: Membership) {
    if (m.clientId === activeId) return setOpen(false);
    setBusy(true);
    try {
      const res = await fetch("/api/entity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: m.clientId }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Could not switch." }));
        toast.error(error ?? "Could not switch.");
        return;
      }
      setOpen(false);
      // Server components hold the scoped data, so the page has to be re-fetched
      // rather than re-rendered from client state.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm
                   font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40
                   disabled:opacity-60"
      >
        {icon(active.entityType)}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label(active)}</span>
          <span className="block truncate text-[11px] font-normal text-white/50">
            {kind(active)}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/50" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg bg-surface py-1 shadow-lg ring-1 ring-line"
        >
          {memberships.map((m) => {
            const isActive = m.clientId === activeId;
            return (
              <button
                key={m.clientId}
                role="option"
                aria-selected={isActive}
                onClick={() => choose(m)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm
                           text-ink-2 transition-colors hover:bg-raised hover:text-ink
                           focus-visible:outline-none focus-visible:bg-raised"
              >
                <span className="text-ink-3">{icon(m.entityType)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{label(m)}</span>
                  <span className="block truncate text-[11px] text-ink-3">{kind(m)}</span>
                </span>
                {isActive && <Check className="h-4 w-4 shrink-0 text-action" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
