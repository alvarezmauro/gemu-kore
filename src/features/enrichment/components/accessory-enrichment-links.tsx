import Link from "next/link";
import { Button } from "@/components/ui/button";
export function AccessoryEnrichmentLinks({
  accessoryId,
  variantId,
}: {
  accessoryId: string;
  variantId: string;
}) {
  return (
    <section
      aria-label="Optional accessory metadata lookup"
      className="min-w-0 space-y-3 rounded-xl bg-card p-5"
    >
      <h2 className="font-heading text-xl">Optional metadata lookup</h2>
      <p className="text-sm text-muted-foreground">
        Compare sourced suggestions in a new tab. Editors prepare suggestions;
        an administrator reviews changes. Continue saving your copy manually,
        then refresh catalog choices if shared facts changed.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          asChild
          variant="outline"
          className="h-auto min-h-11 w-full max-w-full whitespace-normal sm:w-auto"
        >
          <Link
            href={`/app/enrichment?kind=accessory&id=${accessoryId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Review accessory metadata (opens a new tab)
          </Link>
        </Button>
        <Button
          asChild
          variant="ghost"
          className="h-auto min-h-11 w-full max-w-full whitespace-normal sm:w-auto"
        >
          <Link
            href={`/app/enrichment?kind=variant&id=${variantId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Review variant reference (opens a new tab)
          </Link>
        </Button>
      </div>
    </section>
  );
}
