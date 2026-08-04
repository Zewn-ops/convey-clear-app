"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface SearchOption {
  value: string;
  label: string;
  /** Second line — a matter's client, a client's email. Also searched. */
  hint?: string;
}

// A <select> you can type into. Same shape as ui/Select (label + value + options)
// so it is a drop-in where the list has grown past what a raw dropdown can carry.
//
// Jukka asked for this on the transfer's client and matter pickers, which are raw
// dropdowns of EVERY client and EVERY unlinked matter. That is fine at 28 matters
// and unusable at 300 — and the transfer form has four of them on one screen.
//
// Deliberately dependency-free and uncontrolled-by-a-library: it is a filtered
// listbox, not a combobox with async loading. If the option count ever outgrows
// "fetch them all and filter in the browser", this is the seam to change.
export default function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Search…",
  emptyLabel = "— None —",
  required,
  disabled,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  /** Label for the "nothing selected" choice. Pass null to make the field mandatory. */
  emptyLabel?: string | null;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  // Close on an outside click. Without this the panel stays open behind the next
  // field you click, which on the transfer form (four of these) is a mess.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
    setActive(0);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = matches[active];
      if (opt) pick(opt.value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </span>
      )}

      <div ref={boxRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm",
            "focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] focus:border-transparent",
            "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60"
          )}
        >
          <span className={cn("truncate", selected ? "text-gray-900" : "text-gray-500")}>
            {selected ? selected.label : (emptyLabel ?? placeholder)}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {selected && emptyLabel !== null && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="text-gray-300 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </span>
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="w-full text-sm focus:outline-none"
              />
            </div>

            <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
              {emptyLabel !== null && !query && (
                <li>
                  <button
                    type="button"
                    onClick={() => pick("")}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                  >
                    {emptyLabel}
                    {!value && <Check className="h-3.5 w-3.5 text-[#1B2E6B]" />}
                  </button>
                </li>
              )}

              {matches.length === 0 ? (
                <li className="px-3 py-3 text-sm text-gray-500">No match for “{query}”</li>
              ) : (
                matches.map((o, i) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(o.value)}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm",
                        i === active ? "bg-gray-50" : "",
                        o.value === value ? "text-[#1B2E6B]" : "text-gray-800"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{o.label}</span>
                        {o.hint && <span className="block truncate text-xs text-gray-500">{o.hint}</span>}
                      </span>
                      {o.value === value && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
