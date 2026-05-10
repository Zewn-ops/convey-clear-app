import { cn } from "@/lib/utils";
import type { RequestStatus } from "@/types";

interface BadgeProps {
  label: string;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "gray";
  className?: string;
}

export const statusVariantMap: Record<RequestStatus, BadgeProps["variant"]> = {
  pending: "warning",
  documents_required: "danger",
  in_review: "info",
  in_progress: "info",
  completed: "success",
  rejected: "danger",
};

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-[#1B2E6B] text-white",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-800",
  gray: "bg-gray-100 text-gray-600",
};

export default function Badge({
  label,
  variant = "default",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {label}
    </span>
  );
}
