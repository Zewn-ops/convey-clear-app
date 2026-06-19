// Notification "ding" — a short two-tone WebAudio chime shared by the
// NotificationBell (realtime) and the /account "Test sound" button.
//
// Browsers block audio until a user gesture. We keep a single AudioContext and
// unlock it on the first gesture (see NotificationBell's global listener), so a
// realtime notification that arrives later can play without its own gesture.
//
// Volume is a PER-DEVICE preference (like a media player), stored in
// localStorage — not the DB — so there's no migration and each device decides.

let ctx: AudioContext | null = null;

export const NOTIFY_VOLUME_KEY = "cc_notify_volume";
const DEFAULT_VOLUME = 70; // percent

export function getStoredVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const raw = window.localStorage.getItem(NOTIFY_VOLUME_KEY);
  if (raw == null) return DEFAULT_VOLUME;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_VOLUME;
}

export function setStoredVolume(percent: number): void {
  if (typeof window === "undefined") return;
  const v = Math.min(100, Math.max(0, Math.round(percent)));
  window.localStorage.setItem(NOTIFY_VOLUME_KEY, String(v));
}

// Create (once) and resume the shared AudioContext. Safe to call repeatedly;
// must first run inside a user gesture for the browser to allow playback.
export function unlockAudio(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctx && Ctx) ctx = new Ctx();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  } catch {
    /* audio unsupported — silently no-op */
  }
}

// Play the chime at the given volume (percent). Falls back to the stored volume.
export function playDing(volumePercent: number = getStoredVolume()): void {
  unlockAudio();
  if (!ctx || volumePercent <= 0) return;
  const peak = 0.3 * (volumePercent / 100);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  o.type = "sine";
  o.frequency.setValueAtTime(880, ctx.currentTime);
  o.frequency.setValueAtTime(1175, ctx.currentTime + 0.09);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
  o.start();
  o.stop(ctx.currentTime + 0.33);
}
