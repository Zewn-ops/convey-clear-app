"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Callout from "@/components/ui/Callout";
import SecretInput from "@/components/ui/SecretInput";
import { KeyRound, Trash2 } from "lucide-react";

export interface FirmMember {
  id: string;
  name: string;
  email: string | null;
}

/** Metadata only — the stored values never reach this component. */
export interface StoredLogin {
  user_id: string;
  municipality: string;
  updated_at: string;
}

const COUNCILS = [
  { value: "COT", label: "City of Tshwane (eTshwane)" },
  { value: "COJ", label: "City of Johannesburg (eJoburg)" },
  { value: "COE", label: "City of Ekurhuleni (RCS)" },
];

/**
 * 🔒 A firm admin records council portal logins for their firm's staff.
 *
 * Both COT and CoE ask a firm for every staff member's council login
 * ("USER'S LOGIN DETAILS — LIST OF ALL STAFF", handwritten notes 2026-08-31).
 *
 * WRITE-ONLY, AND THE UI SAYS SO. Zewn: "make the fields entered but only a
 * conveyclear admin can see the data once entered." So this card can add,
 * replace and remove a login, and can never show one — not even to the person
 * who typed it a moment ago. Pretending otherwise with a disabled-looking
 * field would be worse than saying it plainly.
 *
 * The list below is metadata: who, which council, when it was last set. That
 * is enough to answer "is Sarah's eTshwane login captured?" without the value
 * ever leaving the database.
 */
export default function CouncilLoginsCard({
  members,
  stored,
}: {
  members: FirmMember[];
  stored: StoredLogin[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "Unknown";

  const councilLabel = (code: string) =>
    COUNCILS.find((c) => c.value === code)?.label ?? code;

  const save = async () => {
    if (!userId || !municipality || !username.trim() || !password) {
      return toast.error("Person, council, username and password are all needed.");
    }
    setSaving(true);
    const res = await fetch("/api/partner/firm/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        municipality,
        username: username.trim(),
        password,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast.error(json.message ?? "Could not save the login");

    // Clear immediately. A council password left sitting in a form field after
    // a successful save is the same exposure the eye toggle exists to avoid.
    setUsername("");
    setPassword("");
    setUserId("");
    setMunicipality("");
    toast.success("Council login saved");
    router.refresh();
  };

  const remove = async (login: StoredLogin) => {
    const res = await fetch(
      `/api/partner/firm/credentials?user_id=${encodeURIComponent(login.user_id)}` +
        `&municipality=${encodeURIComponent(login.municipality)}`,
      { method: "DELETE" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message ?? "Could not remove the login");
    toast.success("Council login removed");
    router.refresh();
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-action" />
        <h2 className="font-semibold text-ink">Council portal logins</h2>
      </div>

      <p className="text-xs text-ink-3 -mt-2">
        City of Tshwane and City of Ekurhuleni ask for each staff member&apos;s
        council portal login so ConveyClear can lodge on your behalf.
      </p>

      {/* 🔴 WHO CAN READ IT IS NOT THE FIRM'S PROBLEM, and naming them made it
          one. Zewn, 2026-09-02: "change this message a bit about the logins to
          just say you can only enter it once and then it will be hidden, for
          security purposes … dont mention cc admin or anything like that."
          "Only ConveyClear administrators can read one" was written as
          reassurance and lands as the opposite — it tells an attorney their
          council password is legible to a named group of people. What they need
          is the operating rule: enter it once, it is hidden after that.

          Nothing about the storage changed: still AES-256-GCM at rest with the
          key in the environment (074), still admin-tier read for the one
          purpose. This is the sentence, not the policy. */}
      <Callout tone="waiting" label="Entered once">
        For security, a login is hidden as soon as it is saved and cannot be
        displayed again. To change one, enter it again; to remove it, use the
        bin.
      </Callout>

      {stored.length > 0 && (
        <div className="space-y-2">
          {stored.map((s) => (
            <div
              key={`${s.user_id}-${s.municipality}`}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-raised px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {memberName(s.user_id)}
                </p>
                <p className="truncate text-xs text-ink-3">
                  {councilLabel(s.municipality)} · captured{" "}
                  {new Date(s.updated_at).toLocaleDateString("en-ZA")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(s)}
                className="shrink-0 text-ink-3 hover:text-danger"
                aria-label={`Remove ${memberName(s.user_id)}'s ${s.municipality} login`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Person"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          options={[
            { value: "", label: "— Select —" },
            ...members.map((m) => ({
              value: m.id,
              label: m.email ? `${m.name} · ${m.email}` : m.name,
            })),
          ]}
        />
        <Select
          label="Council"
          value={municipality}
          onChange={(e) => setMunicipality(e.target.value)}
          options={[{ value: "", label: "— Select —" }, ...COUNCILS]}
        />
        <SecretInput
          label="Council username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <SecretInput
          label="Council password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <Button onClick={save} loading={saving} variant="outline">
        Save this login
      </Button>
    </Card>
  );
}
