import { cn } from "@/lib/utils";

interface BadgeProps {
  label: string;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "gray";
  className?: string;
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  // Tinted grounds with the role colour as the label, so these stay legible in
  // both themes. Contrast for every pair is verified in DESIGN.md.
  default: "bg-action-fill text-white",
  success: "bg-ok-tint text-ok",
  warning: "bg-waiting-tint text-waiting",
  danger: "bg-danger-tint text-danger",
  info: "bg-action-tint text-action",
  gray: "bg-raised text-ink-2 ring-1 ring-inset ring-line",
};

export default function Badge({
  label,
  variant = "default",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold tracking-[0.01em]",
        variantClasses[variant],
        className
      )}
    >
      {label}
    </span>
  );
}
