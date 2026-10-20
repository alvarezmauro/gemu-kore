import type { AssetAttribution } from "../contracts";
const labels: Record<string, string> = {
  USER_UPLOAD: "User upload",
  CURATED: "Curated image",
  EXTERNAL_PROVIDER: "External provider",
  AI_ASSISTED: "AI-assisted image",
  IMPORTED: "Imported image",
};
export function AssetSource({ source: s }: { source: AssetAttribution }) {
  return (
    <div className="min-w-0 space-y-2 text-sm [overflow-wrap:anywhere]">
      <p>
        Source: {labels[s.type] ?? "Source unknown"}
        {s.provider ? ` · ${s.provider}` : ""}
      </p>
      {s.url && (
        <a
          className="block min-h-11 w-fit py-3 underline"
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Source page
        </a>
      )}
      {s.author && <p>Author: {s.author}</p>}
      <p>License: {s.licenseName ?? "Not recorded"}</p>
      {s.licenseUrl && (
        <a
          className="block min-h-11 w-fit py-3 underline"
          href={s.licenseUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          License page
        </a>
      )}
      {s.attribution && (
        <p className="whitespace-pre-wrap">Attribution: {s.attribution}</p>
      )}
      {s.restrictions && (
        <p className="whitespace-pre-wrap">
          Usage restrictions: {s.restrictions}
        </p>
      )}
      {s.retrievedAt && (
        <p>
          Retrieved:{" "}
          <time dateTime={s.retrievedAt}>{s.retrievedAt.slice(0, 10)}</time>
        </p>
      )}
      <p className="text-muted-foreground">
        Source information does not grant permission to publish this image.
      </p>
    </div>
  );
}
