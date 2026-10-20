import type { MetadataAttribution } from "../contracts";
const originLabels: Record<MetadataAttribution["origin"], string> = {
  MANUAL: "Manually entered",
  SEED: "Seeded catalog data",
  PROVIDER: "Imported metadata",
  AI_ASSISTED: "AI-assisted metadata",
  UNKNOWN: "Source unknown",
};
export function MetadataSource({
  attribution,
}: {
  attribution: MetadataAttribution;
}) {
  const source = attribution.source;
  return (
    <div className="min-w-0 space-y-2 text-sm [overflow-wrap:anywhere]">
      <p className="font-medium">{originLabels[attribution.origin]}</p>
      {attribution.recordedAt && (
        <p className="text-muted-foreground">
          Recorded{" "}
          <time dateTime={attribution.recordedAt}>
            {attribution.recordedAt.slice(0, 10)}
          </time>
        </p>
      )}
      {attribution.note && <p>{attribution.note}</p>}
      {source && (
        <>
          <p>
            Source: {source.name} · {source.scope}
          </p>
          <p>
            Retrieved{" "}
            <time dateTime={source.retrievedAt}>
              {source.retrievedAt.slice(0, 10)}
            </time>
          </p>
          {source.updatedAt.length > 0 && (
            <p>
              Source updated:{" "}
              {source.updatedAt
                .map((value) => value.slice(0, 10))
                .filter(
                  (value, index, values) => values.indexOf(value) === index,
                )
                .join(", ")}
            </p>
          )}
          {source.urls.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-h-11 w-fit py-3 text-link underline"
            >
              Source page{source.urls.length > 1 ? ` ${i + 1}` : ""} (opens a
              new tab)
            </a>
          ))}
          {source.transformations.map((value) => (
            <p key={value}>{value}</p>
          ))}
          <p>Confidence: Not provided</p>
        </>
      )}
    </div>
  );
}
