import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import { getSessionProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/types";
import { ShieldCheck } from "lucide-react";
import { getInitials } from "@/lib/utils";

export const metadata = { title: "Profile — ConveyClear" };

export default async function ProfilePage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");
  const profile = session.profile;
  if (!profile) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-action">Profile</h1>
        <p className="text-sm text-ink-3 mt-1">Your account details</p>
      </div>

      <Card className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-action-fill flex items-center justify-center text-white text-xl font-bold shrink-0">
          {getInitials(profile.full_name ?? "")}
        </div>
        <div>
          <p className="font-semibold text-ink">{profile.full_name ?? "—"}</p>
          <p className="text-sm text-ink-3">{profile.email}</p>
          <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-action bg-action-fill/10 rounded-full px-2 py-0.5 capitalize">
            <ShieldCheck className="h-3 w-3" />
            {ROLE_LABELS[profile.role]}
          </span>
        </div>
      </Card>

      <Card className="bg-action-fill/5 border-line/20">
        <p className="text-xs font-semibold text-action uppercase tracking-wide mb-2">
          Your Data Rights (POPIA)
        </p>
        <p className="text-xs text-ink-2 leading-relaxed">
          Under the Protection of Personal Information Act (POPIA), you have the
          right to access, correct, and request deletion of your personal
          information. Contact{" "}
          <a href="mailto:privacy@conveyclear.co.za" className="text-action underline">
            privacy@conveyclear.co.za
          </a>{" "}
          to exercise these rights.
        </p>
      </Card>
    </div>
  );
}
