import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Give a brand-new transfer its service checklist.
 *
 * Zewn, 2026-08-28: *"the service list should be created automatically when the
 * property transfer is approved/created."*
 *
 * Until now this was a BUTTON. A transfer opened on an empty card reading "No
 * service list yet / Create the service list", and somebody had to press it.
 * Every transfer needs one, so requiring a click to get the thing every transfer
 * needs was a step that existed only because nobody had removed it.
 *
 * WHY HERE AND NOT A DATABASE TRIGGER
 *   063's own comment on instantiate_transfer_services says it is *"deliberately
 *   not a trigger — when a checklist appears is a product decision, not a
 *   database one."* That reasoning still holds, and it points at this: the
 *   application calls it at the three moments a transfer is born, and those
 *   moments stay visible in the code that creates transfers rather than
 *   disappearing into the schema.
 *
 * BEST-EFFORT, AND DELIBERATELY SO. A transfer that exists without its checklist
 * is recoverable — the "Create the service list" button remains as the fallback,
 * both for a failure here and for every transfer created before today. Failing
 * the whole creation because the checklist did not instantiate would trade a
 * complete outcome for a partial one, which is the wrong way round.
 *
 * The RPC is idempotent (063) and returns how many rows it actually inserted, so
 * calling it twice is harmless and a re-run on an existing transfer is a no-op.
 */
export async function ensureTransferServices(
  admin: SupabaseClient,
  transferId: string,
  actorId: string | null = null
): Promise<number> {
  const { data, error } = await admin.rpc("instantiate_transfer_services", {
    t_id: transferId,
    actor: actorId,
  });
  if (error) {
    console.error(
      `[transfer-services] transfer ${transferId} created without its checklist: ${error.message}`
    );
    return 0;
  }
  return (data as number | null) ?? 0;
}
