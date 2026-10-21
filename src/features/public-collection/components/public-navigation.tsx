import Link from "next/link";
import type { PublicCategory } from "../browsing";
import { cn } from "@/lib/utils";

export function PublicNavigation({ current }: { current?: PublicCategory }) {
  return (
    <nav aria-label="Browse collection" className="flex flex-wrap gap-2">
      {(
        [
          ["search", "All objects"],
          ["consoles", "Consoles"],
          ["games", "Games"],
          ["accessories", "Accessories"],
        ] as const
      ).map(([category, label]) => (
        <Link
          key={category}
          href={`/collection/${category}`}
          prefetch={false}
          aria-current={current === category ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm hover:bg-accent",
            current === category &&
              "bg-foreground text-background hover:bg-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
