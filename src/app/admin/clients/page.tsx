import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { isStaffRole, clientDisplayName, type Client } from "@/types";

export const metadata = { title: "Clients — ConveyClear Admin" };

const entityLabels: Record<string, string> = {
  natural_person: "Individual",
  business: "Business",
  trust: "Trust",
};

const entityVariants: Record<string, "info" | "default" | "gray"> = {
  natural_person: "info",
  business: "default",
  trust: "gray",
};

export default async function AdminClientsPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, entity_type, full_name, business_name, primary_email, primary_cell, created_at")
    .order("created_at", { ascending: false });

  const clients = (data as Client[] | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-500 mt-1">{clients.length} registered client{clients.length === 1 ? "" : "s"}</p>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Cell</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-medium text-gray-900">{clientDisplayName(client)}</span>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <Badge
                      label={entityLabels[client.entity_type] ?? client.entity_type}
                      variant={entityVariants[client.entity_type] ?? "gray"}
                    />
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{client.primary_email ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{client.primary_cell ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{formatDate(client.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/clients/${client.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">No clients yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
