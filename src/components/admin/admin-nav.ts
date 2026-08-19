import type { LucideIcon } from "lucide-react";
import { isAdminRole, type UserRole } from "@/types";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Building2,
  MessageSquare,
  UserCog,
  Landmark,
  Scale,
  BadgeCheck,
  Bell,
  Mail,
  Inbox,
  GraduationCap,
  Building,
  UserPlus,
} from "lucide-react";

// The ONE list of admin navigation destinations. AdminSidebar (desktop) and
// AdminMobileNav (mobile) both render from here — they used to each carry
// their own copy, and the mobile one had silently drifted six pages behind
// (missing Properties, Transfer Requests, Training, Document Approvals,
// Notifications, Signup Requests — noted 2026-08-17). Add new admin pages
// HERE and both navs pick them up.

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
};

export const BASE_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/matters", label: "Matters", icon: Briefcase, exact: false },
  { href: "/admin/property-transfers", label: "Property Transfers", icon: Building2, exact: false },
  { href: "/admin/properties", label: "Properties", icon: Building, exact: false },
  { href: "/admin/transfer-requests", label: "Transfer Requests", icon: Inbox, exact: false },
  { href: "/admin/training", label: "Training", icon: GraduationCap, exact: false },
  { href: "/admin/clients", label: "Clients", icon: Users, exact: false },
  { href: "/admin/firms", label: "Partner Firms", icon: Scale, exact: false },
  { href: "/admin/council-pocs", label: "Council POCs", icon: Landmark, exact: false },
  { href: "/admin/enquiries", label: "Enquiries", icon: MessageSquare, exact: false },
];

// Lower-frequency utility screens — the desktop sidebar tucks these under the
// collapsible "Admin Tools" group so the top-level list doesn't outgrow the
// viewport. Shared by staff and admins, but NOT the same screen for Document
// Approvals: admins get the review queue with Approve/Disapprove, staff get
// their own uploads read-only. Approving your own team's uploads remains
// admin-only (migration 042); the page enforces that, not this nav list.
export const TOOLS_NAV: AdminNavItem[] = [
  { href: "/admin/approvals", label: "Document Approvals", icon: BadgeCheck, exact: false },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, exact: false },
];

const ADMIN_ONLY_TOOLS_NAV: AdminNavItem[] = [
  { href: "/admin/email-signature", label: "Email Signatures", icon: Mail, exact: false },
  { href: "/admin/signup-requests", label: "Signup Requests", icon: UserPlus, exact: false },
  { href: "/admin/users", label: "Users & Access", icon: UserCog, exact: false },
];

/** The Admin Tools items the given role may see. */
export function toolsNavForRole(role?: UserRole | null): AdminNavItem[] {
  return isAdminRole(role) ? [...TOOLS_NAV, ...ADMIN_ONLY_TOOLS_NAV] : TOOLS_NAV;
}
