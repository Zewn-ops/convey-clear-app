"use client";

import { useEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Facet } from "@/components/ui/FilterRail";

/**
 * One facet, as a disclosure rather than a native <select>.
 *
 * Native selects were the first cut and were right about affordance, wrong
 * about this layout: each one opens a floating platform menu over the page, so
 * a rail of six reads as six separate widgets bolted to the side. Opening in
 * place makes the rail behave like one control with sections, and lets the
 * chosen option carry a tick instead of only being implied by the trigger text.
 *
 * Only one opens at a time — `open` and `onToggle` are owned by the parent — so
 * expanding a second collapses the first. That is what keeps the rail short
 * enough to stay sticky.
 *
 * Keyboard: the trigger is a real button with aria-expanded, options are real
 * buttons in a listbox, and Escape closes and restores focus. A custom control
 * only earns its place if it gives back what the native one did.
 */
export default function FacetSelect({
  facet,
  value,
  open,
  onToggle,
  onSelect,
}: {
  facet: Facet;
  value: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const isSet = value !== facet.defaultValue;
  const selected = facet.options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onToggle();
        btnRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  return (
    <div ref={ref} className="w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
          // No fill and no outline: the rail should read as part of the page,
          // not as a panel sitting on it. Colour is the only "on" signal.
          isSet ? "font-medium text-action" : "text-ink-2 hover:text-ink"
        )}
      >
        <span className="truncate">
          {isSet ? (
            <>
              <span className="text-ink-3">{facet.label}:</span> {selected?.label}
            </>
          ) : (
            facet.label
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-150",
            open && "rotate-180",
            isSet ? "text-action" : "text-ink-3"
          )}
        />
      </button>

      {open && (
        <ul role="listbox" aria-label={facet.label} className="mb-1 mt-0.5 space-y-0.5 pl-3">
          {facet.options.map((o) => {
            const on = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onSelect(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                    on ? "font-medium text-action" : "text-ink-2 hover:text-ink"
                  )}
                >
                  <Check
                    className={cn("h-3.5 w-3.5 shrink-0", on ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
