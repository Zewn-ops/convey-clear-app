"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import type { RequestStatus, ServiceRequest } from "@/types";
import { REQUEST_STATUS_LABELS } from "@/types";

const STATUS_OPTIONS = Object.entries(REQUEST_STATUS_LABELS).map(
  ([value, label]) => ({ value, label })
);

const schema = z.object({
  status: z.enum([
    "pending",
    "documents_required",
    "in_review",
    "in_progress",
    "completed",
    "rejected",
  ]),
  admin_notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface StatusUpdateFormProps {
  request: ServiceRequest;
}

export default function StatusUpdateForm({ request }: StatusUpdateFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: request.status,
      admin_notes: request.admin_notes ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const { error } = await supabase
      .from("service_requests")
      .update({
        status: values.status as RequestStatus,
        admin_notes: values.admin_notes || null,
      })
      .eq("id", request.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Request updated");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        label="Status"
        options={STATUS_OPTIONS}
        required
        error={errors.status?.message}
        {...register("status")}
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Note to client
        </label>
        <textarea
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] resize-none"
          rows={3}
          placeholder="Optional message visible to the client..."
          {...register("admin_notes")}
        />
      </div>
      <Button type="submit" loading={loading}>
        Update request
      </Button>
    </form>
  );
}
