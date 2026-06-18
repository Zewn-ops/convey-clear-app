import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  PHASE_LABELS,
  MATTER_STATUS_LABELS,
  type Client,
  type Matter,
  type MatterPhase,
  type MatterStatus,
} from "@/types";
import { ArrowLeft, Mail, Phone, MapPin } from "lucide-react";

export const metadata = { title: "Client — ConveyClear Partner" };

function statusVariant(s: string): "info" | "success" | "danger" | "warning" | "gray" {
  return ({ open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[s] ?? "gray";
}

// Partner-facing client profile. RLS scopes `clients`/`matters` to the partner's
// firm, so an out-of-firm id simply returns nothing → notFound.
export default async function PartnerClientDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: clientData } = await supabase
    .from("clients")
    .select("id, entity_type, full_name, business_name, registration_no, id_number, primary_email, primary_cell, physical_address, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!clientData) notFound();
  const client = clientData as Client;

  const { data: matterData } = await supabase
    .from("matters")
    .select("id, title, current_phase, status, municipality, created_at, clients(full_name, business_name)")
    .eq("client_id", params.id)
    .order("created_at", { ascending: false });
  const matters = (matterData as Matter[] | null) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/partner/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to clients
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{clientDisplayName(client)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {client.entity_type.replace("_", " ")}
            {client.registration_no ? ` · ${client.registration_no}` : ""} · added {formatDate(client.created_at)}
          </p>
        </div>
      </div>

      <Card>
        <h2 className="font-semibold text-gray-900 mb-3">Contact</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400" />
            {client.primary_email ? (
              <a href={`mailto:${client.primary_email}`} className="text-[#1B2E6B] hover:underline">{client.primary_email}</a>
            ) : (
              <span className="text-gray-400">No email</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-400" />
            {client.primary_cell ? (
              <a href={`tel:${client.primary_cell.replace(/[^\d+]/g, "")}`} className="text-[#1B2E6B] hover:underline">{client.primary_cell}</a>
            ) : (
              <span className="text-gray-400">No cell</span>
            )}
          </div>
          {client.id_number && (
            <div className="text-gray-700"><span className="text-gray-400">ID/Reg: </span>{client.id_number}</div>
          )}
          {client.physical_address && (
            <div className="flex items-start gap-2 sm:col-span-2">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
              <span className="text-gray-700">{client.physical_address}</span>
            </div>
          )}
        </dl>
      </Card>

      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Matters ({matters.length})</h2>
        <Card padding="none">
          <ul className="divide-y divide-gray-100">
            {matters.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{m.title || "Untitled matter"}</p>
                  <p className="text-xs text-gray-400">
                    {m.municipality ? `${m.municipality} · ` : ""}
                    {m.current_phase ? `Phase ${m.current_phase}: ${PHASE_LABELS[m.current_phase as MatterPhase]}` : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {m.status && <Badge label={MATTER_STATUS_LABELS[m.status as MatterStatus]} variant={statusVariant(m.status)} />}
                  <Link href={`/partner/matters/${m.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">View</Link>
                </div>
              </li>
            ))}
            {matters.length === 0 && <li className="px-5 py-10 text-center text-gray-400">No matters for this client</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
