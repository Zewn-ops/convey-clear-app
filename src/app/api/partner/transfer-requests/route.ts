import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notifyStaff } from "@/lib/notify";
import { createTransferFromRequest } from "@/lib/transfer-from-request";

export const runtime = "nodejs";

/**
 * An attorney firm asks ConveyClear to open a property transfer (055).
 *
 * Meeting 2 (2026-08-06) moved transfer creation behind ConveyClear so one
 * vetted client database is maintained without firms reaching each other's
 * contacts (§84). A firm supplies what it knows; ConveyClear turns that into a
 * transfer and real client records.
 *
 * Written through the CALLER's client, not the service role: 055's insert policy
 * pins firm_id to app_user_partner_id(), so the database refuses a request
 * lodged in another firm's name even if this route stopped setting it. That is
 * worth more than the convenience of the admin client.
 */
export async function POST(request: Request) {
  if (!rateLimit(`transfer-request:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requirePartner();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const str = (k: string): string | null => {
    const v = body[k];
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  };

  // 078 — a firm can save a half-written request and come back to it. Zewn,
  // 2026-08-31: "if they get halfway with a request and want to return later
  // they can draft it and finish it later on."
  //
  // The same endpoint serves both, because they are the same form: `status`
  // says whether this is a working copy or an actual request, and `id` says
  // whether an existing draft is being updated rather than a new row created.
  const isDraft = body.status === "draft";
  const draftId = str("id");

  const propertyDescription = str("property_description");
  // A draft that cannot be saved until it is complete is not a draft, so the
  // required fields are enforced on SUBMISSION only. The database says the
  // same thing (078's conditional CHECKs), so this is the readable message
  // rather than the boundary.
  if (!isDraft && !propertyDescription) {
    return NextResponse.json(
      { message: "Describe the property — an erf number or address." },
      { status: 400 }
    );
  }

  // 061 — the firm's reference is mandatory (2026-08-11 §78) and becomes the
  // reference of the transfer created on approval. Checked here as well as by
  // the constraint so the firm gets a sentence, not a 23514.
  const suggestedReference = str("suggested_reference");
  if (!isDraft && !suggestedReference) {
    return NextResponse.json(
      { message: "Your transfer reference is required — it becomes the reference for this transfer." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Catch a clash NOW rather than at approve time.
  //
  // The reference lands on property_transfers, which is globally unique. Without
  // this the firm submits happily and the collision surfaces days later in front
  // of a staff member who cannot fix it — the reference belongs to the firm, so
  // only they can say what it should be instead.
  //
  // ⚠️ Read with the ADMIN client on purpose. A transfer owned by ANOTHER firm
  // still occupies the reference, and the caller cannot see it through RLS — a
  // caller-scoped check would pass here and then fail on approval, which is the
  // exact failure this is meant to prevent. It discloses nothing: the answer is
  // "that reference is taken", never whose it is.
  //
  // 🔴 OPEN QUESTION, deliberately not settled in the schema: whether a firm's
  // code must be unique GLOBALLY or only within that firm. Two firms can both
  // run a file "2026/001". The existing convention embeds a firm prefix
  // (SH-2026-0417) which makes global uniqueness work in practice, but nothing
  // enforces the prefix. Raise with Jukka before this bites.
  //
  // Skipped for a draft: the reference may not even be typed yet, and refusing
  // to SAVE a working copy because a field it does not yet have might one day
  // clash would defeat the point. Submission still checks, which is the moment
  // it matters.
  const adminRead = createAdminClient();
  const { data: clash } = suggestedReference && !isDraft
    ? await adminRead
        .from("property_transfers")
        .select("id")
        .ilike("reference", suggestedReference)
        .limit(1)
        .maybeSingle()
    : { data: null };
  if (clash) {
    return NextResponse.json(
      {
        message: `Reference "${suggestedReference}" is already in use. Check whether this transfer has already been opened, or send a different reference.`,
      },
      { status: 409 }
    );
  }
  // 088 — the party detail. A trimmed list of strings, and two JSONB arrays.
  //
  // ⚠️ SERVER-SIDE COMPLETENESS IS NOT OPTIONAL. The form checks the same rule
  // and prints a friendlier sentence, but the form is a convenience; this and
  // 088's CHECK constraints are what actually hold. Jukka's reason for the
  // fields is verification — staff compare what was typed against the FICA
  // documents — and a request that arrives half-filled cannot be verified, so
  // it must not become `pending`.
  const emails = (key: string): string[] => {
    const v = body[key];
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x !== "");
  };
  const directors = (key: string) => {
    const v = body[key];
    if (!Array.isArray(v)) return [];
    return v
      .map((d) => {
        const row = (d ?? {}) as Record<string, unknown>;
        const pick = (k: string) => (typeof row[k] === "string" ? (row[k] as string).trim() : "");
        return {
          name: pick("name"),
          id_number: pick("id_number"),
          cell: pick("cell"),
          email: pick("email"),
        };
      })
      // A director with no name at all is an empty row somebody opened and left.
      .filter((d) => d.name !== "");
  };

  const party = (role: "seller" | "buyer") => ({
    name: str(`${role}_name`),
    email: str(`${role}_email`),
    cell: str(`${role}_cell`),
    entityType: str(`${role}_entity_type`),
    idNumber: str(`${role}_id_number`),
    registrationNo: str(`${role}_registration_no`),
  });

  if (!isDraft) {
    if (!str("municipality")) {
      return NextResponse.json(
        { message: "Choose the council — we cannot say what is needed without it." },
        { status: 400 }
      );
    }
    for (const role of ["seller", "buyer"] as const) {
      const p = party(role);
      // Unnamed is allowed and always was: firms supply what they know
      // (2026-08-11). Half-named is what changed.
      if (!p.name) continue;
      const Role = role === "seller" ? "Seller" : "Buyer";
      const missing: string[] = [];
      if (!p.email) missing.push(`${Role} email`);
      if (!p.cell) missing.push(`${Role} cell`);
      if (!p.entityType) missing.push(`${Role} type`);
      else if (p.entityType === "natural_person" && !p.idNumber) {
        missing.push(`${Role} ID number`);
      } else if (p.entityType !== "natural_person" && !p.registrationNo) {
        missing.push(
          p.entityType === "trust" ? `${Role} trust (IT) number` : `${Role} registration number`
        );
      }
      if (missing.length) {
        return NextResponse.json(
          { message: `Still needed before we can open this transfer: ${missing.join(", ")}.` },
          { status: 400 }
        );
      }
    }
  }

  const fields = {
    property_description: propertyDescription,
    municipality: str("municipality"),
    suggested_reference: suggestedReference,
    seller_name: str("seller_name"),
    seller_email: str("seller_email"),
    seller_cell: str("seller_cell"),
    seller_entity_type: str("seller_entity_type"),
    seller_id_number: str("seller_id_number"),
    seller_registration_no: str("seller_registration_no"),
    seller_extra_emails: emails("seller_extra_emails"),
    seller_directors: directors("seller_directors"),
    buyer_name: str("buyer_name"),
    buyer_email: str("buyer_email"),
    buyer_cell: str("buyer_cell"),
    buyer_entity_type: str("buyer_entity_type"),
    buyer_id_number: str("buyer_id_number"),
    buyer_registration_no: str("buyer_registration_no"),
    buyer_extra_emails: emails("buyer_extra_emails"),
    buyer_directors: directors("buyer_directors"),
    notes: str("notes"),
    status: isDraft ? "draft" : "pending",
  };

  // Updating an existing draft, or creating a row. Both go through the
  // CALLER's client, never the service role: 078's UPDATE policy is
  // `status = 'draft'` on the OLD row, so the database — not this route — is
  // what stops a firm editing a request it has already submitted, or pulling a
  // decided one back to draft.
  // 🔴 A RETURNED REQUEST CANNOT GO BACK TO `draft`. 089's coherence check says a
  // draft has no reviewer and no transfer, and a request sent back for changes
  // has both — it was reviewed, and since 083 its draft transfer exists. So
  // "Save as draft" on a returned request keeps it in `changes_requested`, which
  // is the truth anyway: it is still with the firm, still unsent, and staff can
  // still see that they are waiting on it.
  let savedStatus = fields.status;
  if (draftId && isDraft) {
    const { data: existing } = await supabase
      .from("transfer_requests")
      .select("status")
      .eq("id", draftId)
      .maybeSingle();
    if ((existing as { status?: string } | null)?.status === "changes_requested") {
      savedStatus = "changes_requested";
    }
  }

  const { data, error } = draftId
    ? await supabase
        .from("transfer_requests")
        .update({ ...fields, status: savedStatus })
        .eq("id", draftId)
        .select("id")
        .single()
    : await supabase
        .from("transfer_requests")
        .insert({ ...fields, firm_id: auth.partnerId, requested_by: auth.userId })
        .select("id")
        .single();

  if (error) {
    // RLS refusing the write surfaces as 42501, not a 403.
    if (error.code === "42501") {
      return NextResponse.json({ message: "You cannot lodge this request." }, { status: 403 });
    }
    // A zero-row UPDATE means the row is no longer a draft — most likely it was
    // submitted in another tab. Said plainly, because "not found" would be a
    // lie and a silent success would lose their edit.
    if (error.code === "PGRST116" && draftId) {
      return NextResponse.json(
        {
          message:
            "This request has already been submitted, so it can no longer be edited.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  // 🔒 Staff are told about a REQUEST, never about a draft. A draft is the
  // firm's private working copy — 078 hides it from staff reads entirely, and
  // notifying them about one would announce what the policy conceals.
  // ── The transfer now exists from the moment the request is sent ────────────
  //
  // Jukka call, 2026-09-01. Zewn: "an attorney sends through a request which
  // creates the property transfer box … and then instead of us approving it
  // before it gets created, it gets created in a draft state and then we approve
  // it." Jukka: "That's fine."
  //
  // The reason is the waiting: "they can send through the request, create the
  // draft transfer as an attorney, and then maybe they're waiting on one or two
  // documents to still come through … before ConveyClear has been able to
  // approve that transfer, they can still go in and upload to that transfer
  // while it's in draft state."
  //
  // 🔒 A DRAFT IS NOT LIVE WORK AND IS NOT THE CLIENT'S. 083 excludes drafts
  // from `client_transfers`, so a seller cannot see an instruction ConveyClear
  // has not accepted. The firm's own access is the ordinary grant (052), written
  // by the builder — no second access path.
  //
  // Only on SUBMISSION. A 078 draft REQUEST is the firm's private working copy;
  // building a transfer from one would publish a half-typed form to staff.
  //
  // Best-effort by design: the request is lodged and that is what the attorney
  // asked for. If the build fails, approval still creates the transfer the old
  // way — createTransferFromRequest is the same function on both paths.
  let draftTransferId: string | null = null;
  if (!isDraft && suggestedReference) {
    const built = await createTransferFromRequest(
      createAdminClient(),
      {
        id: data.id,
        firm_id: auth.partnerId,
        requested_by: auth.userId,
        property_description: propertyDescription,
        municipality: str("municipality"),
        notes: str("notes"),
        // The parties as typed, so the draft transfer opens with its seller and
        // buyer already on it (2026-09-02) instead of asking for them twice.
        seller_name: fields.seller_name,
        seller_email: fields.seller_email,
        seller_cell: fields.seller_cell,
        seller_entity_type: fields.seller_entity_type,
        seller_id_number: fields.seller_id_number,
        seller_registration_no: fields.seller_registration_no,
        buyer_name: fields.buyer_name,
        buyer_email: fields.buyer_email,
        buyer_cell: fields.buyer_cell,
        buyer_entity_type: fields.buyer_entity_type,
        buyer_id_number: fields.buyer_id_number,
        buyer_registration_no: fields.buyer_registration_no,
      },
      suggestedReference,
      auth.userId,
      "draft"
    );
    if (built.ok) {
      draftTransferId = built.transferId;
      // 🔴 THE ADMIN CLIENT, NOT THE CALLER'S.
      //
      // 078's firm policy is USING (firm_id = … AND status = 'draft'), and by
      // this point the row is 'pending'. Writing through the caller matched zero
      // rows and was refused SILENTLY — no error, just no update — so
      // transfer_id stayed null and approval went on to build a SECOND transfer
      // with the same reference, which the unique index then rejected with a
      // 409. Found by approving a request on production, 2026-09-01.
      //
      // This is a system linkage, not a firm edit: the row's own status must not
      // gate it, and the policy is correct to refuse a user doing this.
      const { error: linkError } = await createAdminClient()
        .from("transfer_requests")
        .update({ transfer_id: built.transferId })
        .eq("id", data.id);
      if (linkError) {
        console.error(
          `[transfer-requests] request ${data.id} could not be linked to transfer ${built.transferId}: ${linkError.message}`
        );
      }
    } else {
      console.error(
        `[transfer-requests] request ${data.id} lodged but its draft transfer was not created: ${built.message}`
      );
    }
  }

  if (!isDraft) {
    await notifyStaff({
      type: "transfer_request",
      title: "New property transfer request",
      body: propertyDescription ?? "A property transfer",
      link: "/admin/transfer-requests",
    });
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    status: fields.status,
    transfer_id: draftTransferId,
  });
}
