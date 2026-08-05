import Link from "next/link";
import Wordmark from "@/components/ui/Wordmark";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export default function AuthLayout({
  title,
  subtitle,
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-raised flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-line shadow-sm py-3 px-6">
        <Link href="/" className="flex items-center w-fit">
          <Wordmark className="h-9" />
        </Link>
      </header>

      {/* Form card */}
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-surface p-8 shadow-lg dark:ring-1 dark:ring-line">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-action">{title}</h1>
              <p className="mt-1 text-sm text-ink-3">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-ink-3">
        © {new Date().getFullYear()} ConveyClear. All rights reserved. POPIA
        compliant.
      </footer>
    </div>
  );
}
