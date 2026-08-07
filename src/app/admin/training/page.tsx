import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";
import TrainingVideos from "@/components/training/TrainingVideos";

export const metadata = { title: "Training — ConveyClear Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTrainingPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");
  return <TrainingVideos audience="staff" />;
}
