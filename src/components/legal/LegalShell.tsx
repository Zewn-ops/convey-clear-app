import Link from "next/link";
import type { ReactNode } from "react";

/** A single titled section of a legal document. */
export function LegalSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 scroll-mt-20" id={`s${n}`}>
      <h2 className="text-lg font-bold text-[#1B2E6B]">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}

/** Highlights a value legal must confirm before publication. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-amber-100 px-1 font-mono text-[13px] text-amber-900">
      [ {children} ]
    </span>
  );
}

/**
 * Shared chrome for the public legal pages (/privacy, /terms).
 * Server component — brand header, prominent DRAFT banner, content, footer.
 */
export default function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-[#1B2E6B] text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center">
            <img
              src="/conveyclear-logo.png"
              alt="ConveyClear"
              className="h-9 w-auto brightness-0 invert"
            />
          </Link>
          <Link href="/" className="text-sm text-white/80 transition-colors hover:text-white">
            ← Home
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>DRAFT — for legal review.</strong> This is a working draft prepared
            for internal review. It is <strong>not legal advice</strong> and must be
            reviewed, completed, and approved by a qualified South African attorney
            before it is published or relied upon. Items shown as{" "}
            <span className="rounded bg-amber-100 px-1 font-mono text-[13px]">[ … ]</span>{" "}
            need confirmation.
          </div>

          <h1 className="mt-6 text-3xl font-bold text-[#1B2E6B]">{title}</h1>
          <p className="mt-2 text-sm text-gray-500">
            Convey Clear (Pty) Ltd · Reg No. 2025/057574/07 · Last updated {lastUpdated}
          </p>

          {children}

          <div className="mt-12 border-t border-gray-200 pt-6 text-sm text-gray-500">
            <p className="font-medium text-gray-700">Convey Clear (Pty) Ltd</p>
            <p>9 Lauriston Place Street, Glen Lauriston, Centurion, 0185, South Africa</p>
            <p>
              <a href="mailto:hello@conveyclear.co.za" className="text-[#1B2E6B] hover:underline">
                hello@conveyclear.co.za
              </a>{" "}
              · +27 (0)76 810 4790
            </p>
          </div>
        </div>
      </main>

      <footer className="bg-[#1B2E6B] py-8 text-white/60">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-4 text-sm sm:flex-row">
          <p>© {new Date().getFullYear()} ConveyClear. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
