import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { isAdminRole } from "@/types";
import FirmForm from "@/components/firms/FirmForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "New Firm — ConveyClear Admin" };

export default async function NewFirmPage() {
  const session = await getSessionProfile();
  if (!session || !isAdminRole(session.profile?.role)) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/firms" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to firms
      </Link>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">New partner firm</h1>
        <p className="text-sm text-ink-3 mt-1">
          The attorney, conveyancer or estate-agent org that refers matters. Add its logins afterwards
          under Users &amp; Access.
        </p>
      </div>
      <FirmForm />
    </div>
  );
}
