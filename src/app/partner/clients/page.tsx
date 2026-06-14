import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { clientDisplayName, type Client } from "@/types";

export const metadata = { title: "Clients — ConveyClear Partner" };

export default async function PartnerClients() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, entity_type, full_name, business_name, primary_email, primary_cell, created_at")
    .order("created_at", { ascending: false });
  const clients = (data as Client[] | null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Your clients</h1>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{clientDisplayName(c)}</td>
                  <td className="px-5 py-3"><Badge label={c.entity_type.replace("_", " ")} variant="gray" /></td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{c.primary_email || "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{formatDate(c.created_at)}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400">No clients yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
