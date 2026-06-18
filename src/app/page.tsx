import { redirect } from "next/navigation";
import Link from "next/link";
import { Shield, FileCheck, Clock, ChevronRight } from "lucide-react";
import { getSessionProfile, homePathForRole } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSessionProfile();
  if (session) {
    redirect(homePathForRole(session.profile?.role));
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="bg-[#1B2E6B] text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/conveyclear-logo.png" alt="ConveyClear" className="h-9 w-auto brightness-0 invert" />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-sm text-white/80 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="bg-[#E8521A] hover:bg-[#c94415] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="bg-[#1B2E6B] text-white pb-24 pt-16">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Property Conveyancing,{" "}
              <span className="text-[#E8521A]">Simplified</span>
            </h1>
            <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
              Securely submit your FICA documents, track your property
              transactions, and stay informed — all in one place.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center gap-2 bg-[#E8521A] hover:bg-[#c94415] text-white font-semibold px-8 py-3 rounded-xl transition-colors"
              >
                Open your portal <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-medium px-8 py-3 rounded-xl transition-colors"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-4 py-20">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col items-start gap-3">
              <div className="rounded-xl bg-[#1B2E6B]/10 p-3">
                <Shield className="h-6 w-6 text-[#1B2E6B]" />
              </div>
              <h3 className="font-bold text-gray-900">POPIA Compliant</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Your personal information is handled in accordance with South
                Africa&apos;s Protection of Personal Information Act.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <div className="rounded-xl bg-[#E8521A]/10 p-3">
                <FileCheck className="h-6 w-6 text-[#E8521A]" />
              </div>
              <h3 className="font-bold text-gray-900">Secure Document Upload</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Upload your FICA documents, ID, and proof of residence securely.
                Only accessible to authorised staff.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <div className="rounded-xl bg-green-100 p-3">
                <Clock className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900">Real-time Tracking</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Track your service requests — Change of Ownership, Rates
                Clearance, Compliance Certificates — in real time.
              </p>
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="bg-white border-t border-gray-100 py-16">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-[#1B2E6B] text-center mb-10">
              Our Services
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  title: "Change of Ownership",
                  desc: "Transfer property into your name with professional conveyancing support.",
                },
                {
                  title: "Property Rates Clearance",
                  desc: "Obtain your municipal rates clearance certificate quickly and efficiently.",
                },
                {
                  title: "Compliance Certificate",
                  desc: "Electrical, plumbing, and gas compliance certificates for property transfers.",
                },
              ].map((s) => (
                <div
                  key={s.title}
                  className="rounded-xl border border-gray-200 p-6"
                >
                  <h3 className="font-semibold text-[#1B2E6B]">{s.title}</h3>
                  <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#1B2E6B] text-white/60 py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center">
            <img src="/conveyclear-logo.png" alt="ConveyClear" className="h-7 w-auto brightness-0 invert" />
          </div>
          <p>© {new Date().getFullYear()} ConveyClear. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white">Terms &amp; Conditions</Link>
          </div>
          <p>POPIA compliant · South Africa</p>
        </div>
      </footer>
    </div>
  );
}
