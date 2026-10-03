import { Skeleton } from "./skeleton";

export function LoadingCards({
  label = "Loading items",
  count = 3,
}: {
  label?: string;
  count?: number;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
      >
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="space-y-4 rounded-xl bg-card p-6">
            <Skeleton className="aspect-[4/3] bg-stone" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
