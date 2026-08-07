import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/partner";
import TrainingVideos from "@/components/training/TrainingVideos";

export const metadata = { title: "Training — ConveyClear Partner" };
export const dynamic = "force-dynamic";

export default async function PartnerTrainingPage() {
  const auth = await requirePartner();
  if ("error" in auth) redirect("/partner");
  return <TrainingVideos audience="partner" />;
}
