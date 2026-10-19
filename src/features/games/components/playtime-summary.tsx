import {
  formatPlaytime,
  type PlaytimeSet,
  type Playtime,
} from "../playtime-validation";
export function PlaytimeSummary({
  estimates,
}: {
  estimates: PlaytimeSet | Playtime | null;
}) {
  if (!estimates)
    return (
      <p className="text-sm text-muted-foreground">
        No playtime estimates recorded.
      </p>
    );
  return (
    <div className="space-y-4 [overflow-wrap:anywhere]">
      <dl className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["Main story", estimates.mainMinutes],
            ["Main + extras", estimates.mainExtrasMinutes],
            ["Completionist", estimates.completionistMinutes],
          ] as const
        ).map(([label, minutes]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-medium">
              {formatPlaytime(minutes)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">
        {estimates.sourceType === "MANUAL"
          ? "Manual estimate"
          : "External source estimate"}{" "}
        · {estimates.sourceName}
      </p>
      {estimates.sourceUrl && (
        <p className="text-sm">
          <a
            href={estimates.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link underline underline-offset-4"
          >
            Playtime source
          </a>
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Recorded:{" "}
        <time className="whitespace-nowrap" dateTime={estimates.observedAt}>
          {estimates.observedAt.slice(0, 10)}
        </time>
        {"updatedAt" in estimates && (
          <>
            {" "}
            · Updated:{" "}
            <time className="whitespace-nowrap" dateTime={estimates.updatedAt}>
              {estimates.updatedAt.slice(0, 10)}
            </time>
          </>
        )}
      </p>
    </div>
  );
}
