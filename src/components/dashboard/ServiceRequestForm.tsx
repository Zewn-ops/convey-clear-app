"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import FileUpload from "./FileUpload";
import type { ServiceType } from "@/types";
import { SERVICE_TYPE_LABELS } from "@/types";

const SERVICE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

const schema = z.object({
  service_type: z.enum([
    "change_of_ownership",
    "rates_clearance",
    "compliance_certificate",
  ]),
  property_address: z.string().min(5, "Property address is required"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function ServiceRequestForm() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { service_type: "change_of_ownership" },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Not authenticated");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("service_requests")
      .insert({
        client_id: user.id,
        service_type: values.service_type as ServiceType,
        property_address: values.property_address,
        notes: values.notes || null,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Request submitted!");
    setRequestId(data.id);
    setLoading(false);
  };

  if (requestId) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
          Your service request has been submitted. Please upload your supporting
          documents below.
        </div>
        <FileUpload
          requestId={requestId}
          onUploaded={() => router.push("/dashboard/requests")}
        />
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/requests")}
          className="w-full"
        >
          Skip — upload documents later
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Select
        label="Service type"
        options={SERVICE_OPTIONS}
        required
        error={errors.service_type?.message}
        {...register("service_type")}
      />
      <Input
        label="Property address"
        type="text"
        required
        placeholder="e.g. 12 Main Road, Sandton, Johannesburg"
        error={errors.property_address?.message}
        {...register("property_address")}
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Additional notes
        </label>
        <textarea
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] focus:border-transparent resize-none"
          rows={3}
          placeholder="Any additional information for our team..."
          {...register("notes")}
        />
      </div>

      <Button type="submit" loading={loading} className="w-full" size="lg">
        Submit request
      </Button>
    </form>
  );
}
