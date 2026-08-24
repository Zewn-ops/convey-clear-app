"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Star, Trash2, UserPlus } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Who may act for this entity.
 *
 * Attaching someone hands them the entity's whole matter and document history,
 * including its FICA vault, so this is deliberately explicit rather than a
 * quiet dropdown on the client record.
 */

export type MemberRow = {
  id: string;
  role: "owner" | "member";
  isDefault: boolean;
  userId: string;
  userName: string;
  userEmail: string;
};

export type CandidateUser = { id: string; name: string; email: string };

export default function EntityMembers({
  clientId,
  members,
  candidates,
  canManage = false,
}: {
  clientId: string;
  members: MemberRow[];
  candidates: CandidateUser[];
  /** The whole client-members API is admin-only; staff get a read-only view. */
  canManage?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"owner" | "member">("member");

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

  async function add() {
    if (!userId) return toast.error("Pick a person first.");
    const ok = await call(
      {
        url: "/api/admin/client-members",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, clientId, role }),
      },
      "add"
    );
    if (ok) {
      toast.success("Added to this entity.");
      setUserId("");
      setRole("member");
      setAdding(false);
    }
  }

  const available = candidates.filter((c) => !members.some((m) => m.userId === c.id));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">Who can act for this entity</h2>
          <p className="mt-1 text-[13px] text-ink-3">
            Members see every matter, document and FICA record belonging to this entity.
          </p>
        </div>
        {canManage && !adding && available.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
          >
            <UserPlus className="h-4 w-4" /> Add a person
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg bg-raised p-4 shadow-sm dark:ring-1 dark:ring-line">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              <span className="mb-1 block font-medium text-ink-2">Person</span>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="">Select…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:w-40">
              <span className="mb-1 block font-medium text-ink-2">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "owner" | "member")}
                className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button
                onClick={add}
                disabled={busy === "add"}
                className="rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "add" ? "Adding…" : "Add"}
              </button>
              <button
                onClick={() => setAdding(false)}
                className="rounded px-3.5 py-2 text-sm font-semibold text-ink-2 hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState title="Nobody is attached yet">
          Until someone is added, this entity has no login of its own. Its matters are still visible to
          ConveyClear staff and to the referring firm.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-4 rounded-lg bg-surface px-4 py-3.5 shadow-sm dark:ring-1 dark:ring-line"
            >
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-semibold text-ink">{m.userName}</p>
                <p className="truncate text-[12.5px] text-ink-3">{m.userEmail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusPill tone={m.role === "owner" ? "action" : "neutral"}>{m.role}</StatusPill>
                {m.isDefault ? (
                  <StatusPill tone="ok">Default</StatusPill>
                ) : canManage ? (
                  <button
                    title="Make this the entity they land on at login"
                    disabled={busy === m.id}
                    onClick={async () => {
                      const ok = await call(
                        {
                          url: "/api/admin/client-members",
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: m.id, isDefault: true }),
                        },
                        m.id
                      );
                      if (ok) toast.success("Default updated.");
                    }}
                    className="rounded p-1.5 text-ink-3 transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                ) : null}
                {canManage && (
                  <button
                    title="Remove from this entity"
                    disabled={busy === m.id}
                    onClick={async () => {
                      const ok = await call(
                        { url: `/api/admin/client-members?id=${m.id}`, method: "DELETE" },
                        m.id
                      );
                      if (ok) toast.success("Removed.");
                    }}
                    className="rounded p-1.5 text-ink-3 transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
