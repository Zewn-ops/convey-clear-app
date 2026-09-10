"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    // Every password field gets a reveal toggle, and it lives here rather than
    // in each form so sign-in, the reset flow, onboarding and change-password
    // all behave the same way. A password typed blind is the most common reason
    // a correct one gets reported as wrong — most of all the generated
    // temporary passwords handed to clients and partner firms.
    const isPassword = type === "password";
    const [revealed, setRevealed] = useState(false);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-ink-2"
          >
            {label}
            {props.required && <span className="ml-1 text-danger">*</span>}
          </label>
        )}
        <div className={isPassword ? "relative" : undefined}>
          <input
            ref={ref}
            id={inputId}
            type={isPassword && revealed ? "text" : type}
            className={cn(
              "w-full rounded border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3",
              "focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent",
              "disabled:cursor-not-allowed disabled:bg-raised disabled:opacity-60",
              error
                ? "border-danger focus:ring-danger"
                : "border-line",
              // Room for the toggle, so a long password never runs under it.
              isPassword && "pr-10",
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              // Out of the tab order: tabbing off the password field should
              // reach the submit button, not a display control.
              tabIndex={-1}
              disabled={props.disabled}
              aria-controls={inputId}
              aria-pressed={revealed}
              aria-label={revealed ? "Hide password" : "Show password"}
              title={revealed ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-3 transition-colors hover:text-ink-2 focus:outline-none focus-visible:text-action disabled:cursor-not-allowed disabled:opacity-60"
            >
              {revealed ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
