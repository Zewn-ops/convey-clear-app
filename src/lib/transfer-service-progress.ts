import { getPipeline, phaseOrder, phaseSteps, phaseLabel } from "@/lib/pipelines";

/**
 * Progress for one line on a transfer's service checklist.
 *
 * Meeting 2026-08-24 §110: progress bars per service, visible to attorneys and
 * clients.
 *
 * 🔴 THE PROGRESS IS THE MATTER'S. A service line does not track its own
 * percentage. It links to the matter that realises it, and that matter already
 * owns phases, a pipeline and a status. Giving the line item its own progress
 * field would create two answers to "how far along is this" that drift apart the
 * first time someone advances one and not the other — and the matter is the one
 * staff actually work in, so it would be the checklist that goes stale.
 *
 * Derived on the SERVER and passed down as plain data, so the pipeline
 * definitions stay out of the client bundle.
 */

export type ProgressState =
  | "none"        // not_specified / not_applicable — nothing to show
  | "declared"    // already_done — someone did it, not through us
  | "unstarted"   // needed, but no matter opened yet
  | "running"     // matter open, somewhere in its pipeline
  | "complete";   // matter won or archived

export interface ServiceProgress {
  state: ProgressState;
  /** 1-indexed phase, only when running or complete. */
  phase: number;
  total: number;
  label: string;
}

/** The linked matter, as embedded by the transfer pages. */
export interface LinkedMatterShape {
  id: string;
  title: string | null;
  current_phase: string | null;
  status: string | null;
  municipality: string | null;
  service_subtype: string | null;
  services?: { code: string | null } | null;
}

export function serviceProgress(
  status: string,
  matter: LinkedMatterShape | null | undefined
): ServiceProgress {
  const empty = { phase: 0, total: 0, label: "" };

  if (status === "not_applicable" || status === "not_specified") {
    return { state: "none", ...empty };
  }

  // "Already done" is a claim about the world, not about our pipeline — the
  // certificate exists, someone else obtained it. A bar would imply we are
  // working on it.
  if (status === "already_done" && !matter) {
    return { state: "declared", ...empty, label: "Already done" };
  }

  if (!matter) return { state: "unstarted", ...empty, label: "Not started" };

  const done = matter.status === "won" || matter.status === "archived";
  const pipeline = getPipeline(
    matter.services?.code,
    matter.municipality,
    matter.service_subtype
  );

  // No pipeline for this service yet (several are still skeleton configs). Say
  // it is running rather than inventing a denominator — a bar reading "phase 0
  // of 0" is worse than no bar.
  if (!pipeline) {
    return {
      state: done ? "complete" : "running",
      phase: 0,
      total: 0,
      label: done ? "Complete" : matter.current_phase ?? "In progress",
    };
  }

  const steps = phaseSteps(pipeline);
  const idx = phaseOrder(pipeline, matter.current_phase);

  return {
    state: done ? "complete" : "running",
    // phaseOrder is 0-indexed and returns -1 when the phase is unknown; the bar
    // wants a 1-indexed position, and an unknown phase is the start, not the end.
    phase: done ? steps.length : Math.max(1, idx + 1),
    total: steps.length,
    label: done ? "Complete" : phaseLabel(pipeline, matter.current_phase),
  };
}

/** The columns the transfer pages must select for the above to work. */
export const LINKED_MATTER_SELECT =
  "matters(id, title, current_phase, status, municipality, service_subtype, services(code))";
