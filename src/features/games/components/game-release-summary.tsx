import type { ReleaseChoice } from "../creation-contracts";
export function GameReleaseSummary({ release }: { release: ReleaseChoice }) {
  return (
    <section
      aria-label="Selected release"
      className="space-y-3 rounded-xl bg-card p-5 [overflow-wrap:anywhere]"
    >
      <h3 className="font-heading text-xl">{release.name}</h3>
      <p className="text-sm text-muted-foreground">
        {release.slug}
        {release.printingLabel ? ` · ${release.printingLabel}` : ""}
      </p>
      <p>
        Markets: {release.markets.map((m) => m.name).join(", ") || "Unknown"}
      </p>
      <ul className="space-y-1 text-sm">
        {release.markets.map((m) => (
          <li key={m.id}>
            {m.name}:{" "}
            {m.year
              ? [
                  m.year,
                  m.month && String(m.month).padStart(2, "0"),
                  m.day && String(m.day).padStart(2, "0"),
                ]
                  .filter(Boolean)
                  .join("-")
              : "Date unknown"}
          </li>
        ))}
      </ul>
      <p className="text-sm">
        Languages: {release.languages.join(", ") || "Unknown"}
      </p>
      <p className="text-sm">
        Region lock:{" "}
        {release.regionLock?.toLowerCase().replaceAll("_", " ") ?? "Unknown"}
        {release.regionLockNote ? ` · ${release.regionLockNote}` : ""}
      </p>
      {release.identificationStatus === "INCOMPLETE" && (
        <p className="text-sm">
          Catalog identity incomplete. Record any uncertainty in your copy’s
          observed markings.
        </p>
      )}
      {release.description && (
        <p className="whitespace-pre-wrap text-sm">{release.description}</p>
      )}
      <div>
        <h4 className="font-medium">Expected edition contents</h4>
        <p className="text-sm text-muted-foreground">
          These describe the release. They do not confirm what your copy
          contains.
        </p>
        {release.components.length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {release.components.map((c, i) => (
              <li key={i}>
                {c.quantity} × {c.name} · {c.kind.toLowerCase()}
                {c.description && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {c.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">Not recorded</p>
        )}
      </div>
    </section>
  );
}
