"use client";

import { useEffect, useState } from "react";

// H2 — Pipedrive-style celebration when a matter is moved to won/closed.
// Dependency-free confetti burst. Fires once per matter per browser session
// (sessionStorage guard) so navigating back doesn't re-trigger it.
const COLORS = ["#1B2E6B", "#E8521A", "#22c55e", "#eab308", "#3b82f6"];

export default function Celebrate({ active, matterId }: { active: boolean; matterId: string }) {
  const [pieces, setPieces] = useState<number[]>([]);

  useEffect(() => {
    if (!active) return;
    const key = `cc-celebrated-${matterId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setPieces(Array.from({ length: 90 }, (_, i) => i));
    const t = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(t);
  }, [active, matterId]);

  if (pieces.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.6;
        const duration = 2.2 + Math.random() * 1.6;
        const size = 6 + Math.random() * 6;
        const color = COLORS[i % COLORS.length];
        const rotate = Math.random() * 360;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "-5%",
              left: `${left}%`,
              width: size,
              height: size * 1.6,
              background: color,
              transform: `rotate(${rotate}deg)`,
              borderRadius: 1,
              animation: `cc-confetti-fall ${duration}s ${delay}s ease-in forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes cc-confetti-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
