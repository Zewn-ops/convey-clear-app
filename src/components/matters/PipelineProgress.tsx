import { CheckCircle2, EyeOff } from "lucide-react";
import type { Pipeline } from "@/lib/pipelines";
import { phaseClientName } from "@/lib/pipelines";

// Read-only render of a matter's position in its (service+municipality) pipeline.
// Vision Board 2026-06-22. audience="staff" shows every phase/stage incl. the
// admin-only (blue) ones (badged); audience="client" uses client-facing phase
// names and hides admin-only stages. Icons identical in both portals (note 15/44).
export default function PipelineProgress({
  pipeline,
  currentPhase,
  currentStage,
  audience,
}: {
  pipeline: Pipeline;
  currentPhase: string | null;
  currentStage: string | null;
  audience: "staff" | "client";
}) {
  const isClient = audience === "client";

  // Ordered steps: pre-phase → phases → terminal.
  const steps = [
    { key: pipeline.prePhase.key, name: pipeline.prePhase.name, kind: "pre" as const },
    ...pipeline.phases.map((ph) => ({
      key: ph.key,
      name: isClient ? phaseClientName(ph) : ph.internalName,
      kind: "phase" as const,
      phase: ph,
    })),
    { key: pipeline.terminal.key, name: pipeline.terminal.name, kind: "terminal" as const },
  ];

  const currentIdx = Math.max(0, steps.findIndex((s) => s.key === currentPhase));
  const currentStep = steps[currentIdx];
  const currentPhaseDef = currentStep?.kind === "phase" ? currentStep.phase : null;

  // Stages of the active phase. Client hides admin-only (blue) stages.
  const stages = (currentPhaseDef?.stages ?? []).filter((s) => (isClient ? s.clientVisible : true));

  return (
    <div className="space-y-4">
      {/* Phase stepper */}
      <div className="flex flex-wrap items-start gap-y-3">
        {steps.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s.key} className="flex-1 min-w-[88px] flex flex-col items-center text-center px-1">
              <div
                className={
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold " +
                  (done ? "bg-green-500 text-white" : active ? "bg-[#1B2E6B] text-white" : "bg-gray-200 text-gray-500")
                }
              >
                {done ? <CheckCircle2 className="h-5 w-5" /> : i}
              </div>
              <p className={"mt-2 text-[11px] leading-tight " + (active ? "font-semibold text-[#1B2E6B]" : "text-gray-500")}>
                {s.name}
              </p>
            </div>
          );
        })}
      </div>

      {/* Stages of the current phase */}
      {currentPhaseDef && stages.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
            {currentStep.name} — stages
          </p>
          <ul className="space-y-1.5">
            {stages.map((st) => {
              const active = st.key === currentStage;
              return (
                <li key={st.key} className="flex items-center gap-2 text-sm">
                  <span className={"h-1.5 w-1.5 rounded-full shrink-0 " + (active ? "bg-[#E8521A]" : "bg-gray-300")} />
                  <span className={active ? "font-medium text-gray-900" : "text-gray-600"}>{st.name}</span>
                  {!isClient && !st.clientVisible && (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500" title="Admin-only — not shown to the client">
                      <EyeOff className="h-3 w-3" /> Internal
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
