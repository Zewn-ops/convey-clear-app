import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isPartnerRole } from "@/types";
import { createClient } from "@/lib/supabase/server";
import PartnerNav from "@/components/partner/PartnerNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import PortalFooter from "@/components/ui/PortalFooter";

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  if (!session || !isPartnerRole(session.profile?.role)) redirect("/auth/login");

  let firmName = "Partner Portal";
  if (session.profile?.business_partner_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("firms")
      .select("name")
      .eq("id", session.profile.business_partner_id)
      .maybeSingle();
    if (data?.name) firmName = data.name;
  }

  const isFirmAdmin = Boolean(session.profile?.is_firm_admin);

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0">
        <PartnerNav firmName={firmName} variant="desktop" isFirmAdmin={isFirmAdmin} />
      </div>
      <div className="flex flex-col flex-1 md:ml-64">
        <PartnerNav firmName={firmName} variant="mobile" isFirmAdmin={isFirmAdmin} />
        <NotificationBell base="/partner" />
        {/* pb-32: Zewn, 2026-09-02 — "add a bit of padding to the bottom of
            the pages. around 100-150px otherwise it feels squished." The last
            card on a long page used to end a few pixels above the viewport
            floor, which reads as the page having been cut off. */}
        <main className="flex-1 p-4 pb-32 md:p-6 md:pb-36">{children}</main>
        <PortalFooter />
      </div>
    </div>
  );
}
