"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Reads the theme the no-flash script already resolved, rather than deciding
 * again. The script in layout.tsx runs before paint and is the single source of
 * truth; this component only reflects and changes it.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") {
      setTheme(attr);
    } else {
      // No attribute means light. tokens.css deliberately does not follow the OS
      // preference yet, so reading matchMedia here would show a moon icon on a
      // page that is actually light.
      setTheme("light");
    }
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("cc-theme", next);
    } catch {
      // Safari private mode throws on setItem. The theme still applies for this
      // page load; it just will not survive a reload, which beats crashing.
    }
  }

  // Render nothing until mounted: server-rendered markup cannot know the
  // client's theme, and guessing produces a hydration mismatch plus a flicker.
  if (theme === null) {
    return <div className={`h-9 w-9 ${className}`} aria-hidden="true" />;
  }

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line
                  text-ink-3 transition-colors duration-150 ease-out
                  hover:bg-raised hover:text-ink
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action
                  focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${className}`}
    >
      {theme === "dark" ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.9 6.9 0 0 0 11.1 11.1Z" />
        </svg>
      )}
    </button>
  );
}
