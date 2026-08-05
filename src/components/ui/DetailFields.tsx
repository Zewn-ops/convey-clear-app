"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A record's facts, in two tiers.
 *
 * The info cards on a client and a transfer had the opposite problems. The
 * transfer's showed three fields and stopped, so anything else meant opening
 * Edit to read it. The client's showed everything it held but silently dropped
 * blank optional fields, so a half-captured record looked complete — you could
 * not tell "no address" from "address not asked for".
 *
 * Both are answered by the same shape: a PRIMARY tier that is always open, and
 * an EXTRA tier behind one toggle. Blank fields are legitimate content in the
 * extra tier — that is where "not captured" is the useful answer — and are kept
 * out of the primary tier, where they would be noise.
 */

export type DetailField = {
  label: string;
  value: string | null | undefined;
  /** Span both columns — long free text reads badly in a narrow one. */
  wide?: boolean;
  /** Blank shows as "Not captured" rather than "—": a missing required field is information. */
  required?: boolean;
};

export function DetailValue({ label, value, wide, required }: DetailField) {
  const empty = value == null || String(value).trim() === "";
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-medium text-ink", empty && "text-ink-3")}>
        {empty ? (required ? "Not captured" : "—") : value}
      </dd>
    </div>
  );
}

export default function DetailFields({
  primary,
  extra = [],
  moreLabel = "More detail",
  lessLabel = "Less detail",
}: {
  primary: DetailField[];
  extra?: DetailField[];
  moreLabel?: string;
  lessLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // Count what is actually missing, so the toggle can say whether opening it is
  // worth doing. "More detail (3 not captured)" is a reason to click; a bare
  // chevron over an empty drawer is a small betrayal on a record staff check daily.
  const missing = extra.filter((f) => f.value == null || String(f.value).trim() === "").length;

  return (
    <>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {primary.map((f, i) => (
          <DetailValue key={`${f.label}-${i}`} {...f} />
        ))}
      </dl>

      {extra.length > 0 && (
        <>
          {open && (
            <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2">
              {extra.map((f, i) => (
                <DetailValue key={`${f.label}-${i}`} {...f} />
              ))}
            </dl>
          )}

          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-action hover:underline"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            {open ? lessLabel : moreLabel}
            {!open && (
              <span className="font-normal text-ink-3">
                ({extra.length} more{missing > 0 ? `, ${missing} not captured` : ""})
              </span>
            )}
          </button>
        </>
      )}
    </>
  );
}
