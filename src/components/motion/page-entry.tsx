import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function PageEntry({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("motion-page-entry", className)} {...props} />;
}

// Apply only to cards that contain an explicit link or button.
export function CollectionCardMotion({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div className={cn("motion-card", className)} {...props} />;
}
