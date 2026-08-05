import { PHASE_LABELS, type MatterPhase } from "@/types";

/**
 * Renders matters.current_phase for a list row.
 *
 * There are TWO phase vocabularies in the data and this column met both:
 * the legacy numeric phases ("1".."4", PHASE_LABELS) and the pipeline phase
 * keys the stepper uses ("new_instruction", "onboarding", "operations",
 * "client_delivery", "offboarding", "successful"). Indexing PHASE_LABELS with
 * a pipeline key returned undefined, so list rows rendered the literal string
 * "Phase operations: undefined" to the user.
 *
 * Prettifying the key rather than importing the pipeline is deliberate: the
 * list queries do not select service_code/municipality, so getPipeline() is not
 * available here, and all three pipelines name these phases identically anyway.
 * Anything unrecognised degrades to a humanised key — never "undefined".
 */
export function matterPhaseLabel(phase?: string | null): string {
  if (!phase) return "—";

  const legacy = PHASE_LABELS[phase as MatterPhase];
  if (legacy) return `Phase ${phase}: ${legacy}`;

  return phase
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
