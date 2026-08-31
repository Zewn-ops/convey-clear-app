import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notifyStaff } from "@/lib/notify";

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
  const fields = {
    property_description: propertyDescription,
    municipality: str("municipality"),
    suggested_reference: suggestedReference,
    seller_name: str("seller_name"),
    seller_email: str("seller_email"),
    seller_cell: str("seller_cell"),
    buyer_name: str("buyer_name"),
    buyer_email: str("buyer_email"),
    buyer_cell: str("buyer_cell"),
    notes: str("notes"),
    status: isDraft ? "draft" : "pending",
  };

  // Updating an existing draft, or creating a row. Both go through the
  // CALLER's client, never the service role: 078's UPDATE policy is
  // `status = 'draft'` on the OLD row, so the database — not this route — is
  // what stops a firm editing a request it has already submitted, or pulling a
  // decided one back to draft.
  const { data, error } = draftId
    ? await supabase
        .from("transfer_requests")
        .update(fields)
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
  if (!isDraft) {
    await notifyStaff({
      type: "transfer_request",
      title: "New property transfer request",
      body: propertyDescription ?? "A property transfer",
      link: "/admin/transfer-requests",
    });
  }

  return NextResponse.json({ ok: true, id: data.id, status: fields.status });
}
