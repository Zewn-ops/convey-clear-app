import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import TrainingVideos from "@/components/training/TrainingVideos";

export const metadata = { title: "Training — ConveyClear" };
export const dynamic = "force-dynamic";

export default async function ClientTrainingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");
  return <TrainingVideos audience="client" />;
}
