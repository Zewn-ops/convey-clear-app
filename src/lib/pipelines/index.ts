import type { Pipeline, PipelinePhase, PipelineStage } from "./types";
import { phaseClientName } from "./types";
import { cotCoo } from "./cot-coo";
import { cotRcf } from "./cot-rcf";
import { cotRcc } from "./cot-rcc";

export * from "./types";

// Registry of all defined pipelines. Add COJ/COE variants here as they land.
export const PIPELINES: Pipeline[] = [cotCoo, cotRcf, cotRcc];

// Resolve a pipeline for a matter. PRC (service code RCF) splits on subtype
// (RCF/RCC); COO has no subtype. Municipality defaults to COT (the only set
// defined so far) — returns null when no definition exists so callers can fall
// back gracefully.
export function getPipeline(
  serviceCode?: string | null,
  municipality?: string | null,
  subtype?: string | null
): Pipeline | null {
  const svc = (serviceCode ?? "").toUpperCase();
  const muni = (municipality ?? "COT").toUpperCase();
  const sub = (subtype ?? "").toUpperCase() || undefined;
  return (
    PIPELINES.find(
      (p) =>
        p.serviceCode === svc &&
        p.municipality === muni &&
        (p.subtype ?? undefined) === (svc === "RCF" ? sub : undefined)
    ) ?? null
  );
}

export interface FlatStage {
  phase: PipelinePhase;
  stage: PipelineStage;
  phaseIndex: number;
  stageIndexInPhase: number;
  absoluteIndex: number; // position across the whole pipeline (0-based)
}

// Flatten all stages in order with their phase context + absolute index.
export function flattenStages(p: Pipeline): FlatStage[] {
  const out: FlatStage[] = [];
  let abs = 0;
  p.phases.forEach((phase, phaseIndex) => {
    phase.stages.forEach((stage, stageIndexInPhase) => {
      out.push({ phase, stage, phaseIndex, stageIndexInPhase, absoluteIndex: abs++ });
    });
  });
  return out;
}

export function findPhase(p: Pipeline, phaseKey?: string | null): PipelinePhase | null {
  if (!phaseKey) return null;
  return p.phases.find((ph) => ph.key === phaseKey) ?? null;
}

export function findStage(p: Pipeline, stageKey?: string | null): FlatStage | null {
  if (!stageKey) return null;
  return flattenStages(p).find((f) => f.stage.key === stageKey) ?? null;
}

// The first real stage (used to initialise a matter past the pre-phase).
export function firstPosition(p: Pipeline): { phaseKey: string; stageKey: string } | null {
  const first = flattenStages(p)[0];
  return first ? { phaseKey: first.phase.key, stageKey: first.stage.key } : null;
}

// Stages skipped between a previous and a new position (General Note: if a
// matter jumps Stage 1 → Stage 4, list the skipped ones on the activity feed).
export function skippedStageNames(p: Pipeline, fromStageKey: string | null, toStageKey: string): string[] {
  const flat = flattenStages(p);
  const toIdx = flat.findIndex((f) => f.stage.key === toStageKey);
  if (toIdx < 0) return [];
  const fromIdx = fromStageKey ? flat.findIndex((f) => f.stage.key === fromStageKey) : -1;
  if (toIdx <= fromIdx + 1) return [];
  return flat.slice(fromIdx + 1, toIdx).map((f) => f.stage.name);
}

// Is a transition to this stage something the client should be notified about?
export function isStageClientVisible(p: Pipeline, stageKey: string): boolean {
  return findStage(p, stageKey)?.stage.clientVisible ?? false;
}

// Human label for a phase key (pre-phase / phase / terminal). client=true uses
// the client-facing phase name.
export function phaseLabel(p: Pipeline | null, key?: string | null, client = false): string {
  if (!p || !key) return key ?? "—";
  if (key === p.prePhase.key) return p.prePhase.name;
  if (key === p.terminal.key) return p.terminal.name;
  const ph = p.phases.find((x) => x.key === key);
  return ph ? (client ? phaseClientName(ph) : ph.internalName) : key;
}

export function stageLabel(p: Pipeline | null, key?: string | null): string {
  if (!p || !key) return key ?? "—";
  return findStage(p, key)?.stage.name ?? key;
}

// Ordered phase-key steps for an advance control: pre → phases → terminal.
export function phaseSteps(p: Pipeline): { key: string; label: string }[] {
  return [
    { key: p.prePhase.key, label: p.prePhase.name },
    ...p.phases.map((ph) => ({ key: ph.key, label: ph.internalName })),
    { key: p.terminal.key, label: p.terminal.name },
  ];
}
