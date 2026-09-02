import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Shield, FileCheck, Clock, Building2, KeyRound } from "lucide-react";
import { getSessionProfile, homePathForRole } from "@/lib/auth";
import LoginForm from "@/components/auth/LoginForm";
import { CONVEYCLEAR_PHONE, CONVEYCLEAR_EMAIL, telHref } from "@/lib/contact";

/**
 * The front door.
 *
 * 🔴 THE SIGN-IN IS ON THE PAGE, not behind a button. Zewn, 2026-09-02: "change
 * the sign in/home page a bit. some updating and restructuring along with a sign
 * in container directly on the page instead of on a seperate page."
 *
 * Almost everyone who reaches portal.conveyclear.co.za is an attorney or a client
 * who already has an account and is trying to get in. The old hero gave them two
 * buttons that both led somewhere else, and the loud one ("Open your portal") was
 * signup — so the common case paid a page load to reach a form while the rare case
 * got the emphasis. The form is now the right half of the hero, and the marketing
 * sits beside it for whoever actually arrived to find out what this is.
 *
 * /auth/login STAYS. Every layout sends an expired session there, the
 * password-reset flow returns to it, and people have it bookmarked. Both render
 * the same LoginForm — one form, two placements, no second copy to drift.
 *
 * Colour comes from the design tokens rather than the raw brand hexes this page
 * hardcoded (#1B2E6B, #E8521A, text-gray-900). Those predate the token system and
 * were why the landing page was the one surface that ignored dark mode.
 */
export default async function HomePage() {
  const session = await getSessionProfile();
  if (session) {
    redirect(homePathForRole(session.profile?.role));
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="bg-chrome text-on-chrome">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/conveyclear-logo.png"
            alt="ConveyClear"
            className="h-9 w-auto brightness-0 invert"
          />
          <Link
            href="/auth/signup"
            className="rounded-lg px-4 py-2 text-sm font-medium text-on-chrome/80 transition-colors hover:text-on-chrome"
          >
            Create an account
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero: what this is, beside the way in ──────────────────────── */}
        <section className="bg-chrome text-on-chrome">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 lg:grid-cols-[1.05fr_minmax(0,420px)] lg:gap-16 lg:pb-24 lg:pt-20">
            <div>
              <h1 className="text-[38px] font-bold leading-[1.08] tracking-[-0.03em] md:text-[52px]">
                Property conveyancing,{" "}
                <span className="text-[color:var(--cc-required-fill)]">simplified</span>
              </h1>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-on-chrome/75">
                One place for the whole transaction. Attorneys request a transfer and
                watch every service under it; clients send their documents once and
                see where things stand.
              </p>

              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Building2,
                    title: "Every matter, one transaction",
                    body: "Rates clearance, change of ownership and the refund sit together instead of side by side in a list.",
                  },
                  {
                    icon: Shield,
                    title: "POPIA compliant",
                    body: "Personal information handled under South Africa's Protection of Personal Information Act.",
                  },
                  {
                    icon: FileCheck,
                    title: "Documents once",
                    body: "Uploaded to the transaction and reused by every matter on it, rather than fetched again.",
                  },
                  {
                    icon: Clock,
                    title: "Where it actually is",
                    body: "The council's own steps, in the council's own words, and how long it has been running.",
                  },
                ].map((f) => (
                  <li key={f.title} className="flex gap-3">
                    <f.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-on-chrome/70" aria-hidden />
                    <div>
                      <p className="text-[14px] font-semibold">{f.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-on-chrome/65">
                        {f.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* The sign-in card, on its own surface so it reads as the thing to
                do rather than as another band of the hero. */}
            <div className="rounded-2xl bg-surface p-6 shadow-lg sm:p-7">
              <div className="mb-5 flex items-center gap-2.5">
                <span className="rounded-lg bg-action-tint p-2">
                  <KeyRound className="h-4 w-4 text-action" aria-hidden />
                </span>
                <div>
                  <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">Sign in</h2>
                  <p className="text-[12.5px] text-ink-3">
                    Attorneys, clients and ConveyClear staff.
                  </p>
                </div>
              </div>

              {/* Suspense because LoginForm reads search params (?next=, ?error=),
                  exactly as it does on /auth/login. */}
              <Suspense>
                <LoginForm />
              </Suspense>

              <p className="mt-5 border-t border-line pt-4 text-[12.5px] text-ink-3">
                Referred by your attorney and have no account yet?{" "}
                <Link href="/auth/signup" className="font-semibold text-action hover:underline">
                  Create one
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* ── What we do ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 py-16 md:py-20">
          <h2 className="text-center text-[26px] font-semibold tracking-[-0.02em] text-ink">
            What ConveyClear handles
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-[14.5px] text-ink-3">
            The municipal side of a property transfer, from the application to the
            certificate — with the council chased so the firm does not have to.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Property rates clearance",
                desc: "Opening the account, getting the figures, getting the certificate — three stages, tracked as three.",
              },
              {
                title: "Change of ownership",
                desc: "Moving the municipal account to the buyer once the transfer registers.",
              },
              {
                title: "Certificates and building plans",
                desc: "Compliance certificates, existing building plans, account disputes and refunds.",
              },
            ].map((s) => (
              <div
                key={s.title}
                className="rounded-xl bg-surface p-6 shadow-sm dark:ring-1 dark:ring-line"
              >
                <h3 className="text-[15px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-chrome py-8 text-on-chrome/60">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 text-[13px] md:flex-row">
          <p>© {new Date().getFullYear()} Convey Clear (Pty) Ltd · Reg 2025/057574/07</p>
          <p className="flex items-center gap-4">
            <a href={`mailto:${CONVEYCLEAR_EMAIL}`} className="hover:text-on-chrome">
              {CONVEYCLEAR_EMAIL}
            </a>
            <a href={telHref(CONVEYCLEAR_PHONE)} className="hover:text-on-chrome">
              {CONVEYCLEAR_PHONE}
            </a>
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-on-chrome">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-on-chrome">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
