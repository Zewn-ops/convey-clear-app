/**
 * Phase N of M with a bar.
 *
 * Progress beats status: "Phase 2 of 4" implies movement on days when nothing
 * actually moved, where "Docs pending" reads as stuck. On a process measured in
 * months that difference is most of the perceived experience.
 */
export default function PhaseProgress({
  phase,
  total,
  label,
  done = false,
}: {
  phase: number;
  total: number;
  label: string;
  done?: boolean;
}) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.min(100, Math.max(0, Math.round((phase / safeTotal) * 100)));

  return (
    <div>
      <p className={`text-[12.5px] font-bold ${done ? "text-ok" : "text-action"}`}>
        Phase {phase} of {safeTotal} &middot; {label}
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Phase ${phase} of ${safeTotal}: ${label}`}
      >
        <div
          className={`h-full rounded-full ${done ? "bg-ok" : "bg-action"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
