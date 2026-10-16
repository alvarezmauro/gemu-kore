export function ModelLoading({
  phase,
  percent,
}: {
  phase: "download" | "prepare" | "start";
  percent: number;
}) {
  return (
    <div className="space-y-2">
      <p role="status" className="text-sm text-muted-foreground">
        {phase === "download"
          ? "Downloading 3D model…"
          : phase === "prepare"
            ? "Preparing 3D model…"
            : "Starting 3D display…"}
      </p>
      {phase === "download" && (
        <progress
          aria-label="Downloading 3D model"
          value={percent}
          max={100}
          className="h-2 w-full accent-primary"
        />
      )}
    </div>
  );
}
