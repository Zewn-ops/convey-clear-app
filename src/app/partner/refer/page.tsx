import { redirect } from "next/navigation";

// Refer-a-matter was removed 2026-08-24 (meeting decision): firms open work by
// requesting a property transfer instead. Kept as a redirect for old bookmarks.
export default function PartnerReferPage() {
  redirect("/partner/transfers/new");
}
