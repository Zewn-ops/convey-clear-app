"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export interface AdminCredentialRow {
  id: string;
  municipality: string;
  key_version: number;
  updated_at: string;
  person: string;
}

/**
 * 🔒 One stored council login, revealed to an admin on request.
 *
 * Zewn asked for show/hide buttons with a closed and open eye. The obvious
 * build — decrypt every credential server-side and let the eye toggle their
 * visibility — would put every council password for every firm into the HTML
 * of a page that merely lists them. The eye would be hiding values already
 * sitting in the page source.
 *
 * So nothing secret is in this component's props. Clicking the eye fetches
 * exactly one credential from /api/admin/council-credentials, which re-checks
 * the admin tier and decrypts server-side. Hiding it again drops the value
 * from state.
 *
 * That also means each reveal is a request, which can be logged. A pure
 * client-side toggle never can.
 */
export default function CouncilCredentialRow({ row }: { row: AdminCredentialRow }) {
  const [value, setValue] = useState<{ username: string; password: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const reveal = async () => {
    if (value) {
      setValue(null); // hide — the plaintext leaves memory with it
      return;
    }
    setLoading(true);
    const res = await fetch(
      `/api/admin/council-credentials?id=${encodeURIComponent(row.id)}`
    );
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      return toast.error(json.message ?? "Could not read that login");
    }
    setValue({ username: json.username, password: json.password });
  };

  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{row.person}</p>
        <p className="text-xs text-ink-3">
          {row.municipality} · updated{" "}
          {new Date(row.updated_at).toLocaleDateString("en-ZA")}
        </p>

        {value ? (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-xs text-ink-3">Username</dt>
            <dd className="font-mono text-xs text-ink break-all">{value.username}</dd>
            <dt className="text-xs text-ink-3">Password</dt>
            <dd className="font-mono text-xs text-ink break-all">{value.password}</dd>
          </dl>
        ) : (
          <p className="mt-2 font-mono text-xs text-ink-3" aria-hidden="true">
            •••••••• · ••••••••
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={reveal}
        disabled={loading}
        className="shrink-0 inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-raised disabled:opacity-60"
        aria-label={
          value
            ? `Hide ${row.person}'s ${row.municipality} login`
            : `Show ${row.person}'s ${row.municipality} login`
        }
        aria-pressed={Boolean(value)}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : value ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        {value ? "Hide" : "Show"}
      </button>
    </div>
  );
}
