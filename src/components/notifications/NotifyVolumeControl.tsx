"use client";

import { useEffect, useState } from "react";
import { Volume2, Play } from "lucide-react";
import { getStoredVolume, setStoredVolume, playDing } from "@/lib/notify-sound";

// Per-device notification volume slider + a "Test sound" preview. Saved to
// localStorage (device-specific, no DB column). The NotificationBell reads the
// same stored value when it chimes.
export default function NotifyVolumeControl() {
  const [vol, setVol] = useState(70);

  useEffect(() => {
    setVol(getStoredVolume());
  }, []);

  function change(v: number) {
    setVol(v);
    setStoredVolume(v);
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-3">
        <Volume2 className="h-4 w-4 text-gray-500 shrink-0" />
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={vol}
          onChange={(e) => change(Number(e.target.value))}
          className="flex-1 accent-[#1B2E6B]"
          aria-label="Notification volume"
        />
        <span className="w-10 text-right text-xs font-medium text-gray-600">{vol}%</span>
        <button
          type="button"
          onClick={() => playDing(vol)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-400"
        >
          <Play className="h-3.5 w-3.5" /> Test
        </button>
      </div>
      <p className="text-xs text-gray-400">Notification volume is saved on this device.</p>
    </div>
  );
}
