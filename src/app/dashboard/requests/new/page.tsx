import Card from "@/components/ui/Card";
import ServiceRequestForm from "@/components/dashboard/ServiceRequestForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "New Request — ConveyClear" };

export default function NewRequestPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/dashboard/requests"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#1B2E6B] mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to requests
        </Link>
        <h1 className="text-2xl font-bold text-[#1B2E6B]">
          New Service Request
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Fill in the details below. You&apos;ll be able to upload your
          supporting documents on the next step.
        </p>
      </div>
      <Card>
        <ServiceRequestForm />
      </Card>
    </div>
  );
}
