import { CONVEYCLEAR_PHONE, CONVEYCLEAR_EMAIL, telHref } from "@/lib/contact";

/**
 * The quiet line at the bottom of every portal page.
 *
 * Zewn, 2026-09-02: "please also add a bit of padding to the bottom of the pages
 * … otherwise it feels squished. you can also add a very subtle footer with some
 * small info if you feel it will work well."
 *
 * It works well because it answers a real question at the moment it gets asked.
 * An attorney who has scrolled to the end of a transfer and found what they
 * needed missing wants to reach a person — and until now the only way to do that
 * from most pages was to navigate back to Enquiries. The company details are
 * there for the same reason a letterhead has them: this portal is where a firm
 * does business with ConveyClear, and a business address is what makes that feel
 * like a company rather than a tool.
 *
 * ⚠️ NO LEGAL LINKS, deliberately. /privacy and /terms still contain literal
 * `<Placeholder>` text pending an attorney's review, and putting them on every
 * page of the portal would take that debt from one footer nobody visits to
 * several hundred page views a week. Add them here the day the wording is real.
 */
export default function PortalFooter() {
  return (
    <footer className="border-t border-line px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-1.5 text-[11.5px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Convey Clear (Pty) Ltd · Reg 2025/057574/07 · Centurion, South Africa
        </p>
        <p className="flex items-center gap-3">
          <a href={`mailto:${CONVEYCLEAR_EMAIL}`} className="hover:text-ink-2 hover:underline">
            {CONVEYCLEAR_EMAIL}
          </a>
          <a href={telHref(CONVEYCLEAR_PHONE)} className="hover:text-ink-2 hover:underline">
            {CONVEYCLEAR_PHONE}
          </a>
        </p>
      </div>
    </footer>
  );
}
