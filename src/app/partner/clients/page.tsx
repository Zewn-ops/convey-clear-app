import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Table, THead, TH, TBody, TR, TD, TEmpty } from "@/components/ui/Table";
import StatusPill from "@/components/ui/StatusPill";
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
    <div className="mx-auto max-w-5xl space-y-8">
      <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Your clients</h1>

      <Table>
        <THead>
          <TH>Client</TH>
          <TH>Type</TH>
          <TH hideBelow="md">Email</TH>
          <TH hideBelow="md">Added</TH>
        </THead>
        <TBody>
          {clients.map((c) => (
            <TR key={c.id}>
              <TD strong>
                <Link href={`/partner/clients/${c.id}`} className="text-action hover:underline">
                  {clientDisplayName(c)}
                </Link>
              </TD>
              <TD>
                <StatusPill tone="neutral">{c.entity_type.replace("_", " ")}</StatusPill>
              </TD>
              <TD hideBelow="md">{c.primary_email || "—"}</TD>
              <TD hideBelow="md">{formatDate(c.created_at)}</TD>
            </TR>
          ))}
          {clients.length === 0 && (
            <TEmpty colSpan={4}>
              No clients yet. They appear here once you refer a matter.
            </TEmpty>
          )}
        </TBody>
      </Table>
    </div>
  );
}
