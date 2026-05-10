"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { Profile } from "@/types";

const schema = z.object({
  full_name: z.string().min(2, "Name is required"),
  phone: z.string().optional(),
  id_number: z
    .string()
    .regex(/^\d{13}$/, "Must be 13 digits")
    .optional()
    .or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface ProfileFormProps {
  profile: Profile;
  email: string;
}

export default function ProfileForm({ profile, email }: ProfileFormProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile.full_name,
      phone: profile.phone ?? "",
      id_number: profile.id_number ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: values.full_name,
        phone: values.phone || null,
        id_number: values.id_number || null,
      })
      .eq("id", profile.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Email address"
        type="email"
        value={email}
        disabled
        hint="Email cannot be changed here"
      />
      <Input
        label="Full name"
        type="text"
        required
        error={errors.full_name?.message}
        {...register("full_name")}
      />
      <Input
        label="Phone number"
        type="tel"
        placeholder="+27 82 000 0000"
        error={errors.phone?.message}
        {...register("phone")}
      />
      <Input
        label="SA ID number"
        type="text"
        maxLength={13}
        placeholder="13-digit ID number"
        hint="Used for identity verification"
        error={errors.id_number?.message}
        {...register("id_number")}
      />
      <Button type="submit" loading={loading}>
        Save changes
      </Button>
    </form>
  );
}
