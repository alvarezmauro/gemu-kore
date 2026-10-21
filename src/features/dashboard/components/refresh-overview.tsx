"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
export function RefreshOverview() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form
      action="/app"
      method="get"
      className="min-w-0 max-w-full space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => router.refresh());
      }}
    >
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Refreshing…" : "Refresh overview"}
      </Button>
      {pending && (
        <div role="status">
          <span className="sr-only">
            Refreshing collection overview. Current values remain visible.
          </span>
          <Skeleton className="h-1 w-full" aria-hidden="true" />
        </div>
      )}
    </form>
  );
}
