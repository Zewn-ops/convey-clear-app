import Link from "next/link";
import { Scale } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      <Scale className="h-12 w-12 text-[#1B2E6B] mb-4" />
      <h1 className="text-3xl font-bold text-[#1B2E6B]">404</h1>
      <p className="text-gray-500 mt-2 mb-6">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="bg-[#1B2E6B] hover:bg-[#152355] text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
      >
        Go home
      </Link>
    </div>
  );
}
