"use client";

import { useFormStatus } from "react-dom";

// A submit button that disables itself while its form's server action is in
// flight.
//
// This is half the fix for duplicated activity-feed rows. A server action on this
// app takes 1–2s; with a plain <button type="submit"> nothing on screen changes
// while it runs, so the button reads as dead and gets clicked again. Both requests
// then race, and a check-then-insert dedupe on the server loses that race because
// both read "nothing there yet" before either writes. (The other half is the
// server-side idempotency guard in lib/activity.ts — a disabled button stops the
// honest double-click, not a determined one.)
//
// useFormStatus reads the pending state of the NEAREST parent <form>, which is why
// this has to be its own client component rather than a prop on the page.
export default function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: {
  children: React.ReactNode;
  /** Shown in place of the label while the action runs. Defaults to "Saving…". */
  pendingLabel?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
