import type { PublicDetail } from "../contracts";

export function PublicProjection({ item }: { item: PublicDetail }) {
  return (
    <div className="space-y-4 [overflow-wrap:anywhere]">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Public text preview · {item.type.toLowerCase()}
      </p>
      <h3 className="font-heading text-2xl">{item.title}</h3>
      <p className="text-muted-foreground">{item.context}</p>
      {item.description && (
        <p className="whitespace-pre-wrap">{item.description}</p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        {item.facts.map((fact, i) => (
          <div key={`${fact.label}-${i}`}>
            <dt className="text-sm text-muted-foreground">{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-sm text-muted-foreground">Box</dt>
          <dd>
            {item.hasBox === null
              ? "Unknown"
              : item.hasBox
                ? "Included"
                : "Not included"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Identification</dt>
          <dd>
            {item.identificationStatus === "CONFIRMED"
              ? "Confirmed"
              : "Incomplete"}
          </dd>
        </div>
        {"serialNumber" in item && (
          <div>
            <dt className="text-sm text-muted-foreground">Serial number</dt>
            <dd>{item.serialNumber || "Not recorded"}</dd>
          </div>
        )}
        {"notes" in item && (
          <div>
            <dt className="text-sm text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">
              {item.notes || "Not recorded"}
            </dd>
          </div>
        )}
        {"location" in item && (
          <div>
            <dt className="text-sm text-muted-foreground">Location</dt>
            <dd>
              {item.location?.breadcrumb.join(" / ") || "Not recorded"}
              {item.location && ` (${item.location.type})`}
            </dd>
          </div>
        )}
      </dl>
      {item.markets.length > 0 && <p>Markets: {item.markets.join(", ")}</p>}
      {item.defects && (
        <div>
          <h4 className="font-medium">Defects</h4>
          {item.defects.items.length === 0 ? (
            <p>None recorded.</p>
          ) : (
            <ul className="space-y-3">
              {item.defects.items.map((defect, i) => (
                <li key={i}>
                  <p>
                    {defect.title} · {defect.severity} · {defect.status}
                  </p>
                  {defect.description && (
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {defect.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {item.defects.hasMore && <p>More defects are recorded.</p>}
        </div>
      )}
      {item.relatedTruncated && (
        <p className="text-sm text-muted-foreground">
          Some related information is omitted from this preview.
        </p>
      )}
      <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        No photos or 3D files are included. Serial numbers, locations, notes and
        defects are only included when allowed by the visibility settings. This
        preview is private. Sharing a copy requires its approval and an open
        public collection.
      </p>
    </div>
  );
}
