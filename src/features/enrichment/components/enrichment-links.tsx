import Link from "next/link";
import { Button } from "@/components/ui/button";
export function EnrichmentLinks({
  gameId,
  releaseId,
}: {
  gameId: string;
  releaseId: string;
}) {
  return (
    <section
      aria-label="Optional metadata lookup"
      className="min-w-0 space-y-3 rounded-xl bg-card p-5"
    >
      <h2 className="font-heading text-xl">Optional metadata lookup</h2>
      <p className="text-sm text-muted-foreground">
        Compare sourced suggestions in a new tab. Editors can prepare a review;
        an administrator chooses which changes to apply. You can keep saving
        your copy manually.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          asChild
          variant="outline"
          className="h-auto min-h-11 w-full max-w-full whitespace-normal sm:w-auto"
        >
          <Link
            href={`/app/enrichment?kind=game&id=${gameId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Review game metadata (opens a new tab)
          </Link>
        </Button>
        <Button
          asChild
          variant="ghost"
          className="h-auto min-h-11 w-full max-w-full whitespace-normal sm:w-auto"
        >
          <Link
            href={`/app/enrichment?kind=release&id=${releaseId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Review release reference (opens a new tab)
          </Link>
        </Button>
      </div>
    </section>
  );
}
