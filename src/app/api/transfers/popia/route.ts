import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { logTransferActivity } from "@/lib/activity";
import { isStaffRole, type UserRole } from "@/types";
import { TRANSFER_PARTY_SELECT, mapTransferParties } from "@/lib/transfer-parties";
import { CONSENT_REQUIRED_ROLES } from "@/lib/transfer-consent";

export const runtime = "nodejs";

/**
 * Record POPIA consent for the parties to a property transfer (101).
 *
 * Zewn, 2026-09-19: *"make it part of the property transfer and state that it is
 * therefore giving us POPIA consent for any matters related to that transfer."*
 *
 * ── WHAT THIS WRITES ───────────────────────────────────────────────────────
 *
 * One append-only row per party. NOT an update: consent can be withdrawn, and a
 * record edited in place cannot show that it was ever given. Sending a party
 * with granted=false after a granted row is how a withdrawal is recorded, and
 * both rows survive.
 *
 * ── WHO MAY POST ───────────────────────────────────────────────────────────
 *
 * The firm (through its grant on the transfer) or ConveyClear staff. Both are
 * real: the attorney ticks it in the portal, or emails the signed pack and a
 * staff member records that it arrived. 101's INSERT policy pins
 * attested_firm_id to the caller's own firm, so a partner cannot post an
 * attestation in another firm's name even if this route stopped setting it.
 */
export async function POST(request: Request) {
  if (!rateLimit(`transfer-popia:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase
    .from("users")
    .select("id, role, business_partner_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const role = (me.role ?? null) as UserRole | null;
  const isStaff = isStaffRole(role);
  const isPartner = role === "business_partner" && Boolean(me.business_partner_id);
  if (!isStaff && !isPartner) {
    return NextResponse.json({ message: "Not allowed" }, { status: 403 });
  }

  let body: {
    transfer_id?: string;
    /** Party ids the caller is attesting FOR. Anything omitted is untouched. */
    granted_party_ids?: string[];
    /** Party ids being withdrawn. */
    withdrawn_party_ids?: string[];
    evidence_document_id?: string | null;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const transferId = (body.transfer_id ?? "").trim();
  if (!transferId) {
    return NextResponse.json({ message: "A transfer is required." }, { status: 400 });
  }

  const granted = Array.from(new Set(body.granted_party_ids ?? []));
  const withdrawn = Array.from(new Set(body.withdrawn_party_ids ?? []));
  if (granted.length === 0 && withdrawn.length === 0) {
    return NextResponse.json({ message: "Nothing to record." }, { status: 400 });
  }
  // A party in both lists is a caller bug, and guessing which they meant would
  // write a legal record on a coin toss.
  const both = granted.filter((id) => withdrawn.includes(id));
  if (both.length) {
    return NextResponse.json(
      { message: "A party cannot be both consented and withdrawn in one request." },
      { status: 400 }
    );
  }

  // 🔴 READ THE PARTIES THROUGH THE CALLER'S CLIENT, not the service role.
  // RLS decides whether this firm may see this transfer at all, so a party list
  // that comes back empty is the authorisation answer — and the loop below then
  // writes nothing, because every id fails the "is this party on this transfer"
  // check. The service role here would happily let one firm attest consent on
  // another firm's transaction.
  const { data: partyRows } = await supabase
    .from("transfer_parties")
    .select(TRANSFER_PARTY_SELECT)
    .eq("transfer_id", transferId);

  const parties = mapTransferParties(
    partyRows as Parameters<typeof mapTransferParties>[0],
    { linkClients: false }
  );
  if (parties.length === 0) {
    return NextResponse.json(
      { message: "That transfer has no parties captured, or you cannot access it." },
      { status: 404 }
    );
  }

  const byId = new Map(parties.map((p) => [p.id, p]));
  const consentable = new Set(CONSENT_REQUIRED_ROLES as readonly string[]);

  const rows: Record<string, unknown>[] = [];
  for (const [ids, isGranted] of [
    [granted, true],
    [withdrawn, false],
  ] as const) {
    for (const id of ids) {
      const party = byId.get(id);
      // Unknown id, or a party this consent is not about. The attorney and the
      // estate agent act in a professional capacity — they are not the data
      // subjects, and accepting a tick for them would make the gate satisfiable
      // without either real party having been asked.
      if (!party) {
        return NextResponse.json(
          { message: "That party is not on this transfer." },
          { status: 400 }
        );
      }
      if (!consentable.has(party.role)) {
        return NextResponse.json(
          { message: `POPIA consent is recorded for the seller and buyer, not the ${party.role.replace(/_/g, " ")}.` },
          { status: 400 }
        );
      }
      rows.push({
        transfer_id: transferId,
        transfer_party_id: party.id,
        // Denormalised so the record survives the party being edited or
        // removed — see the cascade note in 101.
        party_name: party.who,
        party_role: party.role,
        consent_type: "popia",
        granted: isGranted,
        attested_by: me.id,
        attested_firm_id: me.business_partner_id ?? null,
        evidence_document_id: body.evidence_document_id || null,
        note: (body.note ?? "").trim() || null,
      });
    }
  }

  // Written with the service role, AFTER the caller's own client has proved
  // access by returning the parties above. Staff have no business_partner_id, so
  // 101's INSERT policy (which pins attested_firm_id to the caller's firm) would
  // refuse a staff attestation outright — the check that matters happened above.
  const admin = createAdminClient();
  const { error } = await admin.from("transfer_consents").insert(rows);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const names = rows.filter((r) => r.granted).map((r) => r.party_name as string);
  const pulled = rows.filter((r) => !r.granted).map((r) => r.party_name as string);
  const parts: string[] = [];
  if (names.length) parts.push(`POPIA consent recorded for ${names.join(" and ")}`);
  if (pulled.length) parts.push(`POPIA consent withdrawn for ${pulled.join(" and ")}`);

  await logTransferActivity(admin, {
    transferId,
    activityType: "note",
    body: parts.join(". ") + ".",
    authorId: me.id,
    authorLabel: isStaff ? "ConveyClear" : undefined,
  });

  return NextResponse.json({ ok: true, recorded: rows.length });
}
