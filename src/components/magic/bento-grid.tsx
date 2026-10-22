import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
// Adapted Magic UI Bento Grid: https://magicui.design/docs/components/bento-grid
// Semantic server-rendered panels; actions stay visible without hover or animation.
export function BentoGrid({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      {...props}
      className={cn(
        "grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    />
  );
}
export function BentoCard({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      {...props}
      className={cn(
        "min-w-0 space-y-4 rounded-xl bg-card p-5 sm:p-6",
        className,
      )}
    />
  );
}
