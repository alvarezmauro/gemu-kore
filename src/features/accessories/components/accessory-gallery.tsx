import { ConsoleImage } from "@/features/consoles/components/console-image";
import type { AccessoryImage } from "../detail-contracts";
import { AssetSource } from "@/features/provenance/components/asset-source";
export function AccessoryGallery({
  images,
  empty,
}: {
  images: AccessoryImage[];
  empty: string;
}) {
  return images.length ? (
    <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image) => (
        <li key={image.id} className="min-w-0 space-y-2">
          <a
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`Open ${image.alt} (opens a new tab)`}
          >
            <ConsoleImage {...image} />
          </a>
          {image.caption && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {image.caption}
            </p>
          )}
          <details className="rounded-lg bg-muted p-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm">
              Image source details
            </summary>
            <AssetSource source={image.source} />
          </details>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">{empty}</p>
  );
}
