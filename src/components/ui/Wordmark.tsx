import { cn } from "@/lib/utils";

/**
 * The ConveyClear wordmark, theme-aware.
 *
 * Two fixed-colour PNGs rather than one recoloured asset: the wordmark is navy
 * with a coloured key device, so brightness-0/invert flattens it. Both images
 * are in the markup and CSS chooses — no hydration flash, and no JS needed on
 * pages that render before the theme cookie is read.
 *
 * Use this anywhere the logo sits on a themed surface. The landing page is the
 * deliberate exception: its hero is dark in both themes and inverts the asset.
 */
export default function Wordmark({ className }: { className?: string }) {
  const size = cn("w-auto", className);
  return (
    <>
      <img src="/conveyclear-logo.png" alt="ConveyClear" className={cn(size, "dark:hidden")} />
      <img
        src="/conveyclear-logo-white.png"
        alt=""
        aria-hidden="true"
        className={cn("hidden", size, "dark:block")}
      />
    </>
  );
}
