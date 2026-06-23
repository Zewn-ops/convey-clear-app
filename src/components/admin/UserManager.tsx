"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import {
  ADMIN_ROLES,
  ASSIGNABLE_ROLES_BY_ADMIN,
  ASSIGNABLE_ROLES_BY_SUPER,
  ROLE_LABELS,
  composeFullName,
  isSuperAdmin,
  type AppUser,
  type BusinessPartner,
  type UserRole,
} from "@/types";
import { formatDate } from "@/lib/utils";
import { UserPlus, Building2, Copy, Check, KeyRound, X, Pencil, RotateCcw } from "lucide-react";

// Temp-password handover survives a page reload (sessionStorage) until the admin
// explicitly dismisses it — so it isn't lost if the page refreshes after create.
const CRED_KEY = "cc_created_cred";

const ROLE_BADGE: Record<string, "default" | "info" | "success" | "warning" | "gray"> = {
  super_admin: "default",
  admin: "default",
  staff_services: "info",
  staff_ops: "info",
  staff_delivery: "info",
  business_partner: "warning",
  client: "success",
};

export default function UserManager({
  callerRole,
  initialUsers,
  partners,
}: {
  callerRole: UserRole;
  initialUsers: AppUser[];
  partners: BusinessPartner[];
}) {
  const router = useRouter();
  const assignable = isSuperAdmin(callerRole)
    ? ASSIGNABLE_ROLES_BY_SUPER
    : ASSIGNABLE_ROLES_BY_ADMIN;

  // --- create user form state ---
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>("client");
  const [entityType, setEntityType] = useState<"natural_person" | "business" | "trust">("natural_person");
  const [businessName, setBusinessName] = useState("");
  const [cell, setCell] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdCred, setCreatedCredState] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Restore a pending credential handover after a reload, so it isn't lost.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CRED_KEY);
      if (raw) setCreatedCredState(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const setCreatedCred = (c: { email: string; password: string } | null) => {
    setCreatedCredState(c);
    try {
      if (c) sessionStorage.setItem(CRED_KEY, JSON.stringify(c));
      else sessionStorage.removeItem(CRED_KEY);
    } catch {
      /* ignore */
    }
  };

  // Password reset is admin-only for the demo (self-service email reset is off —
  // reset emails don't deliver yet). Reset is done inline via Edit → Reset password.

  // --- new partner firm form state ---
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [firmName, setFirmName] = useState("");
  const [firmType, setFirmType] = useState("law_firm");
  const [firmEmail, setFirmEmail] = useState("");
  const [firmLoading, setFirmLoading] = useState(false);

  const resetForm = () => {
    setEmail(""); setFirstName(""); setLastName(""); setRole("client");
    setEntityType("natural_person"); setBusinessName(""); setCell(""); setPartnerId("");
  };

  const createUser = async () => {
    if (!email.trim()) return toast.error("Email is required");
    if (role === "business_partner" && !partnerId) return toast.error("Select a partner firm");
    setLoading(true);
    setCreatedCred(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email, full_name: composeFullName(firstName, lastName), first_name: firstName, last_name: lastName, role,
        entity_type: entityType,
        business_name: businessName,
        primary_cell: cell,
        business_partner_id: role === "business_partner" ? partnerId : null,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not create user");
    toast.success("Account created");
    setCreatedCred({ email, password: json.temp_password });
    resetForm();
    router.refresh();
  };

  const createFirm = async () => {
    if (!firmName.trim()) return toast.error("Firm name is required");
    setFirmLoading(true);
    const res = await fetch("/api/admin/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: firmName, partner_type: firmType, primary_email: firmEmail }),
    });
    const json = await res.json();
    setFirmLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Could not create firm");
    toast.success("Partner firm created");
    setFirmName(""); setFirmEmail(""); setShowPartnerForm(false);
    router.refresh();
  };

  const toggleActive = async (u: AppUser) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: u.id, active: !u.active }),
    });
    if (!res.ok) {
      const j = await res.json();
      return toast.error(j.message ?? "Update failed");
    }
    toast.success(u.active ? "Account deactivated" : "Account activated");
    router.refresh();
  };

  // --- edit existing user ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", phone: "", role: "client" as UserRole });
  const [editLoading, setEditLoading] = useState(false);

  // A plain admin can't edit a privileged (admin/super_admin) account.
  const canEdit = (u: AppUser) => isSuperAdmin(callerRole) || !ADMIN_ROLES.includes(u.role);

  const startEdit = (u: AppUser) => {
    setEditingId(u.id);
    setEditForm({ full_name: u.full_name ?? "", email: u.email, phone: u.phone ?? "", role: u.role });
  };

  // Role options for the editor: the caller's assignable roles, plus the target's
  // current role if it isn't assignable (legacy roles) so it still shows.
  const editRoleOptions = (current: UserRole) => {
    const opts = [...assignable];
    if (!opts.includes(current)) opts.unshift(current);
    return opts.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }));
  };

  const saveEdit = async (u: AppUser) => {
    setEditLoading(true);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: u.id,
        full_name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
      }),
    });
    const json = await res.json();
    setEditLoading(false);
    if (!res.ok) return toast.error(json.message ?? "Update failed");
    toast.success("User updated");
    setEditingId(null);
    router.refresh();
  };

  const resetPassword = async (u: AppUser) => {
    if (!confirm(`Generate a new temporary password for ${u.full_name || u.email}? Their current password will stop working.`)) return;
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: u.id, generate_password: true }),
    });
    const json = await res.json();
    if (!res.ok) return toast.error(json.message ?? "Could not reset password");
    setCreatedCred({ email: u.email, password: json.temp_password });
    toast.success("New password generated — hand it over below");
  };

  const copyCred = () => {
    if (!createdCred) return;
    navigator.clipboard.writeText(
      `ConveyClear login\nURL: ${window.location.origin}/auth/login\nEmail: ${createdCred.email}\nTemporary password: ${createdCred.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isClientRole = role === "client";

  return (
    <div className="space-y-6">
      {/* Credential handover banner (shown once after create) */}
      {createdCred && (
        <Card className="border-green-300 bg-green-50">
          <div className="flex items-start gap-3">
            <KeyRound className="h-5 w-5 text-green-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-green-900 text-sm">Login created — share these credentials now</p>
              <p className="text-xs text-green-800 mt-0.5">
                This stays here (even if you reload) until you dismiss it. Email delivery is sandboxed during testing — copy and hand it over directly.
              </p>
              <div className="mt-2 rounded-lg bg-white border border-green-200 p-3 text-sm font-mono text-gray-800">
                <div>Email: {createdCred.email}</div>
                <div>Temp password: <span className="font-semibold">{createdCred.password}</span></div>
              </div>
              <Button size="sm" variant="outline" className="mt-2" onClick={copyCred}>
                {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy handover text</>}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setCreatedCred(null)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-1 text-green-700 hover:bg-green-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Create user */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="h-5 w-5 text-[#1B2E6B]" />
          <h2 className="font-semibold text-gray-900">Create a login</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="First name(s)" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
          <Input label="Surname" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.co.za" />
          <Select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            options={assignable.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          />
          <Input label="Cell number" value={cell} onChange={(e) => setCell(e.target.value)} placeholder="+27 82 000 0000" />

          {isClientRole && (
            <>
              <Select
                label="Entity type"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as typeof entityType)}
                options={[
                  { value: "natural_person", label: "Natural Person" },
                  { value: "business", label: "Business" },
                  { value: "trust", label: "Trust" },
                ]}
              />
              {entityType !== "natural_person" && (
                <Input label="Business / Trust name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Acme (Pty) Ltd" />
              )}
            </>
          )}

          {role === "business_partner" && (
            <Select
              label="Partner firm"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              placeholder="Select a firm…"
              options={partners.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={createUser} loading={loading}>
            <UserPlus className="h-4 w-4" /> Create login
          </Button>
          <p className="text-xs text-gray-500">
            A temporary password is generated and shown once for handover.
          </p>
        </div>
      </Card>

      {/* Partner firms */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#1B2E6B]" />
            <h2 className="font-semibold text-gray-900">Partner firms</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowPartnerForm((s) => !s)}>
            {showPartnerForm ? "Cancel" : "+ Add firm"}
          </Button>
        </div>

        {showPartnerForm && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 rounded-lg bg-gray-50 p-4">
            <Input label="Firm name" value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Sterling & Associates" />
            <Select
              label="Type"
              value={firmType}
              onChange={(e) => setFirmType(e.target.value)}
              options={[
                { value: "law_firm", label: "Law Firm" },
                { value: "conveyancer", label: "Conveyancer" },
                { value: "attorney", label: "Attorney" },
                { value: "estate_agent", label: "Estate Agency" },
                { value: "other", label: "Other" },
              ]}
            />
            <Input label="Contact email" value={firmEmail} onChange={(e) => setFirmEmail(e.target.value)} placeholder="info@firm.co.za" />
            <div className="sm:col-span-3">
              <Button size="sm" onClick={createFirm} loading={firmLoading}>Create firm</Button>
            </div>
          </div>
        )}

        {partners.length === 0 ? (
          <p className="text-sm text-gray-400">No partner firms yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {partners.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                {p.name}
                <span className="text-xs text-gray-400">{p.partner_type}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* User list */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Created</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {initialUsers.map((u) => (
                <Fragment key={u.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{u.full_name || "—"}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge label={ROLE_LABELS[u.role] ?? u.role} variant={ROLE_BADGE[u.role] ?? "gray"} />
                    </td>
                    <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-3">
                      <Badge label={u.active ? "Active" : "Disabled"} variant={u.active ? "success" : "gray"} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {canEdit(u) && (
                          <button
                            onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:underline"
                          >
                            <Pencil className="h-3.5 w-3.5" /> {editingId === u.id ? "Close" : "Edit"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleActive(u)}
                          className="text-xs font-medium text-[#E8521A] hover:underline"
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingId === u.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-5 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input label="Full name" value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
                          <Input label="Email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                          <Input label="Cell number" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+27 82 000 0000" />
                          <Select
                            label="Role"
                            value={editForm.role}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                            options={editRoleOptions(u.role)}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Button size="sm" onClick={() => saveEdit(u)} loading={editLoading}>Save changes</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                          <Button size="sm" variant="outline" onClick={() => resetPassword(u)}>
                            <RotateCcw className="h-4 w-4" /> Reset password
                          </Button>
                          <span className="text-xs text-gray-400">Reset issues a new temp password shown once above.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {initialUsers.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">No users yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
