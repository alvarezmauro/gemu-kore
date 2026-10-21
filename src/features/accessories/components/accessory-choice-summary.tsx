import type { AccessoryChoice, VariantChoice } from "../copy-contracts";
export function AccessoryChoiceSummary({
  accessory,
  variant,
}: {
  accessory: AccessoryChoice;
  variant: VariantChoice;
}) {
  return (
    <section
      aria-label="Selected accessory"
      className="min-w-0 space-y-3 rounded-xl bg-muted p-4 [overflow-wrap:anywhere]"
    >
      <h3 className="font-medium">
        {accessory.name} · {variant.name}
      </h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Producer</dt>
          <dd>{variant.producer ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Model / color / edition</dt>
          <dd>
            {[variant.modelNumber, variant.color, variant.edition]
              .filter(Boolean)
              .join(" · ") || "Unknown"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Commercial markets</dt>
          <dd>{variant.markets.map((m) => m.name).join(", ") || "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Release year</dt>
          <dd>{variant.year ?? "Unknown"}</dd>
        </div>
      </dl>
      <div>
        <p className="text-sm text-muted-foreground">Platform compatibility</p>
        {variant.platforms.length ? (
          <ul className="mt-1 space-y-1 text-sm">
            {variant.platforms.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.archived ? " (archived)" : ""}
                {p.note ? ` — ${p.note}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">Not recorded</p>
        )}
      </div>
      {variant.identificationStatus === "INCOMPLETE" && (
        <p className="text-sm">
          Catalog identification is incomplete. Record uncertainty in your
          observed markings.
        </p>
      )}
      {(accessory.archived || variant.archived) && (
        <p className="text-sm">
          Archived catalog identity. This existing copy remains available.
        </p>
      )}
    </section>
  );
}
