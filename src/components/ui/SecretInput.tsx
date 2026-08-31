"use client";

import { forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SecretInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * A masked field with a show/hide eye — Zewn, 2026-08-31: "add one of those
 * 'show password' 'show username' buttons with a closed and open eye
 * respectively."
 *
 * Used on BOTH council-login fields, username as well as password, which is
 * unusual and deliberate: a council username is as much a credential as the
 * password beside it, and a firm admin entering logins for six colleagues
 * needs to check what they typed without leaving it on screen.
 *
 * ⚠️ This is shoulder-surfing protection, not a security boundary. What
 * protects these values is encryption at rest (lib/council-credentials.ts),
 * the admin-only RLS policy (074), and the fact that the reveal endpoint hands
 * back one credential at a time. A toggle in the browser protects nothing on
 * its own.
 *
 * Mirrors ui/Input's markup so the two sit together in a form without
 * betraying that they are different components.
 */
const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const [revealed, setRevealed] = useState(false);
    const generatedId = useId();
    const inputId = id || `${label?.toLowerCase().replace(/\s+/g, "-") ?? "secret"}-${generatedId}`;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink-2">
            {label}
            {props.required && <span className="ml-1 text-danger">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={revealed ? "text" : "password"}
            // A council login is not the user's own password, so offering to
            // save it to their browser keychain is actively wrong.
            autoComplete="off"
            data-1p-ignore
            className={cn(
              "w-full rounded border bg-surface px-3 py-2 pr-10 text-sm text-ink placeholder:text-ink-3",
              "focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent",
              "disabled:cursor-not-allowed disabled:bg-raised disabled:opacity-60",
              error ? "border-danger focus:ring-danger" : "border-line",
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className={cn(
              "absolute inset-y-0 right-0 flex items-center px-3",
              "text-ink-3 hover:text-ink-2",
              "focus:outline-none focus:ring-2 focus:ring-action rounded-r"
            )}
            // The label states what the button DOES, not what it shows —
            // a screen reader user has no eye to read.
            aria-label={revealed ? `Hide ${label ?? "value"}` : `Show ${label ?? "value"}`}
            aria-pressed={revealed}
            tabIndex={-1}
          >
            {revealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";

export default SecretInput;
